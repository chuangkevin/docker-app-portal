import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, isNull } from 'drizzle-orm';
import type { DrizzleDb } from '../db/index';
import { services, user_pins, admin_service_overrides, user_service_prefs } from '../db/schema';
import { GeminiService } from '../services/gemini';
import type { CaddyfileService } from '../services/caddyfile';

const updateServiceSchema = z.object({
  custom_description: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  open_in_browser: z.union([z.literal(0), z.literal(1)]).optional(),
});

function scoreServiceRecord(service: {
  status: 'online' | 'offline';
  display_name: string | null;
  custom_description: string | null;
  ai_description: string | null;
  open_in_browser: number;
}): number {
  return (service.status === 'online' ? 10 : 0)
    + (service.display_name ? 4 : 0)
    + (service.custom_description ? 2 : 0)
    + (service.ai_description ? 1 : 0);
}

function mergeDomainDuplicate<T extends {
  status: 'online' | 'offline';
  display_name: string | null;
  custom_description: string | null;
  ai_description: string | null;
  open_in_browser: number;
}>(existing: T, incoming: T): T {
  const existingScore = scoreServiceRecord(existing);
  const incomingScore = scoreServiceRecord(incoming);
  const winner = incomingScore > existingScore ? { ...incoming } : { ...existing };
  const loser = incomingScore > existingScore ? existing : incoming;

  if (!winner.display_name && loser.display_name) {
    winner.display_name = loser.display_name;
  }
  if (!winner.custom_description && loser.custom_description) {
    winner.custom_description = loser.custom_description;
  }
  if (!winner.ai_description && loser.ai_description) {
    winner.ai_description = loser.ai_description;
  }
  if (!winner.open_in_browser && loser.open_in_browser) {
    winner.open_in_browser = loser.open_in_browser;
  }

  return winner;
}

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

      // Get globally hidden services
      const overrides = await db
        .select()
        .from(admin_service_overrides)
        .where(eq(admin_service_overrides.is_force_hidden, 1));
      const hiddenServiceIds = new Set(
        overrides
          .filter((o) => o.target_user_id === null) // global overrides only
          .map((o) => o.service_id)
      );

      // Get user-hidden services
      const userPrefs = await db
        .select()
        .from(user_service_prefs)
        .where(
          and(
            eq(user_service_prefs.user_id, userId),
            eq(user_service_prefs.is_hidden, 1),
          ),
        );
      const userHiddenServiceIds = new Set(userPrefs.map((p) => p.service_id));

      // Filter out admin-hidden and user-hidden services, include both online and offline
      const servicesWithDomain = allServices
        .filter((s) => !hiddenServiceIds.has(s.id) && !userHiddenServiceIds.has(s.id))
        .map((s) => {
          const domain = getDomainForService(s.ports);
          if (!domain) return null;
          return { ...s, domain };
        })
        .filter(Boolean) as (typeof allServices[number] & { domain: string })[];

      // Deduplicate by domain, but keep metadata from duplicates so custom titles remain searchable.
      const domainMap = new Map<string, typeof servicesWithDomain[number]>();
      for (const s of servicesWithDomain) {
        const existing = domainMap.get(s.domain);
        if (!existing) {
          domainMap.set(s.domain, s);
          continue;
        }
        domainMap.set(s.domain, mergeDomainDuplicate(existing, s));
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
        open_in_browser: s.open_in_browser === 1,
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

      // Get global hidden overrides
      const overrides = await db
        .select()
        .from(admin_service_overrides)
        .where(eq(admin_service_overrides.is_force_hidden, 1));
      const hiddenServiceIds = new Set(
        overrides
          .filter((o) => o.target_user_id === null)
          .map((o) => o.service_id)
      );

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
          is_hidden: hiddenServiceIds.has(s.id),
          open_in_browser: s.open_in_browser === 1,
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

  // POST /api/services/:id/prefs - set user preference (is_hidden)
  fastify.post<{ Params: { id: string } }>(
    '/api/services/:id/prefs',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const serviceId = parseInt(request.params.id, 10);
      if (isNaN(serviceId)) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid service id' });
      }

      const userId = request.user.userId;
      const body = request.body as { is_hidden?: boolean };

      if (body.is_hidden === undefined || typeof body.is_hidden !== 'boolean') {
        return reply.status(400).send({ error: 'Bad Request', message: 'is_hidden (boolean) is required' });
      }

      // Check service exists
      const svc = await db
        .select()
        .from(services)
        .where(eq(services.id, serviceId))
        .limit(1);

      if (!svc.length) {
        return reply.status(404).send({ error: 'Not Found', message: 'Service not found' });
      }

      const isHiddenInt = body.is_hidden ? 1 : 0;

      // Upsert: check if pref exists
      const existing = await db
        .select()
        .from(user_service_prefs)
        .where(
          and(
            eq(user_service_prefs.user_id, userId),
            eq(user_service_prefs.service_id, serviceId),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(user_service_prefs)
          .set({ is_hidden: isHiddenInt })
          .where(eq(user_service_prefs.id, existing[0].id));
      } else {
        await db.insert(user_service_prefs).values({
          user_id: userId,
          service_id: serviceId,
          is_hidden: isHiddenInt,
        });
      }

      return reply.send({ success: true, is_hidden: body.is_hidden });
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

      const updatePayload: {
        custom_description?: string | null;
        display_name?: string | null;
        open_in_browser?: number;
      } = {};
      if (body.custom_description !== undefined) {
        updatePayload.custom_description = body.custom_description;
      }
      if (body.display_name !== undefined) {
        updatePayload.display_name = body.display_name;
      }
      if (body.open_in_browser !== undefined) {
        updatePayload.open_in_browser = body.open_in_browser;
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

  // POST /api/services/:id/visibility - admin only, toggle global visibility
  fastify.post<{ Params: { id: string }; Body: { is_hidden: boolean } }>(
    '/api/services/:id/visibility',
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

      const body = request.body as { is_hidden: boolean };
      const shouldHide = body.is_hidden;

      // Remove existing global override for this service
      await db
        .delete(admin_service_overrides)
        .where(
          and(
            eq(admin_service_overrides.service_id, serviceId),
            isNull(admin_service_overrides.target_user_id),
          ),
        );

      // If hiding, insert a new override
      if (shouldHide) {
        await db.insert(admin_service_overrides).values({
          service_id: serviceId,
          target_user_id: null,
          is_force_hidden: 1,
        });
      }

      return reply.send({ success: true, is_hidden: shouldHide });
    },
  );
};

export default servicesRoute;
