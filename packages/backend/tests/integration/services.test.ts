import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../src/db/schema';
import { runMigrations } from '../../src/db/migrate';
import authPlugin from '../../src/plugins/auth';
import adminOnlyPlugin from '../../src/plugins/adminOnly';
import usersRoute from '../../src/routes/users';
import authRoute from '../../src/routes/auth';
import servicesRoute from '../../src/routes/services';
import pagesRoute from '../../src/routes/pages';

process.env.JWT_SECRET = 'services-test-secret';

async function buildTestServer() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  await runMigrations(db);

  const fastify = Fastify({ logger: false });
  await fastify.register(fastifyCookie);
  await fastify.register(fastifyCors, { origin: true, credentials: true });
  await fastify.register(authPlugin);
  await fastify.register(adminOnlyPlugin);
  await fastify.register(usersRoute, { db });
  await fastify.register(authRoute, { db });
  await fastify.register(servicesRoute, {
    db,
    caddyfileService: {
      getDomainForPort: (port: number) => (port === 8080 ? 'portal.sisihome.org' : null),
    },
  });
  await fastify.register(pagesRoute, { db });

  return { fastify, db, sqlite };
}

async function createAdminAndLogin(fastify: any) {
  await fastify.inject({
    method: 'POST',
    url: '/api/users',
    payload: { username: 'admin', password: 'adminPass123' },
  });

  const loginRes = await fastify.inject({
    method: 'POST',
    url: '/api/auth/admin-login',
    payload: { password: 'adminPass123' },
  });

  return JSON.parse(loginRes.body).accessToken;
}

async function createUserAndLogin(fastify: any, username: string) {
  const userRes = await fastify.inject({
    method: 'POST',
    url: '/api/users',
    payload: { username },
  });
  const userId = JSON.parse(userRes.body).id;

  const loginRes = await fastify.inject({
    method: 'POST',
    url: `/api/auth/select/${userId}`,
  });

  return {
    userId,
    accessToken: JSON.parse(loginRes.body).accessToken,
  };
}

function insertService(db: any, data: Partial<schema.Service> & { container_id: string; name: string; image: string }) {
  return db.insert(schema.services).values({
    container_id: data.container_id,
    name: data.name,
    image: data.image,
    ports: data.ports || '[]',
    labels: data.labels || '{}',
    display_name: data.display_name || null,
    status: data.status || 'online',
    last_seen_at: data.last_seen_at || Date.now(),
    ai_description: data.ai_description || null,
    custom_description: data.custom_description || null,
  }).returning();
}

describe('Services API', () => {
  let server: Awaited<ReturnType<typeof buildTestServer>>;
  let adminToken: string;

  beforeEach(async () => {
    server = await buildTestServer();
    await server.fastify.ready();
    adminToken = await createAdminAndLogin(server.fastify);
  });

  afterEach(async () => {
    await server.fastify.close();
    server.sqlite.close();
  });

  describe('GET /api/services', () => {
    it('should return empty list when no services exist', async () => {
      const res = await server.fastify.inject({
        method: 'GET',
        url: '/api/services',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual([]);
    });

    it('should return services with parsed ports', async () => {
      await insertService(server.db, {
        container_id: 'abc123',
        name: 'nginx',
        image: 'nginx:latest',
        ports: JSON.stringify([{ public: 8080, private: 80, type: 'tcp' }]),
      });

      const res = await server.fastify.inject({
        method: 'GET',
        url: '/api/services',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe('nginx');
      expect(body[0].ports).toEqual([{ public: 8080, private: 80, type: 'tcp' }]);
    });

    it('should keep custom titles when deduplicating same-domain services', async () => {
      await insertService(server.db, {
        container_id: 'online-1',
        name: 'portal-online',
        image: 'portal:latest',
        status: 'online',
        ports: JSON.stringify([{ public: 8080, private: 80, type: 'tcp' }]),
      });
      await insertService(server.db, {
        container_id: 'offline-1',
        name: 'portal-offline',
        image: 'portal:old',
        status: 'offline',
        display_name: '我的自訂標題',
        custom_description: '自訂描述',
        ports: JSON.stringify([{ public: 8080, private: 80, type: 'tcp' }]),
      });

      const res = await server.fastify.inject({
        method: 'GET',
        url: '/api/services',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveLength(1);
      expect(body[0].status).toBe('online');
      expect(body[0].display_name).toBe('我的自訂標題');
      expect(body[0].description).toBe('自訂描述');
    });

    it('should prefer custom_description over ai_description', async () => {
      await insertService(server.db, {
        container_id: 'abc123',
        name: 'nginx',
        image: 'nginx:latest',
        ai_description: 'AI generated desc',
        custom_description: 'Custom desc',
      });

      const res = await server.fastify.inject({
        method: 'GET',
        url: '/api/services',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const body = JSON.parse(res.body);
      expect(body[0].description).toBe('Custom desc');
    });

    it('should fall back to ai_description when no custom_description', async () => {
      await insertService(server.db, {
        container_id: 'abc123',
        name: 'nginx',
        image: 'nginx:latest',
        ai_description: 'AI generated desc',
      });

      const res = await server.fastify.inject({
        method: 'GET',
        url: '/api/services',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const body = JSON.parse(res.body);
      expect(body[0].description).toBe('AI generated desc');
    });

    it('should filter services hidden by admin global override', async () => {
      const [svc1] = await insertService(server.db, {
        container_id: 'abc1',
        name: 'svc1',
        image: 'img1',
      });
      await insertService(server.db, {
        container_id: 'abc2',
        name: 'svc2',
        image: 'img2',
      });

      // Set global override to hide svc1
      await server.db.insert(schema.admin_service_overrides).values({
        service_id: svc1.id,
        target_user_id: null,
        is_force_hidden: 1,
      });

      const { accessToken } = await createUserAndLogin(server.fastify, 'bob');

      const res = await server.fastify.inject({
        method: 'GET',
        url: '/api/services',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      const body = JSON.parse(res.body);
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe('svc2');
    });

    it('should filter services hidden by user-specific admin override', async () => {
      const [svc1] = await insertService(server.db, {
        container_id: 'abc1',
        name: 'svc1',
        image: 'img1',
      });
      await insertService(server.db, {
        container_id: 'abc2',
        name: 'svc2',
        image: 'img2',
      });

      const { userId, accessToken } = await createUserAndLogin(server.fastify, 'bob');

      // Set user-specific override to hide svc1 from bob
      await server.db.insert(schema.admin_service_overrides).values({
        service_id: svc1.id,
        target_user_id: userId,
        is_force_hidden: 1,
      });

      const res = await server.fastify.inject({
        method: 'GET',
        url: '/api/services',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      const body = JSON.parse(res.body);
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe('svc2');
    });

    it('should filter services hidden by user preference', async () => {
      const [svc1] = await insertService(server.db, {
        container_id: 'abc1',
        name: 'svc1',
        image: 'img1',
      });
      await insertService(server.db, {
        container_id: 'abc2',
        name: 'svc2',
        image: 'img2',
      });

      const { userId, accessToken } = await createUserAndLogin(server.fastify, 'bob');

      // User hides svc1
      await server.db.insert(schema.user_service_prefs).values({
        user_id: userId,
        service_id: svc1.id,
        is_hidden: 1,
      });

      const res = await server.fastify.inject({
        method: 'GET',
        url: '/api/services',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      const body = JSON.parse(res.body);
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe('svc2');
    });

    it('should include page assignments in response', async () => {
      const [svc] = await insertService(server.db, {
        container_id: 'abc1',
        name: 'svc1',
        image: 'img1',
      });

      // Create a page
      const createPageRes = await server.fastify.inject({
        method: 'POST',
        url: '/api/pages',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: 'My Page' },
      });
      const page = JSON.parse(createPageRes.body);

      // Assign service to page
      await server.db.insert(schema.service_page_assignments).values({
        service_id: svc.id,
        page_id: page.id,
        order: 0,
      });

      const res = await server.fastify.inject({
        method: 'GET',
        url: '/api/services',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const body = JSON.parse(res.body);
      expect(body[0].pages).toHaveLength(1);
      expect(body[0].pages[0].name).toBe('My Page');
      expect(body[0].pages[0].slug).toBe('my-page');
    });

    it('should return 401 without auth', async () => {
      const res = await server.fastify.inject({
        method: 'GET',
        url: '/api/services',
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/services/all', () => {
    it('should return all services for admin', async () => {
      await insertService(server.db, { container_id: 'abc1', name: 'svc1', image: 'img1' });
      await insertService(server.db, { container_id: 'abc2', name: 'svc2', image: 'img2' });

      const res = await server.fastify.inject({
        method: 'GET',
        url: '/api/services/all',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveLength(2);
      // Should include extended fields
      expect(body[0]).toHaveProperty('ai_description');
      expect(body[0]).toHaveProperty('custom_description');
      expect(body[0]).toHaveProperty('overrides');
      expect(body[0]).toHaveProperty('user_prefs');
    });

    it('should return 403 for non-admin', async () => {
      const { accessToken } = await createUserAndLogin(server.fastify, 'bob');

      const res = await server.fastify.inject({
        method: 'GET',
        url: '/api/services/all',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('PATCH /api/services/:id/prefs', () => {
    it('should create user preference to hide a service', async () => {
      const [svc] = await insertService(server.db, {
        container_id: 'abc1',
        name: 'svc1',
        image: 'img1',
      });

      const { accessToken } = await createUserAndLogin(server.fastify, 'bob');

      const res = await server.fastify.inject({
        method: 'PATCH',
        url: `/api/services/${svc.id}/prefs`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { is_hidden: 1 },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ success: true });

      // Verify service is now hidden
      const listRes = await server.fastify.inject({
        method: 'GET',
        url: '/api/services',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(JSON.parse(listRes.body)).toHaveLength(0);
    });

    it('should update existing preference', async () => {
      const [svc] = await insertService(server.db, {
        container_id: 'abc1',
        name: 'svc1',
        image: 'img1',
      });

      const { accessToken } = await createUserAndLogin(server.fastify, 'bob');

      // Hide it
      await server.fastify.inject({
        method: 'PATCH',
        url: `/api/services/${svc.id}/prefs`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { is_hidden: 1 },
      });

      // Unhide it
      const res = await server.fastify.inject({
        method: 'PATCH',
        url: `/api/services/${svc.id}/prefs`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { is_hidden: 0 },
      });

      expect(res.statusCode).toBe(200);

      // Verify service is visible again
      const listRes = await server.fastify.inject({
        method: 'GET',
        url: '/api/services',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(JSON.parse(listRes.body)).toHaveLength(1);
    });

    it('should return 404 for non-existent service', async () => {
      const res = await server.fastify.inject({
        method: 'PATCH',
        url: '/api/services/99999/prefs',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { is_hidden: 1 },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/services/:id (custom description)', () => {
    it('should update custom_description', async () => {
      const [svc] = await insertService(server.db, {
        container_id: 'abc1',
        name: 'svc1',
        image: 'img1',
      });

      const res = await server.fastify.inject({
        method: 'PATCH',
        url: `/api/services/${svc.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { custom_description: 'My custom desc' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.custom_description).toBe('My custom desc');
    });

    it('should return 403 for non-admin', async () => {
      const [svc] = await insertService(server.db, {
        container_id: 'abc1',
        name: 'svc1',
        image: 'img1',
      });

      const { accessToken } = await createUserAndLogin(server.fastify, 'bob');

      const res = await server.fastify.inject({
        method: 'PATCH',
        url: `/api/services/${svc.id}`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { custom_description: 'Nope' },
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
