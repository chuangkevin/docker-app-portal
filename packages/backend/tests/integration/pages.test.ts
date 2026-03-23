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

process.env.JWT_SECRET = 'pages-test-secret';

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

describe('Pages API', () => {
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

  describe('POST /api/pages', () => {
    it('should create a page with correct slug', async () => {
      const res = await server.fastify.inject({
        method: 'POST',
        url: '/api/pages',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: 'My Cool Page' },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.name).toBe('My Cool Page');
      expect(body.slug).toBe('my-cool-page');
      expect(body.id).toBeDefined();
    });

    it('should return 409 for duplicate slug', async () => {
      await server.fastify.inject({
        method: 'POST',
        url: '/api/pages',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: 'Test Page' },
      });

      const res = await server.fastify.inject({
        method: 'POST',
        url: '/api/pages',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: 'Test Page' },
      });

      expect(res.statusCode).toBe(409);
    });

    it('should return 403 for non-admin', async () => {
      const { accessToken } = await createUserAndLogin(server.fastify, 'bob');

      const res = await server.fastify.inject({
        method: 'POST',
        url: '/api/pages',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { name: 'Sneaky Page' },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/pages', () => {
    it('should return pages ordered by order field', async () => {
      // Create two pages
      await server.fastify.inject({
        method: 'POST',
        url: '/api/pages',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: 'Page B' },
      });
      const page2Res = await server.fastify.inject({
        method: 'POST',
        url: '/api/pages',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: 'Page A' },
      });
      const pageA = JSON.parse(page2Res.body);

      // Set Page A to order -1 so it comes first
      await server.fastify.inject({
        method: 'PATCH',
        url: `/api/pages/${pageA.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { order: -1 },
      });

      const res = await server.fastify.inject({
        method: 'GET',
        url: '/api/pages',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveLength(2);
      expect(body[0].name).toBe('Page A');
      expect(body[1].name).toBe('Page B');
    });

    it('should include services in page response', async () => {
      const [svc] = await insertService(server.db, {
        container_id: 'abc1',
        name: 'nginx',
        image: 'nginx:latest',
      });

      const createRes = await server.fastify.inject({
        method: 'POST',
        url: '/api/pages',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: 'Infra' },
      });
      const page = JSON.parse(createRes.body);

      // Assign service
      await server.fastify.inject({
        method: 'PUT',
        url: `/api/pages/${page.id}/services`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { services: [{ service_id: svc.id, order: 0 }] },
      });

      const res = await server.fastify.inject({
        method: 'GET',
        url: '/api/pages',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      const body = JSON.parse(res.body);
      expect(body[0].services).toHaveLength(1);
      expect(body[0].services[0].name).toBe('nginx');
    });
  });

  describe('PATCH /api/pages/:id', () => {
    it('should update page name and slug', async () => {
      const createRes = await server.fastify.inject({
        method: 'POST',
        url: '/api/pages',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: 'Old Name' },
      });
      const page = JSON.parse(createRes.body);

      const res = await server.fastify.inject({
        method: 'PATCH',
        url: `/api/pages/${page.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: 'New Name' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.name).toBe('New Name');
      expect(body.slug).toBe('new-name');
    });

    it('should update page order', async () => {
      const createRes = await server.fastify.inject({
        method: 'POST',
        url: '/api/pages',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: 'My Page' },
      });
      const page = JSON.parse(createRes.body);

      const res = await server.fastify.inject({
        method: 'PATCH',
        url: `/api/pages/${page.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { order: 5 },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).order).toBe(5);
    });

    it('should return 404 for non-existent page', async () => {
      const res = await server.fastify.inject({
        method: 'PATCH',
        url: '/api/pages/99999',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: 'Ghost' },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/pages/:id', () => {
    it('should delete page and its assignments', async () => {
      const [svc] = await insertService(server.db, {
        container_id: 'abc1',
        name: 'nginx',
        image: 'nginx:latest',
      });

      const createRes = await server.fastify.inject({
        method: 'POST',
        url: '/api/pages',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: 'To Delete' },
      });
      const page = JSON.parse(createRes.body);

      // Assign a service
      await server.fastify.inject({
        method: 'PUT',
        url: `/api/pages/${page.id}/services`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { services: [{ service_id: svc.id, order: 0 }] },
      });

      // Delete
      const delRes = await server.fastify.inject({
        method: 'DELETE',
        url: `/api/pages/${page.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(delRes.statusCode).toBe(200);

      // Verify page is gone
      const listRes = await server.fastify.inject({
        method: 'GET',
        url: '/api/pages',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(JSON.parse(listRes.body)).toHaveLength(0);
    });

    it('should return 404 for non-existent page', async () => {
      const res = await server.fastify.inject({
        method: 'DELETE',
        url: '/api/pages/99999',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /api/pages/:id/services', () => {
    it('should set services for a page', async () => {
      const [svc1] = await insertService(server.db, { container_id: 'abc1', name: 'svc1', image: 'img1' });
      const [svc2] = await insertService(server.db, { container_id: 'abc2', name: 'svc2', image: 'img2' });

      const createRes = await server.fastify.inject({
        method: 'POST',
        url: '/api/pages',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: 'My Page' },
      });
      const page = JSON.parse(createRes.body);

      const res = await server.fastify.inject({
        method: 'PUT',
        url: `/api/pages/${page.id}/services`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          services: [
            { service_id: svc1.id, order: 0 },
            { service_id: svc2.id, order: 1 },
          ],
        },
      });

      expect(res.statusCode).toBe(200);

      // Verify assignments
      const pageRes = await server.fastify.inject({
        method: 'GET',
        url: '/api/pages',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const pages = JSON.parse(pageRes.body);
      expect(pages[0].services).toHaveLength(2);
    });

    it('should replace old assignments', async () => {
      const [svc1] = await insertService(server.db, { container_id: 'abc1', name: 'svc1', image: 'img1' });
      const [svc2] = await insertService(server.db, { container_id: 'abc2', name: 'svc2', image: 'img2' });

      const createRes = await server.fastify.inject({
        method: 'POST',
        url: '/api/pages',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: 'My Page' },
      });
      const page = JSON.parse(createRes.body);

      // First set both
      await server.fastify.inject({
        method: 'PUT',
        url: `/api/pages/${page.id}/services`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { services: [{ service_id: svc1.id, order: 0 }, { service_id: svc2.id, order: 1 }] },
      });

      // Then set only svc2
      await server.fastify.inject({
        method: 'PUT',
        url: `/api/pages/${page.id}/services`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { services: [{ service_id: svc2.id, order: 0 }] },
      });

      const pageRes = await server.fastify.inject({
        method: 'GET',
        url: '/api/pages',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const pages = JSON.parse(pageRes.body);
      expect(pages[0].services).toHaveLength(1);
      expect(pages[0].services[0].name).toBe('svc2');
    });
  });

  describe('PATCH /api/services/:id/assignments', () => {
    it('should update page assignments for a service', async () => {
      const [svc] = await insertService(server.db, { container_id: 'abc1', name: 'svc1', image: 'img1' });

      const page1Res = await server.fastify.inject({
        method: 'POST',
        url: '/api/pages',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: 'Page 1' },
      });
      const page1 = JSON.parse(page1Res.body);

      const page2Res = await server.fastify.inject({
        method: 'POST',
        url: '/api/pages',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: 'Page 2' },
      });
      const page2 = JSON.parse(page2Res.body);

      const res = await server.fastify.inject({
        method: 'PATCH',
        url: `/api/services/${svc.id}/assignments`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { page_ids: [page1.id, page2.id] },
      });

      expect(res.statusCode).toBe(200);

      // Verify both pages have this service
      const pagesRes = await server.fastify.inject({
        method: 'GET',
        url: '/api/pages',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const allPages = JSON.parse(pagesRes.body);
      expect(allPages[0].services).toHaveLength(1);
      expect(allPages[1].services).toHaveLength(1);
    });

    it('should return 404 for non-existent service', async () => {
      const res = await server.fastify.inject({
        method: 'PATCH',
        url: '/api/services/99999/assignments',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { page_ids: [1] },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
