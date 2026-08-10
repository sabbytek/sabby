import { v4 as uuidv4 } from 'uuid';
import type { FastifyInstance } from 'fastify';

export function registerRequestId(app: FastifyInstance) {
  app.addHook('onRequest', async (request) => {
    const existing = request.headers['x-request-id'];
    if (!existing) {
      request.headers['x-request-id'] = uuidv4();
    }
  });

  app.addHook('onSend', async (request, reply) => {
    const requestId = request.headers['x-request-id'];
    if (requestId) {
      void reply.header('x-request-id', requestId);
    }
  });
}
