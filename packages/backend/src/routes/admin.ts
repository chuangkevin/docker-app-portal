import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import type { DrizzleDb } from '../db/index';
import {
  users,
  settings,
  admin_service_overrides,
  user_service_prefs,
  refresh_tokens,
} from '../db/schema';
import * as geminiKeys from '../services/geminiKeys';

const geminiKeySchema = z.object({
  key: z.string().min(1),
});

const userOverridesSchema = z.object({
  overrides: z.array(
    z.object({
      service_id: z.number().int(),
      is_force_hidden: z.union([z.literal(0), z.literal(1)]),
    }),
  ),
});

const globalOverrideSchema = z.object({
  is_force_hidden: z.union([z.literal(0), z.literal(1)]),
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

  // GET /api/admin/users/:id/overrides - get overrides for a user
  fastify.get<{ Params: { id: string } }>(
    '/api/admin/users/:id/overrides',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (request, reply) => {
      const userId = parseInt(request.params.id, 10);
      if (isNaN(userId)) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid user id' });
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

      const overrides = await db
        .select()
        .from(admin_service_overrides)
        .where(eq(admin_service_overrides.target_user_id, userId));

      return reply.send(overrides);
    },
  );

  // PUT /api/admin/users/:id/overrides - replace all overrides for a user
  fastify.put<{ Params: { id: string } }>(
    '/api/admin/users/:id/overrides',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (request, reply) => {
      const userId = parseInt(request.params.id, 10);
      if (isNaN(userId)) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid user id' });
      }

      let body: z.infer<typeof userOverridesSchema>;
      try {
        body = userOverridesSchema.parse(request.body);
      } catch {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid request body' });
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

      // Delete existing overrides for this user
      await db
        .delete(admin_service_overrides)
        .where(eq(admin_service_overrides.target_user_id, userId));

      // Insert new overrides
      if (body.overrides.length > 0) {
        await db.insert(admin_service_overrides).values(
          body.overrides.map((o) => ({
            service_id: o.service_id,
            target_user_id: userId,
            is_force_hidden: o.is_force_hidden,
          })),
        );
      }

      return reply.send({ success: true });
    },
  );

  // PUT /api/admin/services/:id/global-override - set global override for a service
  fastify.put<{ Params: { id: string } }>(
    '/api/admin/services/:id/global-override',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (request, reply) => {
      const serviceId = parseInt(request.params.id, 10);
      if (isNaN(serviceId)) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid service id' });
      }

      let body: z.infer<typeof globalOverrideSchema>;
      try {
        body = globalOverrideSchema.parse(request.body);
      } catch {
        return reply.status(400).send({ error: 'Bad Request', message: 'is_force_hidden must be 0 or 1' });
      }

      // Upsert global override (target_user_id = NULL)
      const existing = await db
        .select()
        .from(admin_service_overrides)
        .where(
          and(
            eq(admin_service_overrides.service_id, serviceId),
            // For NULL comparison we need a raw approach
          ),
        );

      // Filter for null target_user_id in JS since Drizzle isNull might not work with and()
      const globalOverride = existing.find((o) => o.target_user_id === null);

      if (globalOverride) {
        await db
          .update(admin_service_overrides)
          .set({ is_force_hidden: body.is_force_hidden })
          .where(eq(admin_service_overrides.id, globalOverride.id));
      } else {
        await db.insert(admin_service_overrides).values({
          service_id: serviceId,
          target_user_id: null,
          is_force_hidden: body.is_force_hidden,
        });
      }

      return reply.send({ success: true });
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
        .delete(user_service_prefs)
        .where(eq(user_service_prefs.user_id, userId));

      await db
        .delete(admin_service_overrides)
        .where(eq(admin_service_overrides.target_user_id, userId));

      await db
        .delete(refresh_tokens)
        .where(eq(refresh_tokens.user_id, userId));

      // Delete user
      await db.delete(users).where(eq(users.id, userId));

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
