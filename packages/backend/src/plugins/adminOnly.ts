import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    adminOnly: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const adminOnlyPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate(
    'adminOnly',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
      }
      if (request.user.role !== 'admin') {
        return reply.status(403).send({ error: 'Forbidden', message: 'Admin access required' });
      }
    },
  );
};

export default fp(adminOnlyPlugin, { name: 'adminOnly' });
