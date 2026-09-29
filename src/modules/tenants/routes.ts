import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { sendCreated } from '../../shared/http/response.js';
import * as controller from './controller.js';
import { createTenantBodySchema, createTenantResponseSchema } from './validators.js';
import { errorEnvelopeSchema } from '../../shared/http/schemas.js';

export default function tenantRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // Public merchant self-signup.
  //
  // Unauthenticated by design — a merchant has no account until this succeeds.
  // It is therefore rate limited aggressively: each call provisions a
  // PostgreSQL schema and runs migrations, so unbounded access is a
  // resource-exhaustion vector, not just an access-control one.
  //
  // NOTE: this does not verify ownership of businessEmail. Email-verified
  // signup is tracked as follow-up work; until then, admin-initiated
  // provisioning via POST /v1/platform/tenants is the vetted path.
  typed.post(
    '/',
    {
      config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
      schema: {
        tags: ['Tenants'],
        summary: 'Provision a new merchant tenant (public signup)',
        description:
          'Creates an isolated tenant schema, seeds default data, and registers the owner ' +
          'account. Rate limited to 3 per hour per IP.',
        security: [],
        body: createTenantBodySchema,
        response: {
          201: createTenantResponseSchema,
          400: errorEnvelopeSchema,
          409: errorEnvelopeSchema,
          429: errorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      // No createContext() here: this route runs before any tenant or user
      // exists, so there is no RequestContext to build.
      const result = await controller.create(request.body);
      return sendCreated(reply, {
        tenantId: result.tenantId,
        slug: result.slug,
        message: 'Tenant provisioned successfully. Use your business email to log in.',
      });
    },
  );
}
