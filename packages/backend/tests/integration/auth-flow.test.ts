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
import healthRoute from '../../src/routes/health';

process.env.JWT_SECRET = 'auth-flow-test-secret';

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
  await fastify.register(healthRoute);
  await fastify.register(usersRoute, { db });
  await fastify.register(authRoute, { db });

  return { fastify, db, sqlite };
}

function parseCookies(response: any): Record<string, string> {
  const cookies: Record<string, string> = {};
  const setCookieHeader = response.headers['set-cookie'];
  if (!setCookieHeader) return cookies;

  const cookieArray = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const cookieStr of cookieArray) {
    const [nameValue] = cookieStr.split(';');
    const [name, value] = nameValue.split('=');
    if (name && value !== undefined) {
      cookies[name.trim()] = value.trim();
    }
  }
  return cookies;
}

describe('Auth Flow', () => {
  let server: Awaited<ReturnType<typeof buildTestServer>>;
  let adminId: number;
  let regularUserId: number;

  beforeEach(async () => {
    server = await buildTestServer();
    await server.fastify.ready();

    // Create admin user
    const adminRes = await server.fastify.inject({
      method: 'POST',
      url: '/api/users',
      payload: { username: 'admin', password: 'adminPass123' },
    });
    adminId = JSON.parse(adminRes.body).id;

    // Create regular user
    const userRes = await server.fastify.inject({
      method: 'POST',
      url: '/api/users',
      payload: { username: 'alice' },
    });
    regularUserId = JSON.parse(userRes.body).id;
  });

  afterEach(async () => {
    await server.fastify.close();
    server.sqlite.close();
  });

  describe('GET /api/health', () => {
    it('should return 200 with status ok', async () => {
      const response = await server.fastify.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('POST /api/auth/admin-login', () => {
    it('should return 200 + accessToken + refreshToken cookie on correct password', async () => {
      const response = await server.fastify.inject({
        method: 'POST',
        url: '/api/auth/admin-login',
        payload: { password: 'adminPass123' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.accessToken).toBeDefined();
      expect(typeof body.accessToken).toBe('string');

      const cookies = parseCookies(response);
      expect(cookies['refreshToken']).toBeDefined();
    });

    it('should return 401 on incorrect password', async () => {
      const response = await server.fastify.inject({
        method: 'POST',
        url: '/api/auth/admin-login',
        payload: { password: 'wrongPassword' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 when password is missing', async () => {
      const response = await server.fastify.inject({
        method: 'POST',
        url: '/api/auth/admin-login',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/auth/select/:userId', () => {
    it('should return 200 + accessToken for regular user', async () => {
      const response = await server.fastify.inject({
        method: 'POST',
        url: `/api/auth/select/${regularUserId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.accessToken).toBeDefined();

      const cookies = parseCookies(response);
      expect(cookies['refreshToken']).toBeDefined();
    });

    it('should return 403 when trying to select admin user', async () => {
      const response = await server.fastify.inject({
        method: 'POST',
        url: `/api/auth/select/${adminId}`,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 404 for non-existent userId', async () => {
      const response = await server.fastify.inject({
        method: 'POST',
        url: '/api/auth/select/99999',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should return new accessToken using valid refreshToken cookie', async () => {
      // Login first
      const loginRes = await server.fastify.inject({
        method: 'POST',
        url: '/api/auth/admin-login',
        payload: { password: 'adminPass123' },
      });
      const cookies = parseCookies(loginRes);
      const refreshToken = cookies['refreshToken'];

      // Use refresh token
      const response = await server.fastify.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies: { refreshToken },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.accessToken).toBeDefined();
      expect(typeof body.accessToken).toBe('string');
    });

    it('should return 401 when no refresh token cookie provided', async () => {
      const response = await server.fastify.inject({
        method: 'POST',
        url: '/api/auth/refresh',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 401 for invalid refresh token', async () => {
      const response = await server.fastify.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies: { refreshToken: 'invalid-token-value' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout and clear refresh token', async () => {
      // Login first
      const loginRes = await server.fastify.inject({
        method: 'POST',
        url: '/api/auth/admin-login',
        payload: { password: 'adminPass123' },
      });
      const loginBody = JSON.parse(loginRes.body);
      const accessToken = loginBody.accessToken;
      const cookies = parseCookies(loginRes);
      const refreshToken = cookies['refreshToken'];

      // Logout
      const logoutRes = await server.fastify.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { authorization: `Bearer ${accessToken}` },
        cookies: { refreshToken },
      });

      expect(logoutRes.statusCode).toBe(200);

      // Refresh should now fail
      const refreshRes = await server.fastify.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies: { refreshToken },
      });

      expect(refreshRes.statusCode).toBe(401);
    });

    it('should return 401 when called without access token', async () => {
      const response = await server.fastify.inject({
        method: 'POST',
        url: '/api/auth/logout',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('PATCH /api/auth/admin-password', () => {
    it('should update admin password and invalidate refresh tokens', async () => {
      // Login as admin
      const loginRes = await server.fastify.inject({
        method: 'POST',
        url: '/api/auth/admin-login',
        payload: { password: 'adminPass123' },
      });
      const loginBody = JSON.parse(loginRes.body);
      const accessToken = loginBody.accessToken;
      const cookies = parseCookies(loginRes);
      const oldRefreshToken = cookies['refreshToken'];

      // Change password
      const changeRes = await server.fastify.inject({
        method: 'PATCH',
        url: '/api/auth/admin-password',
        headers: { authorization: `Bearer ${accessToken}` },
        cookies: { refreshToken: oldRefreshToken },
        payload: { newPassword: 'newPassword456' },
      });

      expect(changeRes.statusCode).toBe(200);

      // Old refresh token should be invalid
      const refreshRes = await server.fastify.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies: { refreshToken: oldRefreshToken },
      });
      expect(refreshRes.statusCode).toBe(401);

      // Old password should not work
      const oldLoginRes = await server.fastify.inject({
        method: 'POST',
        url: '/api/auth/admin-login',
        payload: { password: 'adminPass123' },
      });
      expect(oldLoginRes.statusCode).toBe(401);

      // New password should work
      const newLoginRes = await server.fastify.inject({
        method: 'POST',
        url: '/api/auth/admin-login',
        payload: { password: 'newPassword456' },
      });
      expect(newLoginRes.statusCode).toBe(200);
    });

    it('should return 403 when called by regular user', async () => {
      // Login as regular user
      const loginRes = await server.fastify.inject({
        method: 'POST',
        url: `/api/auth/select/${regularUserId}`,
      });
      const loginBody = JSON.parse(loginRes.body);
      const accessToken = loginBody.accessToken;

      const response = await server.fastify.inject({
        method: 'PATCH',
        url: '/api/auth/admin-password',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { newPassword: 'hacker123' },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
