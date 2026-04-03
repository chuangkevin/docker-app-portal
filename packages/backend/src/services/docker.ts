import Docker from 'dockerode';
import { eq, lt, and } from 'drizzle-orm';
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

        // Update the keeper with current container info
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

        // Delete zombie duplicates
        const zombieIds = duplicates.filter((d) => d.id !== keeper.id).map((d) => d.id);
        for (const zombieId of zombieIds) {
          // Delete zombie's pins
          await this.db.delete(user_pins).where(eq(user_pins.service_id, zombieId));
          await this.db.delete(services).where(eq(services.id, zombieId));
        }

        if (zombieIds.length > 0) {
          console.log(`Merged ${zombieIds.length} duplicate(s) for service "${container.name}"`);
        }
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
