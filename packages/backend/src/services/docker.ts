import Docker from 'dockerode';
import { eq, lt, and, sql } from 'drizzle-orm';
import type { DrizzleDb } from '../db/index';
import { services, service_page_assignments, user_service_prefs, admin_service_overrides } from '../db/schema';
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
      const existing = await this.db
        .select()
        .from(services)
        .where(eq(services.name, container.name))
        .limit(1);

      if (existing.length === 0) {
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
        // Update container_id + metadata, preserving display_name, descriptions, etc.
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
          .where(eq(services.name, container.name));
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
      await this.db.delete(service_page_assignments).where(eq(service_page_assignments.service_id, stale.id));
      await this.db.delete(user_service_prefs).where(eq(user_service_prefs.service_id, stale.id));
      await this.db.delete(admin_service_overrides).where(eq(admin_service_overrides.service_id, stale.id));
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
