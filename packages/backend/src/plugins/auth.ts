import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken, type TokenPayload } from '../services/token';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: TokenPayload;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Missing or invalid authorization header' });
      }

      const token = authHeader.slice(7);
      const jwtSecret = process.env.JWT_SECRET || 'dev-secret';

      try {
        const payload = verifyAccessToken(token, jwtSecret);
        request.user = payload;
      } catch (err) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
      }
    },
  );
};

export default fp(authPlugin, { name: 'auth' });
