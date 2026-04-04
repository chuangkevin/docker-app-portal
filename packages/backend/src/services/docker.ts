import Docker from 'dockerode';
import { eq, lt, and, sql } from 'drizzle-orm';
import type { DrizzleDb } from '../db/index';
import { services, user_pins } from '../db/schema';
import type { GeminiService } from './gemini';

export interface ContainerInfo {
  container_id: string;
  name: string;
  image: string;
  ports: { public: number; private: number; type: string }[];
  labels: Record<string, string>;
}

export class DockerService {
  private docker: Docker;
  private db: DrizzleDb;
  private geminiService: GeminiService;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(db: DrizzleDb, geminiService: GeminiService) {
    this.db = db;
    this.geminiService = geminiService;
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
  }

  async scanContainers(): Promise<ContainerInfo[]> {
    const containers = await this.docker.listContainers({ all: false });

    return containers.map((container) => {
      const name = (container.Names?.[0] || '').replace(/^\//, '');
      const image = container.Image || '';
      const ports = (container.Ports || []).map((p) => ({
        public: p.PublicPort || 0,
        private: p.PrivatePort || 0,
        type: p.Type || 'tcp',
      }));
      const labels = container.Labels || {};

      return {
        container_id: container.Id,
        name,
        image,
        ports,
        labels,
      };
    });
  }

  async syncToDb(): Promise<void> {
    const scanTime = Date.now();
    const containers = await this.scanContainers();

    for (const container of containers) {
      // Clear stale container_id references to avoid UNIQUE constraint violations
      // (happens when containers are recreated and get new IDs)
      await this.db
        .update(services)
        .set({ container_id: `stale-${Date.now()}-${Math.random().toString(36).slice(2)}` })
        .where(
          and(
            eq(services.container_id, container.container_id),
            // Only clear if it's a different service name (same name will be updated below)
            sql`${services.name} != ${container.name}`,
          ),
        );

      // Match by container name (stable across recreations) instead of container_id
      const duplicates = await this.db
        .select()
        .from(services)
        .where(eq(services.name, container.name));

      if (duplicates.length === 0) {
        await this.db.insert(services).values({
          container_id: container.container_id,
          name: container.name,
          image: container.image,
          ports: JSON.stringify(container.ports),
          labels: JSON.stringify(container.labels),
          status: 'online',
          last_seen_at: scanTime,
        });
      } else {
        // Pick the best record to keep: prefer one with display_name or custom_description
        const keeper = duplicates.reduce((best, cur) => {
          const bestScore = (best.display_name ? 2 : 0) + (best.custom_description ? 1 : 0) + (best.ai_description ? 0.5 : 0);
          const curScore = (cur.display_name ? 2 : 0) + (cur.custom_description ? 1 : 0) + (cur.ai_description ? 0.5 : 0);
          return curScore > bestScore ? cur : best;
        });

        // Merge metadata from all duplicates into keeper, then delete zombies BEFORE updating keeper
        // (zombies may hold the new container_id, causing UNIQUE constraint violation if not removed first)
        const zombies = duplicates.filter((d) => d.id !== keeper.id);
        for (const zombie of zombies) {
          const mergePayload: Record<string, string> = {};
          if (!keeper.display_name && zombie.display_name) {
            mergePayload.display_name = zombie.display_name;
            keeper.display_name = zombie.display_name;
          }
          if (!keeper.custom_description && zombie.custom_description) {
            mergePayload.custom_description = zombie.custom_description;
            keeper.custom_description = zombie.custom_description;
          }
          if (!keeper.ai_description && zombie.ai_description) {
            mergePayload.ai_description = zombie.ai_description;
            keeper.ai_description = zombie.ai_description;
          }
          if (Object.keys(mergePayload).length > 0) {
            await this.db
              .update(services)
              .set(mergePayload)
              .where(eq(services.id, keeper.id));
            console.log(`Merged metadata from zombie ${zombie.id} into keeper ${keeper.id} for "${container.name}"`);
          }

          // Migrate pins from zombie to keeper before deleting
          const zombiePins = await this.db.select().from(user_pins).where(eq(user_pins.service_id, zombie.id));
          for (const pin of zombiePins) {
            const existingPin = await this.db.select().from(user_pins)
              .where(and(eq(user_pins.user_id, pin.user_id), eq(user_pins.service_id, keeper.id)))
              .limit(1);
            if (existingPin.length === 0) {
              await this.db.insert(user_pins).values({ user_id: pin.user_id, service_id: keeper.id });
            }
          }
          await this.db.delete(user_pins).where(eq(user_pins.service_id, zombie.id));
          await this.db.delete(services).where(eq(services.id, zombie.id));
        }

        if (zombies.length > 0) {
          console.log(`Merged ${zombies.length} duplicate(s) for service "${container.name}"`);
        }

        // Update the keeper with current container info (safe now that zombies are removed)
        await this.db
          .update(services)
          .set({
            container_id: container.container_id,
            image: container.image,
            ports: JSON.stringify(container.ports),
            labels: JSON.stringify(container.labels),
            status: 'online',
            last_seen_at: scanTime,
          })
          .where(eq(services.id, keeper.id));
      }
    }

    // Mark containers not seen in this scan as offline
    await this.db
      .update(services)
      .set({ status: 'offline' })
      .where(lt(services.last_seen_at, scanTime));

    // Clean up services offline for more than 24 hours
    const oneDayAgo = scanTime - 24 * 60 * 60 * 1000;
    const staleServices = await this.db
      .select({ id: services.id })
      .from(services)
      .where(and(eq(services.status, 'offline'), lt(services.last_seen_at, oneDayAgo)));

    for (const stale of staleServices) {
      await this.db.delete(user_pins).where(eq(user_pins.service_id, stale.id));
      await this.db.delete(services).where(eq(services.id, stale.id));
    }

    if (staleServices.length > 0) {
      console.log(`Cleaned up ${staleServices.length} stale offline services`);
    }

    // Generate AI descriptions for services that don't have one
    const needsDescription = await this.db
      .select()
      .from(services)
      .where(eq(services.status, 'online'));

    for (const service of needsDescription) {
      if (service.ai_description === null) {
        try {
          await this.geminiService.generateDescription(service);
        } catch (err) {
          // Log but don't fail the scan
          console.error(
            `Failed to generate description for ${service.name}:`,
            err,
          );
        }
      }
    }
  }

  startScheduler(interval: number = 30000): void {
    // Run immediately
    this.syncToDb().catch((err) => {
      console.error('Docker scan failed:', err);
    });

    // Schedule periodic scans
    this.intervalId = setInterval(() => {
      this.syncToDb().catch((err) => {
        console.error('Docker scan failed:', err);
      });
    }, interval);
  }

  stopScheduler(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
