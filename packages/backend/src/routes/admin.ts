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
import {
  getOpenCodeSetting,
  setOpenCodeSetting,
  parseOpenCodeServers,
  getOpenCodeModel,
} from '../services/opencode-settings';

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

  // --- OpenCode Settings Endpoints ---

  const SHOW_PROVIDERS = ['opencode', 'openai', 'github-copilot', 'google', 'anthropic'];

  interface OpenCodeServerEntry {
    id: string;
    label: string;
    base_url: string;
  }

  function buildServerEntries(raw: string | null): OpenCodeServerEntry[] {
    return parseOpenCodeServers(raw).map((url, i) => ({
      id: `server_${i}`,
      label: url,
      base_url: url,
    }));
  }

  function resolveServerEntries(raw: string | null): {
    entries: OpenCodeServerEntry[];
    source: 'setting' | 'env' | 'none';
  } {
    if (raw) {
      return { entries: buildServerEntries(raw), source: 'setting' };
    }
    const envVal = process.env.OPENCODE_SERVER_URL;
    if (envVal) {
      return { entries: buildServerEntries(envVal), source: 'env' };
    }
    return { entries: [], source: 'none' };
  }

  // GET /api/admin/settings/opencode
  fastify.get(
    '/api/admin/settings/opencode',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (_request, reply) => {
      const serversRaw = await getOpenCodeSetting(db, 'opencode_servers');
      const textModelRaw = await getOpenCodeSetting(db, 'opencode_text_model');

      const { entries: servers, source: servers_source } = resolveServerEntries(serversRaw);

      let text_model: string;
      let text_model_source: 'setting' | 'env' | 'default';
      if (textModelRaw) {
        text_model = textModelRaw;
        text_model_source = 'setting';
      } else if (process.env.OPENCODE_MODEL) {
        text_model = process.env.OPENCODE_MODEL;
        text_model_source = 'env';
      } else {
        text_model = 'opencode/deepseek-v4-flash-free';
        text_model_source = 'default';
      }

      return reply.send({ servers, servers_source, text_model, text_model_source });
    },
  );

  const openCodeSaveSchema = z.object({
    servers: z.string().optional(),
    text_model: z.string().optional(),
  });

  // POST /api/admin/settings/opencode
  fastify.post(
    '/api/admin/settings/opencode',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (request, reply) => {
      let body: z.infer<typeof openCodeSaveSchema>;
      try {
        body = openCodeSaveSchema.parse(request.body);
      } catch {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid body' });
      }

      if (body.servers !== undefined) {
        await setOpenCodeSetting(db, 'opencode_servers', body.servers || null);
      }
      if (body.text_model !== undefined) {
        await setOpenCodeSetting(db, 'opencode_text_model', body.text_model || null);
      }

      return reply.send({ success: true });
    },
  );

  // DELETE /api/admin/settings/opencode
  fastify.delete(
    '/api/admin/settings/opencode',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (_request, reply) => {
      await setOpenCodeSetting(db, 'opencode_servers', null);
      await setOpenCodeSetting(db, 'opencode_text_model', null);
      return reply.send({ success: true });
    },
  );

  // GET /api/admin/settings/opencode/models
  fastify.get(
    '/api/admin/settings/opencode/models',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (_request, reply) => {
      const serversRaw = await getOpenCodeSetting(db, 'opencode_servers');
      const { entries } = resolveServerEntries(serversRaw);

      if (entries.length === 0) {
        return reply.send({ groups: [], server: null });
      }

      const serverEntry = entries[0];
      const base = serverEntry.base_url.replace(/\/$/, '');
      const authHeaders: Record<string, string> = {};
      const password = process.env.OPENCODE_SERVER_PASSWORD;
      if (password) {
        const encoded = Buffer.from(`:${password}`).toString('base64');
        authHeaders['Authorization'] = `Basic ${encoded}`;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);

      try {
        type ProviderModel = { id?: string; name?: string; cost?: { input?: number } };
        type RawProvider = { id?: string; name?: string; models?: Record<string, ProviderModel> };

        const [provRes, authRes] = await Promise.all([
          fetch(`${base}/provider`, { headers: authHeaders, signal: controller.signal }),
          fetch(`${base}/provider/auth`, { headers: authHeaders, signal: controller.signal }).catch(() => null),
        ]);

        if (!provRes.ok) {
          return reply.status(502).send({ groups: [], server: serverEntry, error: `OpenCode /provider returned ${provRes.status}` });
        }

        const providerData = (await provRes.json()) as { all?: unknown[]; providers?: unknown[] };
        const authData: Record<string, unknown> = authRes?.ok ? (await authRes.json() as Record<string, unknown>) : {};
        const needsAuthIds = new Set(Object.keys(authData));

        const providerList = providerData.all ?? providerData.providers ?? [];
        const groups: Array<{ provider: string; name: string; authed: boolean; models: Array<{ id: string; name: string; free: boolean }> }> = [];

        for (const raw of providerList as RawProvider[]) {
          if (!raw.id || !SHOW_PROVIDERS.includes(raw.id)) continue;
          const models = Object.values(raw.models ?? {}).map((m) => ({
            id: `${raw.id}/${m.id ?? ''}`,
            name: m.name ?? m.id ?? '',
            free: m.cost?.input === 0,
          }));
          if (models.length === 0) continue;
          groups.push({
            provider: raw.id,
            name: raw.name ?? raw.id,
            authed: !needsAuthIds.has(raw.id),
            models,
          });
        }

        return reply.send({ groups, server: serverEntry });
      } finally {
        clearTimeout(timer);
      }
    },
  );

};

export default adminRoute;
