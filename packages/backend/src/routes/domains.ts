import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { CaddyfileService } from '../services/caddyfile';

const addDomainSchema = z.object({
  subdomain: z.string().min(1).max(63).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Invalid subdomain format'),
  port: z.number().int().min(1).max(65535),
});

const updateDomainSchema = z.object({
  port: z.number().int().min(1).max(65535),
});

const domainsRoute: FastifyPluginAsync<{ caddyfileService: CaddyfileService }> = async (fastify, opts) => {
  const caddyfileService = opts.caddyfileService;

  // GET /api/domains - list all domain bindings
  fastify.get(
    '/api/domains',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (_request, reply) => {
      try {
        const bindings = caddyfileService.parseBindings();
        return reply.send(bindings);
      } catch (err) {
        return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to parse Caddyfile' });
      }
    },
  );

  // POST /api/domains - add a new domain binding
  fastify.post(
    '/api/domains',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (request, reply) => {
      let body: z.infer<typeof addDomainSchema>;
      try {
        body = addDomainSchema.parse(request.body);
      } catch {
        return reply.status(400).send({ error: 'Bad Request', message: 'Invalid request body. subdomain and port are required.' });
      }

      try {
        caddyfileService.addBinding(body.subdomain, body.port);
        await caddyfileService.restartCaddy();
        return reply.status(201).send({ success: true, subdomain: body.subdomain, port: body.port });
      } catch (err: any) {
        if (err.message?.includes('already exists')) {
          return reply.status(409).send({ error: 'Conflict', message: err.message });
        }
        return reply.status(500).send({ error: 'Internal Server Error', message: err.message || 'Failed to add domain binding' });
      }
    },
  );

  // PUT /api/domains/:subdomain - update an existing domain binding
  fastify.put<{ Params: { subdomain: string } }>(
    '/api/domains/:subdomain',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (request, reply) => {
      const { subdomain } = request.params;

      let body: z.infer<typeof updateDomainSchema>;
      try {
        body = updateDomainSchema.parse(request.body);
      } catch {
        return reply.status(400).send({ error: 'Bad Request', message: 'port is required and must be a valid port number' });
      }

      try {
        caddyfileService.updateBinding(subdomain, body.port);
        await caddyfileService.restartCaddy();
        return reply.send({ success: true, subdomain, port: body.port });
      } catch (err: any) {
        if (err.message?.includes('not found')) {
          return reply.status(404).send({ error: 'Not Found', message: err.message });
        }
        return reply.status(500).send({ error: 'Internal Server Error', message: err.message || 'Failed to update domain binding' });
      }
    },
  );

  // DELETE /api/domains/:subdomain - remove a domain binding
  fastify.delete<{ Params: { subdomain: string } }>(
    '/api/domains/:subdomain',
    { preHandler: [fastify.authenticate, fastify.adminOnly] },
    async (request, reply) => {
      const { subdomain } = request.params;

      try {
        caddyfileService.removeBinding(subdomain);
        await caddyfileService.restartCaddy();
        return reply.send({ success: true });
      } catch (err: any) {
        return reply.status(500).send({ error: 'Internal Server Error', message: err.message || 'Failed to remove domain binding' });
      }
    },
  );
};

export default domainsRoute;
