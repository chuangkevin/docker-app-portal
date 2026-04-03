import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import type { DrizzleDb } from '../db/index';
import { services, user_pins } from '../db/schema';
import { GeminiService } from '../services/gemini';
import type { CaddyfileService } from '../services/caddyfile';

const updateServiceSchema = z.object({
  custom_description: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
});

const servicesRoute: FastifyPluginAsync<{ db: DrizzleDb; caddyfileService: CaddyfileService }> = async (fastify, opts) => {
  const db = opts.db;
  const caddyfileService = opts.caddyfileService;
  const geminiService = new GeminiService(db);

  // Helper: get public ports from a service's port JSON
  function getPublicPorts(portsJson: string): number[] {
    try {
      const ports = JSON.parse(portsJson);
      if (!Array.isArray(ports)) return [];
      return ports
        .filter((p: { public: number }) => p.public > 0)
        .map((p: { public: number }) => p.public);
    } catch {
      return [];
    }
  }

  // Helper: find domain for a service based on its ports
  function getDomainForService(portsJson: string): string | null {
    const publicPorts = getPublicPorts(portsJson);
    for (const port of publicPorts) {
      const domain = caddyfileService.getDomainForPort(port);
      if (domain) return domain;
    }
    return null;
  }

  // GET /api/services - list services that have domain bindings (for current user)
  fastify.get(
    '/api/services',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const userId = request.user.userId;

      const allServices = await db.select().from(services);

      // Get user pins
      const pins = await db
        .select()
        .from(user_pins)
        .where(eq(user_pins.user_id, userId));
      const pinnedServiceIds = new Set(pins.map((p) => p.service_id));

      // Filter to only online services with a domain binding, deduplicate by domain
      const servicesWithDomain = allServices
        .filter((s) => s.status === 'online')
        .map((s) => {
          const domain = getDomainForService(s.ports);
          if (!domain) return null;
          return { ...s, domain };
        })
        .filter(Boolean) as (typeof allServices[number] & { domain: string })[];

      // Deduplicate: keep best record per domain (prefer online + display_name + custom_description)
      const domainMap = new Map<string, typeof servicesWithDomain[number]>();
      for (const s of servicesWithDomain) {
        const existing = domainMap.get(s.domain);
        if (!existing) {
          domainMap.set(s.domain, s);
          continue;
        }
        const scoreExisting = (existing.status === 'online' ? 10 : 0) + (existing.display_name ? 4 : 0) + (existing.custom_description ? 2 : 0) + (existing.ai_description ? 1 : 0);
        const scoreNew = (s.status === 'online' ? 10 : 0) + (s.display_name ? 4 : 0) + (s.custom_description ? 2 : 0) + (s.ai_description ? 1 : 0);
        if (scoreNew > scoreExisting) {
          domainMap.set(s.domain, s);
        }
      }

      const result = Array.from(domainMap.values()).map((s) => ({
        id: s.id,
        container_id: s.container_id,
        name: s.name,
        display_name: s.display_name,
        image: s.image,
        ports: JSON.parse(s.ports),
        status: s.status,
        description: s.custom_description || s.ai_description || null,
        ai_description: s.ai_description,
        custom_description: s.custom_description,
        domain: s.domain,
        is_pinned: pinnedServiceIds.has(s.id),
      }));

      return reply.send(result);
    },
  );

  // GET /api/services/all - admin only, returns ALL services with domain info
  fastify.get(
    '/api/services/all',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (_request, reply) => {
      const allServices = await db.select().from(services);

      const result = allServices.map((s) => {
        const domain = getDomainForService(s.ports);

        return {
          id: s.id,
          container_id: s.container_id,
          name: s.name,
          display_name: s.display_name,
          image: s.image,
          ports: JSON.parse(s.ports),
          status: s.status,
          ai_description: s.ai_description,
          custom_description: s.custom_description,
          description: s.custom_description || s.ai_description || null,
          last_seen_at: s.last_seen_at,
          domain,
        };
      });

      return reply.send(result);
    },
  );

  // POST /api/services/:id/pin - pin a service for current user
  fastify.post<{ Params: { id: string } }>(
    '/api/services/:id/pin',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const serviceId = parseInt(request.params.id, 10);
      if (isNaN(serviceId)) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid service id' });
      }

      const userId = request.user.userId;

      // Check service exists
      const svc = await db
        .select()
        .from(services)
        .where(eq(services.id, serviceId))
        .limit(1);

      if (!svc.length) {
        return reply.status(404).send({ error: 'Not Found', message: 'Service not found' });
      }

      // Check if already pinned
      const existing = await db
        .select()
        .from(user_pins)
        .where(
          and(
            eq(user_pins.user_id, userId),
            eq(user_pins.service_id, serviceId),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(user_pins).values({
          user_id: userId,
          service_id: serviceId,
        });
      }

      return reply.send({ success: true });
    },
  );

  // DELETE /api/services/:id/pin - unpin a service for current user
  fastify.delete<{ Params: { id: string } }>(
    '/api/services/:id/pin',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const serviceId = parseInt(request.params.id, 10);
      if (isNaN(serviceId)) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid service id' });
      }

      const userId = request.user.userId;

      await db
        .delete(user_pins)
        .where(
          and(
            eq(user_pins.user_id, userId),
            eq(user_pins.service_id, serviceId),
          ),
        );

      return reply.send({ success: true });
    },
  );

  // PATCH /api/services/:id - admin only, update display_name/custom_description
  fastify.patch<{ Params: { id: string } }>(
    '/api/services/:id',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (request, reply) => {
      const serviceId = parseInt(request.params.id, 10);
      if (isNaN(serviceId)) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid service id' });
      }

      let body: z.infer<typeof updateServiceSchema>;
      try {
        body = updateServiceSchema.parse(request.body);
      } catch {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid request body' });
      }

      const svc = await db
        .select()
        .from(services)
        .where(eq(services.id, serviceId))
        .limit(1);

      if (!svc.length) {
        return reply.status(404).send({ error: 'Not Found', message: 'Service not found' });
      }

      const updatePayload: { custom_description?: string | null; display_name?: string | null } = {};
      if (body.custom_description !== undefined) {
        updatePayload.custom_description = body.custom_description;
      }
      if (body.display_name !== undefined) {
        updatePayload.display_name = body.display_name;
      }
      if (Object.keys(updatePayload).length > 0) {
        await db
          .update(services)
          .set(updatePayload)
          .where(eq(services.id, serviceId));
      }

      const updated = await db
        .select()
        .from(services)
        .where(eq(services.id, serviceId))
        .limit(1);

      return reply.send(updated[0]);
    },
  );

  // POST /api/services/:id/regenerate-description - admin only
  fastify.post<{ Params: { id: string } }>(
    '/api/services/:id/regenerate-description',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (request, reply) => {
      const serviceId = parseInt(request.params.id, 10);
      if (isNaN(serviceId)) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid service id' });
      }

      const svc = await db
        .select()
        .from(services)
        .where(eq(services.id, serviceId))
        .limit(1);

      if (!svc.length) {
        return reply.status(404).send({ error: 'Not Found', message: 'Service not found' });
      }

      // Clear existing ai_description
      await db
        .update(services)
        .set({ ai_description: null })
        .where(eq(services.id, serviceId));

      // Re-fetch the service with cleared description
      const updated = await db
        .select()
        .from(services)
        .where(eq(services.id, serviceId))
        .limit(1);

      // Trigger regeneration
      try {
        await geminiService.generateDescription(updated[0]);
      } catch (err) {
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to generate description',
        });
      }

      // Fetch final state
      const final = await db
        .select()
        .from(services)
        .where(eq(services.id, serviceId))
        .limit(1);

      return reply.send({
        id: final[0].id,
        ai_description: final[0].ai_description,
      });
    },
  );
};

export default servicesRoute;
