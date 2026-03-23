import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import type { DrizzleDb } from '../db/index';
import {
  services,
  pages,
  service_page_assignments,
  user_service_prefs,
  admin_service_overrides,
} from '../db/schema';
import { GeminiService } from '../services/gemini';

const prefsSchema = z.object({
  is_hidden: z.union([z.literal(0), z.literal(1)]).optional(),
  preferred_port: z.number().int().positive().nullable().optional(),
});

const updateServiceSchema = z.object({
  custom_description: z.string().nullable().optional(),
});

const servicesRoute: FastifyPluginAsync<{ db: DrizzleDb }> = async (fastify, opts) => {
  const db = opts.db;
  const geminiService = new GeminiService(db);

  // GET /api/services - list visible services for current user
  fastify.get(
    '/api/services',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const userId = request.user.userId;

      // 1. Get all services
      const allServices = await db.select().from(services);

      // 2. Get admin overrides: global (target_user_id IS NULL) or for this user
      const overrides = await db
        .select()
        .from(admin_service_overrides);

      const hiddenByOverride = new Set<number>();
      for (const ov of overrides) {
        if (ov.is_force_hidden === 1) {
          if (ov.target_user_id === null || ov.target_user_id === userId) {
            hiddenByOverride.add(ov.service_id);
          }
        }
      }

      // 3. Get user prefs
      const prefs = await db
        .select()
        .from(user_service_prefs)
        .where(eq(user_service_prefs.user_id, userId));

      const hiddenByUser = new Set(
        prefs.filter((p: { is_hidden: number }) => p.is_hidden === 1).map((p: { service_id: number }) => p.service_id),
      );
      const preferredPortMap = new Map<number, number | null>(
        prefs.filter((p: { preferred_port: number | null }) => p.preferred_port != null).map((p: { service_id: number; preferred_port: number | null }) => [p.service_id, p.preferred_port]),
      );

      // 4. Filter services: exclude admin-hidden, user-hidden, and services without ports
      const visibleServices = allServices.filter((s) => {
        if (hiddenByOverride.has(s.id) || hiddenByUser.has(s.id)) return false;
        const ports = JSON.parse(s.ports);
        return Array.isArray(ports) && ports.length > 0;
      });

      // 5. Get page assignments for visible services
      const serviceIds = visibleServices.map((s) => s.id);
      let assignments: Array<{
        service_id: number;
        page_id: number;
        order: number;
      }> = [];
      if (serviceIds.length > 0) {
        assignments = await db
          .select({
            service_id: service_page_assignments.service_id,
            page_id: service_page_assignments.page_id,
            order: service_page_assignments.order,
          })
          .from(service_page_assignments)
          .where(inArray(service_page_assignments.service_id, serviceIds));
      }

      const allPages = await db.select().from(pages);
      const pageMap = new Map(allPages.map((p) => [p.id, p]));

      // Build response
      const result = visibleServices.map((s) => {
        const serviceAssignments = assignments.filter(
          (a) => a.service_id === s.id,
        );
        const servicePages = serviceAssignments
          .map((a) => {
            const page = pageMap.get(a.page_id);
            return page ? { id: page.id, name: page.name, slug: page.slug } : null;
          })
          .filter(Boolean);

        return {
          id: s.id,
          container_id: s.container_id,
          name: s.name,
          image: s.image,
          ports: JSON.parse(s.ports),
          status: s.status,
          description: s.custom_description || s.ai_description || null,
          preferred_port: preferredPortMap.get(s.id) ?? null,
          pages: servicePages,
        };
      });

      return reply.send(result);
    },
  );

  // GET /api/services/settings - all non-admin-hidden services with is_hidden flag for settings page
  fastify.get(
    '/api/services/settings',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const userId = request.user.userId;

      // 1. Get all services
      const allServices = await db.select().from(services);

      // 2. Get admin overrides (force-hidden services are excluded entirely)
      const overrides = await db.select().from(admin_service_overrides);
      const hiddenByOverride = new Set<number>();
      for (const ov of overrides) {
        if (ov.is_force_hidden === 1) {
          if (ov.target_user_id === null || ov.target_user_id === userId) {
            hiddenByOverride.add(ov.service_id);
          }
        }
      }

      // 3. Get user prefs (to include is_hidden flag)
      const prefs = await db
        .select()
        .from(user_service_prefs)
        .where(eq(user_service_prefs.user_id, userId));

      const hiddenByUser = new Set(
        prefs.filter((p) => p.is_hidden === 1).map((p) => p.service_id),
      );
      const settingsPreferredPortMap = new Map<number, number | null>(
        prefs.filter((p) => p.preferred_port != null).map((p) => [p.service_id, p.preferred_port]),
      );

      // 4. Return all services NOT hidden by admin, with is_hidden flag
      const settingsServices = allServices
        .filter((s) => !hiddenByOverride.has(s.id))
        .map((s) => ({
          id: s.id,
          container_id: s.container_id,
          name: s.name,
          image: s.image,
          ports: JSON.parse(s.ports),
          status: s.status,
          description: s.custom_description || s.ai_description || null,
          custom_description: s.custom_description,
          ai_description: s.ai_description,
          is_hidden: hiddenByUser.has(s.id) ? 1 : 0,
          preferred_port: settingsPreferredPortMap.get(s.id) ?? null,
        }));

      return reply.send(settingsServices);
    },
  );

  // GET /api/services/all - admin only, all services with full visibility info
  fastify.get(
    '/api/services/all',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (_request, reply) => {
      const allServices = await db.select().from(services);

      const allAssignments = await db
        .select()
        .from(service_page_assignments);

      const allPages = await db.select().from(pages);
      const pageMap = new Map(allPages.map((p) => [p.id, p]));

      const allOverrides = await db.select().from(admin_service_overrides);
      const allPrefs = await db.select().from(user_service_prefs);

      const result = allServices.map((s) => {
        const serviceAssignments = allAssignments.filter(
          (a) => a.service_id === s.id,
        );
        const servicePages = serviceAssignments
          .map((a) => {
            const page = pageMap.get(a.page_id);
            return page ? { id: page.id, name: page.name, slug: page.slug } : null;
          })
          .filter(Boolean);

        const serviceOverrides = allOverrides.filter(
          (o) => o.service_id === s.id,
        );
        const servicePrefs = allPrefs.filter((p) => p.service_id === s.id);

        return {
          id: s.id,
          container_id: s.container_id,
          name: s.name,
          image: s.image,
          ports: JSON.parse(s.ports),
          status: s.status,
          ai_description: s.ai_description,
          custom_description: s.custom_description,
          description: s.custom_description || s.ai_description || null,
          last_seen_at: s.last_seen_at,
          pages: servicePages,
          overrides: serviceOverrides,
          user_prefs: servicePrefs,
        };
      });

      return reply.send(result);
    },
  );

  // PATCH /api/services/:id/prefs - update user preference
  fastify.patch<{ Params: { id: string } }>(
    '/api/services/:id/prefs',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const serviceId = parseInt(request.params.id, 10);
      if (isNaN(serviceId)) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid service id' });
      }

      let body: z.infer<typeof prefsSchema>;
      try {
        body = prefsSchema.parse(request.body);
      } catch {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid prefs payload' });
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

      // Build update payload from provided fields
      const updatePayload: { is_hidden?: 0 | 1; preferred_port?: number | null } = {};
      if (body.is_hidden !== undefined) updatePayload.is_hidden = body.is_hidden;
      if (body.preferred_port !== undefined) updatePayload.preferred_port = body.preferred_port;

      // Upsert user_service_prefs
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
          .set(updatePayload)
          .where(eq(user_service_prefs.id, existing[0].id));
      } else {
        await db.insert(user_service_prefs).values({
          user_id: userId,
          service_id: serviceId,
          is_hidden: body.is_hidden ?? 0,
          preferred_port: body.preferred_port ?? null,
        });
      }

      return reply.send({ success: true });
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

  // PATCH /api/services/:id - admin only, update custom_description
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

      if (body.custom_description !== undefined) {
        await db
          .update(services)
          .set({ custom_description: body.custom_description })
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
};

export default servicesRoute;
