import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, or } from 'drizzle-orm';
import type { DrizzleDb } from '../db/index';
import { custom_links } from '../db/schema';

const createLinkSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  description: z.string().max(500).optional(),
  icon_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  is_global: z.union([z.literal(0), z.literal(1)]).optional(),
});

const updateLinkSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  description: z.string().max(500).nullable().optional(),
  icon_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  order: z.number().int().min(0).optional(),
});

const linksRoute: FastifyPluginAsync<{ db: DrizzleDb }> = async (fastify, opts) => {
  const db = opts.db;

  // GET /api/links - get links visible to current user (own + global)
  fastify.get(
    '/api/links',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const userId = request.user.userId;

      const links = await db
        .select()
        .from(custom_links)
        .where(
          or(
            eq(custom_links.created_by, userId),
            eq(custom_links.is_global, 1),
          ),
        );

      // Sort by order, then created_at
      links.sort((a, b) => a.order - b.order || a.created_at - b.created_at);

      return reply.send(links);
    },
  );

  // POST /api/links - create a custom link
  fastify.post(
    '/api/links',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      let body: z.infer<typeof createLinkSchema>;
      try {
        body = createLinkSchema.parse(request.body);
      } catch {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid link data' });
      }

      const userId = request.user.userId;
      const isAdmin = request.user.role === 'admin';

      // Only admin can create global links
      const isGlobal = isAdmin && body.is_global === 1 ? 1 : 0;

      const result = await db.insert(custom_links).values({
        name: body.name,
        url: body.url,
        description: body.description || null,
        icon_color: body.icon_color || '#4ECDC4',
        created_by: userId,
        is_global: isGlobal,
      }).returning();

      return reply.status(201).send(result[0]);
    },
  );

  // PATCH /api/links/:id - update a custom link (owner or admin)
  fastify.patch<{ Params: { id: string } }>(
    '/api/links/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const linkId = parseInt(request.params.id, 10);
      if (isNaN(linkId)) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid link id' });
      }

      let body: z.infer<typeof updateLinkSchema>;
      try {
        body = updateLinkSchema.parse(request.body);
      } catch {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid update data' });
      }

      const link = await db
        .select()
        .from(custom_links)
        .where(eq(custom_links.id, linkId))
        .limit(1);

      if (!link.length) {
        return reply.status(404).send({ error: 'Not Found', message: 'Link not found' });
      }

      // Only owner or admin can update
      const isOwner = link[0].created_by === request.user.userId;
      const isAdmin = request.user.role === 'admin';
      if (!isOwner && !isAdmin) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const updatePayload: Record<string, unknown> = {};
      if (body.name !== undefined) updatePayload.name = body.name;
      if (body.url !== undefined) updatePayload.url = body.url;
      if (body.description !== undefined) updatePayload.description = body.description;
      if (body.icon_color !== undefined) updatePayload.icon_color = body.icon_color;
      if (body.order !== undefined) updatePayload.order = body.order;

      if (Object.keys(updatePayload).length > 0) {
        await db
          .update(custom_links)
          .set(updatePayload)
          .where(eq(custom_links.id, linkId));
      }

      const updated = await db
        .select()
        .from(custom_links)
        .where(eq(custom_links.id, linkId))
        .limit(1);

      return reply.send(updated[0]);
    },
  );

  // DELETE /api/links/:id - delete a custom link (owner or admin)
  fastify.delete<{ Params: { id: string } }>(
    '/api/links/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const linkId = parseInt(request.params.id, 10);
      if (isNaN(linkId)) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid link id' });
      }

      const link = await db
        .select()
        .from(custom_links)
        .where(eq(custom_links.id, linkId))
        .limit(1);

      if (!link.length) {
        return reply.status(404).send({ error: 'Not Found', message: 'Link not found' });
      }

      const isOwner = link[0].created_by === request.user.userId;
      const isAdmin = request.user.role === 'admin';
      if (!isOwner && !isAdmin) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      await db.delete(custom_links).where(eq(custom_links.id, linkId));

      return reply.send({ success: true });
    },
  );
};

export default linksRoute;
