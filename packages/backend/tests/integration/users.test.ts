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

process.env.JWT_SECRET = 'integration-test-secret';

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

  return { fastify, db, sqlite };
}

describe('Users API', () => {
  let server: Awaited<ReturnType<typeof buildTestServer>>;

  beforeEach(async () => {
    server = await buildTestServer();
    await server.fastify.ready();
  });

  afterEach(async () => {
    await server.fastify.close();
    server.sqlite.close();
  });

  describe('POST /api/users - first user (empty DB)', () => {
    it('should create admin user when DB is empty and password is provided', async () => {
      const response = await server.fastify.inject({
        method: 'POST',
        url: '/api/users',
        payload: { username: 'admin', password: 'secret123' },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.username).toBe('admin');
      expect(body.role).toBe('admin');
      expect(body.id).toBeDefined();
      expect(body.avatar_color).toBeDefined();
      // Should not expose password_hash
      expect(body.password_hash).toBeUndefined();
    });

    it('should return 400 when no password is provided for first user', async () => {
      const response = await server.fastify.inject({
        method: 'POST',
        url: '/api/users',
        payload: { username: 'admin' },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Bad Request');
    });
  });

  describe('POST /api/users - subsequent users', () => {
    beforeEach(async () => {
      // Create admin first
      await server.fastify.inject({
        method: 'POST',
        url: '/api/users',
        payload: { username: 'admin', password: 'secret123' },
      });
    });

    it('should create regular user without password', async () => {
      const response = await server.fastify.inject({
        method: 'POST',
        url: '/api/users',
        payload: { username: 'alice' },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.username).toBe('alice');
      expect(body.role).toBe('user');
      expect(body.id).toBeDefined();
      expect(body.avatar_color).toBeDefined();
    });

    it('should create regular user even if password is provided (ignored)', async () => {
      const response = await server.fastify.inject({
        method: 'POST',
        url: '/api/users',
        payload: { username: 'bob', password: 'somepassword' },
      });

      // Should still create as user (not admin), password is for first admin only
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.role).toBe('user');
    });

    it('should return 400 for duplicate username', async () => {
      // Create user first
      await server.fastify.inject({
        method: 'POST',
        url: '/api/users',
        payload: { username: 'alice' },
      });

      // Try to create duplicate
      const response = await server.fastify.inject({
        method: 'POST',
        url: '/api/users',
        payload: { username: 'alice' },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Bad Request');
    });

    it('should return 400 for duplicate admin username', async () => {
      const response = await server.fastify.inject({
        method: 'POST',
        url: '/api/users',
        payload: { username: 'admin' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/users', () => {
    it('should return empty array when no users', async () => {
      const response = await server.fastify.inject({
        method: 'GET',
        url: '/api/users',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual([]);
    });

    it('should return all users', async () => {
      // Create admin
      await server.fastify.inject({
        method: 'POST',
        url: '/api/users',
        payload: { username: 'admin', password: 'secret123' },
      });

      // Create regular user
      await server.fastify.inject({
        method: 'POST',
        url: '/api/users',
        payload: { username: 'alice' },
      });

      const response = await server.fastify.inject({
        method: 'GET',
        url: '/api/users',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveLength(2);

      const adminUser = body.find((u: any) => u.username === 'admin');
      expect(adminUser.role).toBe('admin');
      expect(adminUser.password_hash).toBeUndefined();

      const alice = body.find((u: any) => u.username === 'alice');
      expect(alice.role).toBe('user');
    });

    it('should not expose password_hash in user list', async () => {
      await server.fastify.inject({
        method: 'POST',
        url: '/api/users',
        payload: { username: 'admin', password: 'secret123' },
      });

      const response = await server.fastify.inject({
        method: 'GET',
        url: '/api/users',
      });

      const body = JSON.parse(response.body);
      body.forEach((user: any) => {
        expect(user.password_hash).toBeUndefined();
      });
    });
  });
});
