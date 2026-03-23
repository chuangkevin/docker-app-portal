import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import type { DrizzleDb } from '../db/index';
import { users, refresh_tokens } from '../db/schema';
import {
  generateAccessToken,
  generateRefreshToken,
} from '../services/token';

const REFRESH_TOKEN_COOKIE = 'refreshToken';
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

const adminLoginSchema = z.object({
  password: z.string().min(1),
});

const adminPasswordSchema = z.object({
  newPassword: z.string().min(6),
});

function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'dev-secret';
}

const authRoute: FastifyPluginAsync<{ db: DrizzleDb }> = async (fastify, opts) => {
  const db = opts.db;

  async function issueTokens(
    user: { id: number; username: string; role: 'admin' | 'user' },
    reply: FastifyReply,
  ) {
    const jwtSecret = getJwtSecret();
    const { token: accessToken } = generateAccessToken(
      { userId: user.id, username: user.username, role: user.role },
      jwtSecret,
    );

    const { token: refreshToken, expiresAt: refreshExpiresAt } = generateRefreshToken();

    // Store refresh token in DB
    await db.insert(refresh_tokens).values({
      user_id: user.id,
      token: refreshToken,
      expires_at: refreshExpiresAt,
    });

    // Set httpOnly cookie
    reply.setCookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: REFRESH_TOKEN_MAX_AGE,
      path: '/',
    });

    return { accessToken };
  }

  // POST /api/auth/select/:userId - select user (non-admin only)
  fastify.post<{ Params: { userId: string } }>(
    '/api/auth/select/:userId',
    async (request, reply) => {
      const userId = parseInt(request.params.userId, 10);
      if (isNaN(userId)) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid userId' });
      }

      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user.length) {
        return reply.status(404).send({ error: 'Not Found', message: 'User not found' });
      }

      const selectedUser = user[0];

      // Admin must use admin-login
      if (selectedUser.role === 'admin') {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Admin users must authenticate via /api/auth/admin-login',
        });
      }

      const result = await issueTokens(
        { id: selectedUser.id, username: selectedUser.username, role: selectedUser.role as 'user' },
        reply,
      );

      return reply.send(result);
    },
  );

  // POST /api/auth/admin-login - admin login with password
  fastify.post('/api/auth/admin-login', async (request, reply) => {
    let body: z.infer<typeof adminLoginSchema>;
    try {
      body = adminLoginSchema.parse(request.body);
    } catch {
      return reply.status(400).send({ error: 'Bad Request', message: 'Password is required' });
    }

    // Find admin user
    const adminUsers = await db
      .select()
      .from(users)
      .where(eq(users.role, 'admin'))
      .limit(1);

    if (!adminUsers.length) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'No admin user found' });
    }

    const admin = adminUsers[0];
    if (!admin.password_hash) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Admin has no password set' });
    }

    const passwordMatch = await bcrypt.compare(body.password, admin.password_hash);
    if (!passwordMatch) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid password' });
    }

    const result = await issueTokens(
      { id: admin.id, username: admin.username, role: 'admin' },
      reply,
    );

    return reply.send(result);
  });

  // POST /api/auth/refresh - refresh access token using cookie
  fastify.post('/api/auth/refresh', async (request, reply) => {
    const refreshTokenValue = request.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!refreshTokenValue) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'No refresh token provided' });
    }

    // Look up refresh token in DB
    const tokenRecord = await db
      .select()
      .from(refresh_tokens)
      .where(eq(refresh_tokens.token, refreshTokenValue))
      .limit(1);

    if (!tokenRecord.length) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid refresh token' });
    }

    const record = tokenRecord[0];
    if (record.expires_at < Date.now()) {
      // Clean up expired token
      await db.delete(refresh_tokens).where(eq(refresh_tokens.id, record.id));
      return reply.status(401).send({ error: 'Unauthorized', message: 'Refresh token expired' });
    }

    // Get user
    const userRecord = await db
      .select()
      .from(users)
      .where(eq(users.id, record.user_id))
      .limit(1);

    if (!userRecord.length) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'User not found' });
    }

    const user = userRecord[0];
    const jwtSecret = getJwtSecret();
    const { token: accessToken } = generateAccessToken(
      { userId: user.id, username: user.username, role: user.role as 'admin' | 'user' },
      jwtSecret,
    );

    return reply.send({ accessToken });
  });

  // POST /api/auth/logout - requires JWT
  fastify.post(
    '/api/auth/logout',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const refreshTokenValue = request.cookies?.[REFRESH_TOKEN_COOKIE];

      if (refreshTokenValue) {
        // Delete refresh token from DB
        await db
          .delete(refresh_tokens)
          .where(eq(refresh_tokens.token, refreshTokenValue));
      }

      // Clear the cookie
      reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });

      return reply.send({ message: 'Logged out successfully' });
    },
  );

  // PATCH /api/auth/admin-password - admin only, change password
  fastify.patch(
    '/api/auth/admin-password',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (request, reply) => {
      let body: z.infer<typeof adminPasswordSchema>;
      try {
        body = adminPasswordSchema.parse(request.body);
      } catch {
        return reply.status(400).send({ error: 'Bad Request', message: 'newPassword must be at least 6 characters' });
      }

      const newHash = await bcrypt.hash(body.newPassword, 10);

      // Update admin password
      await db
        .update(users)
        .set({ password_hash: newHash })
        .where(and(eq(users.id, request.user.userId), eq(users.role, 'admin')));

      // Delete all admin refresh tokens
      await db
        .delete(refresh_tokens)
        .where(eq(refresh_tokens.user_id, request.user.userId));

      // Clear cookie
      reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });

      return reply.send({ message: 'Password updated successfully' });
    },
  );
};

export default authRoute;
