import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { platformGuard } from '../../../shared/middleware/platform-auth.js';
import { sendSuccess } from '../../../shared/http/response.js';
import { getOverviewKpis } from './service.js';

export default function platformOverviewRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // Read-only aggregate. Gated on tenants:read rather than analytics:read —
  // it is a roll-up of the tenant records themselves, so anyone who may list
  // tenants may see their totals, and nobody else.
  typed.get(
    '/',
    {
      onRequest: platformGuard('tenants:read'),
      schema: {
        tags: ['Platform · Overview'],
        summary: 'Platform-wide tenant KPIs',
        description:
          'Counts backing the admin dashboard landing page: totals, active tenants, ' +
          'signups in the last 30 days, and the subscription-status and plan breakdowns.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (_request, reply) => {
      const kpis = await getOverviewKpis();
      return sendSuccess(reply, kpis);
    },
  );
}
