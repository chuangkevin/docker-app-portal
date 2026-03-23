import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import type { DrizzleDb } from '../db/index';
import { users } from '../db/schema';

const AVATAR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F0A500', '#E74C3C', '#2ECC71', '#3498DB', '#9B59B6',
];

function randomAvatarColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

const createUserSchema = z.object({
  username: z.string().min(1).max(50).trim(),
  password: z.string().min(6).optional(),
});

const usersRoute: FastifyPluginAsync<{ db: DrizzleDb }> = async (fastify, opts) => {
  const db = opts.db;

  // GET /api/users - list all users
  fastify.get('/api/users', async (_request, reply) => {
    const allUsers = await db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        avatar_color: users.avatar_color,
      })
      .from(users);

    return reply.send(allUsers);
  });

  // POST /api/users - create user
  fastify.post('/api/users', async (request, reply) => {
    let body: z.infer<typeof createUserSchema>;
    try {
      body = createUserSchema.parse(request.body);
    } catch (err) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid request body' });
    }

    const { username, password } = body;

    // Check if any users exist
    const existingUsers = await db.select({ id: users.id }).from(users).limit(1);
    const isFirstUser = existingUsers.length === 0;

    if (isFirstUser) {
      // First user must be admin and provide password
      if (!password) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Password is required for the first admin user',
        });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const avatarColor = randomAvatarColor();

      try {
        const result = await db
          .insert(users)
          .values({
            username,
            password_hash: passwordHash,
            role: 'admin',
            avatar_color: avatarColor,
          })
          .returning({
            id: users.id,
            username: users.username,
            role: users.role,
            avatar_color: users.avatar_color,
          });

        return reply.status(201).send(result[0]);
      } catch (err: any) {
        if (err.message?.includes('UNIQUE constraint failed')) {
          return reply.status(400).send({ error: 'Bad Request', message: 'Username already exists' });
        }
        throw err;
      }
    } else {
      // Subsequent users are regular users (no password)
      const avatarColor = randomAvatarColor();

      try {
        const result = await db
          .insert(users)
          .values({
            username,
            password_hash: null,
            role: 'user',
            avatar_color: avatarColor,
          })
          .returning({
            id: users.id,
            username: users.username,
            role: users.role,
            avatar_color: users.avatar_color,
          });

        return reply.status(201).send(result[0]);
      } catch (err: any) {
        if (err.message?.includes('UNIQUE constraint failed')) {
          return reply.status(400).send({ error: 'Bad Request', message: 'Username already exists' });
        }
        throw err;
      }
    }
  });
};

export default usersRoute;
