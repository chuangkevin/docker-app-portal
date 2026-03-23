import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, asc } from 'drizzle-orm';
import type { DrizzleDb } from '../db/index';
import {
  pages,
  services,
  service_page_assignments,
} from '../db/schema';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const createPageSchema = z.object({
  name: z.string().min(1).max(100).trim(),
});

const updatePageSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  order: z.number().int().optional(),
});

const setPageServicesSchema = z.object({
  services: z.array(
    z.object({
      service_id: z.number().int(),
      order: z.number().int().default(0),
    }),
  ),
});

const updateAssignmentsSchema = z.object({
  page_ids: z.array(z.number().int()),
});

const pagesRoute: FastifyPluginAsync<{ db: DrizzleDb }> = async (fastify, opts) => {
  const db = opts.db;

  // GET /api/pages - list all pages with services
  fastify.get(
    '/api/pages',
    { preHandler: [fastify.authenticate] },
    async (_request, reply) => {
      const allPages = await db
        .select()
        .from(pages)
        .orderBy(asc(pages.order));

      const allAssignments = await db.select().from(service_page_assignments);
      const allServices = await db.select().from(services);
      const serviceMap = new Map(allServices.map((s) => [s.id, s]));

      const result = allPages.map((page) => {
        const pageAssignments = allAssignments
          .filter((a) => a.page_id === page.id)
          .sort((a, b) => a.order - b.order);

        const pageServices = pageAssignments
          .map((a) => {
            const svc = serviceMap.get(a.service_id);
            if (!svc) return null;
            return {
              id: svc.id,
              container_id: svc.container_id,
              name: svc.name,
              image: svc.image,
              ports: JSON.parse(svc.ports),
              status: svc.status,
              description: svc.custom_description || svc.ai_description || null,
              order: a.order,
            };
          })
          .filter(Boolean);

        return {
          id: page.id,
          name: page.name,
          slug: page.slug,
          order: page.order,
          created_by: page.created_by,
          services: pageServices,
        };
      });

      return reply.send(result);
    },
  );

  // POST /api/pages - create a new page
  fastify.post(
    '/api/pages',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (request, reply) => {
      let body: z.infer<typeof createPageSchema>;
      try {
        body = createPageSchema.parse(request.body);
      } catch {
        return reply.status(400).send({ error: 'Bad Request', message: 'name is required' });
      }

      const slug = slugify(body.name);
      if (!slug) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid name for slug generation' });
      }

      try {
        const result = await db
          .insert(pages)
          .values({
            name: body.name,
            slug,
            created_by: request.user.userId,
          })
          .returning();

        return reply.status(201).send(result[0]);
      } catch (err: any) {
        if (err.message?.includes('UNIQUE constraint failed')) {
          return reply.status(409).send({ error: 'Conflict', message: 'A page with this slug already exists' });
        }
        throw err;
      }
    },
  );

  // PATCH /api/pages/:id - update a page
  fastify.patch<{ Params: { id: string } }>(
    '/api/pages/:id',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (request, reply) => {
      const pageId = parseInt(request.params.id, 10);
      if (isNaN(pageId)) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid page id' });
      }

      let body: z.infer<typeof updatePageSchema>;
      try {
        body = updatePageSchema.parse(request.body);
      } catch {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid request body' });
      }

      const existing = await db
        .select()
        .from(pages)
        .where(eq(pages.id, pageId))
        .limit(1);

      if (!existing.length) {
        return reply.status(404).send({ error: 'Not Found', message: 'Page not found' });
      }

      const updateData: Record<string, unknown> = {};
      if (body.name !== undefined) {
        updateData.name = body.name;
        updateData.slug = slugify(body.name);
      }
      if (body.order !== undefined) {
        updateData.order = body.order;
      }

      if (Object.keys(updateData).length > 0) {
        await db.update(pages).set(updateData).where(eq(pages.id, pageId));
      }

      const updated = await db
        .select()
        .from(pages)
        .where(eq(pages.id, pageId))
        .limit(1);

      return reply.send(updated[0]);
    },
  );

  // DELETE /api/pages/:id - delete page and its assignments
  fastify.delete<{ Params: { id: string } }>(
    '/api/pages/:id',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (request, reply) => {
      const pageId = parseInt(request.params.id, 10);
      if (isNaN(pageId)) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid page id' });
      }

      const existing = await db
        .select()
        .from(pages)
        .where(eq(pages.id, pageId))
        .limit(1);

      if (!existing.length) {
        return reply.status(404).send({ error: 'Not Found', message: 'Page not found' });
      }

      // Delete assignments first
      await db
        .delete(service_page_assignments)
        .where(eq(service_page_assignments.page_id, pageId));

      // Delete page
      await db.delete(pages).where(eq(pages.id, pageId));

      return reply.send({ success: true });
    },
  );

  // PUT /api/pages/:id/services - set services for a page
  fastify.put<{ Params: { id: string } }>(
    '/api/pages/:id/services',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (request, reply) => {
      const pageId = parseInt(request.params.id, 10);
      if (isNaN(pageId)) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid page id' });
      }

      let body: z.infer<typeof setPageServicesSchema>;
      try {
        body = setPageServicesSchema.parse(request.body);
      } catch {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid request body' });
      }

      const existing = await db
        .select()
        .from(pages)
        .where(eq(pages.id, pageId))
        .limit(1);

      if (!existing.length) {
        return reply.status(404).send({ error: 'Not Found', message: 'Page not found' });
      }

      // Clear old assignments
      await db
        .delete(service_page_assignments)
        .where(eq(service_page_assignments.page_id, pageId));

      // Insert new assignments
      if (body.services.length > 0) {
        await db.insert(service_page_assignments).values(
          body.services.map((s) => ({
            service_id: s.service_id,
            page_id: pageId,
            order: s.order,
          })),
        );
      }

      return reply.send({ success: true });
    },
  );

  // PATCH /api/services/:id/assignments - update page assignments for a service
  fastify.patch<{ Params: { id: string } }>(
    '/api/services/:id/assignments',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (request, reply) => {
      const serviceId = parseInt(request.params.id, 10);
      if (isNaN(serviceId)) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid service id' });
      }

      let body: z.infer<typeof updateAssignmentsSchema>;
      try {
        body = updateAssignmentsSchema.parse(request.body);
      } catch {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid request body' });
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

      // Clear old assignments for this service
      await db
        .delete(service_page_assignments)
        .where(eq(service_page_assignments.service_id, serviceId));

      // Insert new assignments
      if (body.page_ids.length > 0) {
        await db.insert(service_page_assignments).values(
          body.page_ids.map((pageId, index) => ({
            service_id: serviceId,
            page_id: pageId,
            order: index,
          })),
        );
      }

      return reply.send({ success: true });
    },
  );
};

export default pagesRoute;
