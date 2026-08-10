import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { createContext } from '../../shared/http/context.js';
import { sendCreated } from '../../shared/http/response.js';
import * as controller from './controller.js';
import { createTenantBodySchema } from './validators.js';

export default function tenantRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post('/', {
    schema: {
      tags: ['Tenants'],
      summary: 'Provision a new merchant tenant',
      description:
        'Creates a new isolated tenant schema, seeds default data, and registers the owner account.',
      body: createTenantBodySchema,
    },
  }, async (request, reply) => {
    const ctx = createContext(request);
    const result = await controller.create(ctx, request.body);
    sendCreated(reply, {
      tenantId: result.tenantId,
      slug: result.slug,
      message: 'Tenant provisioned successfully. Use your business email to log in.',
    });
  });
}
