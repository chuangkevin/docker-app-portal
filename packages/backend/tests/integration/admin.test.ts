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
import adminRoute from '../../src/routes/admin';

process.env.JWT_SECRET = 'admin-test-secret';

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
  await fastify.register(servicesRoute, { db });
  await fastify.register(pagesRoute, { db });
  await fastify.register(adminRoute, { db });

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

function insertService(db: any, data: { container_id: string; name: string; image: string }) {
  return db.insert(schema.services).values({
    container_id: data.container_id,
    name: data.name,
    image: data.image,
    ports: '[]',
    labels: '{}',
    status: 'online',
    last_seen_at: Date.now(),
  }).returning();
}

describe('Admin API', () => {
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

  describe('Gemini Key Settings', () => {
    it('GET /api/admin/settings/gemini-key should return isSet: false initially', async () => {
      const res = await server.fastify.inject({
        method: 'GET',
        url: '/api/admin/settings/gemini-key',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ isSet: false });
    });

    it('PUT /api/admin/settings/gemini-key should set the key', async () => {
      const putRes = await server.fastify.inject({
        method: 'PUT',
        url: '/api/admin/settings/gemini-key',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { key: 'test-api-key-123' },
      });

      expect(putRes.statusCode).toBe(200);
      expect(JSON.parse(putRes.body)).toEqual({ success: true });

      // Verify it's set
      const getRes = await server.fastify.inject({
        method: 'GET',
        url: '/api/admin/settings/gemini-key',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(JSON.parse(getRes.body)).toEqual({ isSet: true });
    });

    it('PUT should update existing key', async () => {
      // Set first time
      await server.fastify.inject({
        method: 'PUT',
        url: '/api/admin/settings/gemini-key',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { key: 'key-1' },
      });

      // Update
      const res = await server.fastify.inject({
        method: 'PUT',
        url: '/api/admin/settings/gemini-key',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { key: 'key-2' },
      });

      expect(res.statusCode).toBe(200);
    });

    it('should return 403 for non-admin', async () => {
      const { accessToken } = await createUserAndLogin(server.fastify, 'bob');

      const res = await server.fastify.inject({
        method: 'GET',
        url: '/api/admin/settings/gemini-key',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('User Management', () => {
    it('GET /api/admin/users should return all users', async () => {
      await createUserAndLogin(server.fastify, 'alice');
      await createUserAndLogin(server.fastify, 'bob');

      const res = await server.fastify.inject({
        method: 'GET',
        url: '/api/admin/users',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveLength(3); // admin + alice + bob
      expect(body[0]).toHaveProperty('id');
      expect(body[0]).toHaveProperty('username');
      expect(body[0]).toHaveProperty('role');
    });

    it('DELETE /api/admin/users/:id should delete user and related data', async () => {
      const { userId } = await createUserAndLogin(server.fastify, 'alice');

      // Add some related data
      const [svc] = await insertService(server.db, {
        container_id: 'abc1',
        name: 'nginx',
        image: 'nginx:latest',
      });

      await server.db.insert(schema.user_service_prefs).values({
        user_id: userId,
        service_id: svc.id,
        is_hidden: 1,
      });

      await server.db.insert(schema.admin_service_overrides).values({
        service_id: svc.id,
        target_user_id: userId,
        is_force_hidden: 1,
      });

      const res = await server.fastify.inject({
        method: 'DELETE',
        url: `/api/admin/users/${userId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);

      // Verify user is gone
      const usersRes = await server.fastify.inject({
        method: 'GET',
        url: '/api/admin/users',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const users = JSON.parse(usersRes.body);
      expect(users).toHaveLength(1); // only admin remains
    });

    it('DELETE should reject deleting self', async () => {
      // Admin's ID is 1 (first user created)
      const res = await server.fastify.inject({
        method: 'DELETE',
        url: '/api/admin/users/1',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).message).toContain('Cannot delete');
    });

    it('DELETE should reject deleting admin user', async () => {
      // The admin user (id=1) is both self and admin; test separately
      // by trying via a scenario check - already covered by "cannot delete yourself"
      // but let's also ensure admin role check works
      const res = await server.fastify.inject({
        method: 'DELETE',
        url: '/api/admin/users/1',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('DELETE should return 404 for non-existent user', async () => {
      const res = await server.fastify.inject({
        method: 'DELETE',
        url: '/api/admin/users/99999',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('User Overrides', () => {
    it('GET /api/admin/users/:id/overrides should return empty array initially', async () => {
      const { userId } = await createUserAndLogin(server.fastify, 'alice');

      const res = await server.fastify.inject({
        method: 'GET',
        url: `/api/admin/users/${userId}/overrides`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual([]);
    });

    it('PUT /api/admin/users/:id/overrides should set overrides', async () => {
      const { userId } = await createUserAndLogin(server.fastify, 'alice');
      const [svc1] = await insertService(server.db, { container_id: 'abc1', name: 'svc1', image: 'img1' });
      const [svc2] = await insertService(server.db, { container_id: 'abc2', name: 'svc2', image: 'img2' });

      const res = await server.fastify.inject({
        method: 'PUT',
        url: `/api/admin/users/${userId}/overrides`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          overrides: [
            { service_id: svc1.id, is_force_hidden: 1 },
            { service_id: svc2.id, is_force_hidden: 0 },
          ],
        },
      });

      expect(res.statusCode).toBe(200);

      // Verify overrides
      const getRes = await server.fastify.inject({
        method: 'GET',
        url: `/api/admin/users/${userId}/overrides`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const overrides = JSON.parse(getRes.body);
      expect(overrides).toHaveLength(2);
    });

    it('PUT should replace existing overrides', async () => {
      const { userId } = await createUserAndLogin(server.fastify, 'alice');
      const [svc1] = await insertService(server.db, { container_id: 'abc1', name: 'svc1', image: 'img1' });
      const [svc2] = await insertService(server.db, { container_id: 'abc2', name: 'svc2', image: 'img2' });

      // Set both
      await server.fastify.inject({
        method: 'PUT',
        url: `/api/admin/users/${userId}/overrides`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          overrides: [
            { service_id: svc1.id, is_force_hidden: 1 },
            { service_id: svc2.id, is_force_hidden: 1 },
          ],
        },
      });

      // Replace with just one
      await server.fastify.inject({
        method: 'PUT',
        url: `/api/admin/users/${userId}/overrides`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          overrides: [
            { service_id: svc1.id, is_force_hidden: 1 },
          ],
        },
      });

      const getRes = await server.fastify.inject({
        method: 'GET',
        url: `/api/admin/users/${userId}/overrides`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(JSON.parse(getRes.body)).toHaveLength(1);
    });

    it('should return 404 for non-existent user', async () => {
      const res = await server.fastify.inject({
        method: 'GET',
        url: '/api/admin/users/99999/overrides',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('Global Override', () => {
    it('PUT /api/admin/services/:id/global-override should set global override', async () => {
      const [svc] = await insertService(server.db, { container_id: 'abc1', name: 'svc1', image: 'img1' });

      const res = await server.fastify.inject({
        method: 'PUT',
        url: `/api/admin/services/${svc.id}/global-override`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { is_force_hidden: 1 },
      });

      expect(res.statusCode).toBe(200);

      // Verify: a regular user should not see this service
      const { accessToken } = await createUserAndLogin(server.fastify, 'bob');

      const listRes = await server.fastify.inject({
        method: 'GET',
        url: '/api/services',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(JSON.parse(listRes.body)).toHaveLength(0);
    });

    it('should update existing global override', async () => {
      const [svc] = await insertService(server.db, { container_id: 'abc1', name: 'svc1', image: 'img1' });

      // Hide
      await server.fastify.inject({
        method: 'PUT',
        url: `/api/admin/services/${svc.id}/global-override`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { is_force_hidden: 1 },
      });

      // Unhide
      await server.fastify.inject({
        method: 'PUT',
        url: `/api/admin/services/${svc.id}/global-override`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { is_force_hidden: 0 },
      });

      // Verify: a regular user should see this service
      const { accessToken } = await createUserAndLogin(server.fastify, 'bob');

      const listRes = await server.fastify.inject({
        method: 'GET',
        url: '/api/services',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(JSON.parse(listRes.body)).toHaveLength(1);
    });
  });
});
