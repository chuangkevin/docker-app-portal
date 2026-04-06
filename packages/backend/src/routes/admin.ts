import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { DrizzleDb } from '../db/index';
import {
  users,
  settings,
  user_pins,
  refresh_tokens,
  services,
} from '../db/schema';
import * as geminiKeys from '../services/geminiKeys';

const geminiKeySchema = z.object({
  key: z.string().min(1),
});

const adminRoute: FastifyPluginAsync<{ db: DrizzleDb }> = async (fastify, opts) => {
  const db = opts.db;

  // GET /api/admin/settings/gemini-key - check if key is set
  fastify.get(
    '/api/admin/settings/gemini-key',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (_request, reply) => {
      const result = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'gemini_api_key'))
        .limit(1);

      return reply.send({ isSet: result.length > 0 && !!result[0].value });
    },
  );

  // PUT /api/admin/settings/gemini-key - set the key
  fastify.put(
    '/api/admin/settings/gemini-key',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (request, reply) => {
      let body: z.infer<typeof geminiKeySchema>;
      try {
        body = geminiKeySchema.parse(request.body);
      } catch {
        return reply.status(400).send({ error: 'Bad Request', message: 'key is required' });
      }

      const existing = await db
        .select()
        .from(settings)
        .where(eq(settings.key, 'gemini_api_key'))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(settings)
          .set({ value: body.key })
          .where(eq(settings.key, 'gemini_api_key'));
      } else {
        await db.insert(settings).values({
          key: 'gemini_api_key',
          value: body.key,
        });
      }

      return reply.send({ success: true });
    },
  );

  // GET /api/admin/users - list all users
  fastify.get(
    '/api/admin/users',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (_request, reply) => {
      const allUsers = await db
        .select({
          id: users.id,
          username: users.username,
          role: users.role,
          avatar_color: users.avatar_color,
          created_at: users.created_at,
        })
        .from(users);

      return reply.send(allUsers);
    },
  );

  // DELETE /api/admin/users/:id - delete a user and related data
  fastify.delete<{ Params: { id: string } }>(
    '/api/admin/users/:id',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (request, reply) => {
      const userId = parseInt(request.params.id, 10);
      if (isNaN(userId)) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid user id' });
      }

      // Cannot delete yourself
      if (userId === request.user.userId) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Cannot delete yourself' });
      }

      // Check user exists
      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user.length) {
        return reply.status(404).send({ error: 'Not Found', message: 'User not found' });
      }

      // Cannot delete admin
      if (user[0].role === 'admin') {
        return reply.status(400).send({ error: 'Bad Request', message: 'Cannot delete admin user' });
      }

      // Delete related data
      await db
        .delete(user_pins)
        .where(eq(user_pins.user_id, userId));

      await db
        .delete(refresh_tokens)
        .where(eq(refresh_tokens.user_id, userId));

      // Delete user
      await db.delete(users).where(eq(users.id, userId));

      return reply.send({ success: true });
    },
  );

  // PATCH /api/admin/services/:id/external - set is_external flag
  fastify.patch<{ Params: { id: string } }>(
    '/api/admin/services/:id/external',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (request, reply) => {
      const serviceId = parseInt(request.params.id, 10);
      if (isNaN(serviceId)) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid service id' });
      }

      const body = request.body as { is_external?: number };
      if (body?.is_external === undefined || (body.is_external !== 0 && body.is_external !== 1)) {
        return reply.status(400).send({ error: 'Bad Request', message: 'is_external must be 0 or 1' });
      }

      const existing = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
      if (!existing.length) {
        return reply.status(404).send({ error: 'Not Found', message: 'Service not found' });
      }

      await db.update(services).set({ is_external: body.is_external }).where(eq(services.id, serviceId));
      return reply.send({ success: true });
    },
  );

  // --- API Key Pool Endpoints ---

  // GET /api/admin/settings/api-keys
  fastify.get(
    '/api/admin/settings/api-keys',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (_request, reply) => {
      const keys = geminiKeys.getKeyStats();
      return reply.send({ keys });
    },
  );

  // POST /api/admin/settings/api-keys
  fastify.post(
    '/api/admin/settings/api-keys',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (request, reply) => {
      const body = request.body as { keys?: string };
      if (!body?.keys || typeof body.keys !== 'string') {
        return reply.status(400).send({ error: 'Bad Request', message: 'keys is required' });
      }

      const result = geminiKeys.addKeysFromText(body.keys);
      if (result.added === 0 && result.total === geminiKeys.loadKeys().length) {
        const lines = body.keys.split(/[\n,]+/);
        const hasAny = lines.some((l) => {
          const t = l.trim();
          return t.startsWith('AIza') && t.length >= 30;
        });
        if (!hasAny) {
          return reply.status(400).send({ error: 'Bad Request', message: '未偵測到有效的 API Key' });
        }
      }

      return reply.send({ added: result.added, total: result.total });
    },
  );

  // DELETE /api/admin/settings/api-keys/:suffix
  fastify.delete<{ Params: { suffix: string } }>(
    '/api/admin/settings/api-keys/:suffix',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (request, reply) => {
      const { suffix } = request.params;
      if (!suffix || suffix.length !== 4) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid suffix' });
      }

      const removed = geminiKeys.removeKeyBySuffix(suffix);
      if (!removed) {
        return reply.status(404).send({ error: 'Not Found', message: 'Key not found' });
      }

      return reply.send({ success: true });
    },
  );

  // GET /api/admin/settings/token-usage
  fastify.get(
    '/api/admin/settings/token-usage',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (_request, reply) => {
      const stats = geminiKeys.getUsageStats();
      return reply.send(stats);
    },
  );

};

export default adminRoute;
