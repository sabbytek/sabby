import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { platformGuard } from '../../../shared/middleware/platform-auth.js';
import { sendPaginated } from '../../../shared/http/response.js';
import { listAudit } from './service.js';

const listAuditQuerySchema = z
  .object({
    actorId: z.string().min(1).optional(),
    action: z.string().min(1).optional(),
    tenantId: z.string().min(1).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export default function platformAuditRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // Read-only by design: the audit log has no write, update or delete route.
  // Rows are created only by writeAudit() from the actions being recorded.
  typed.get(
    '/',
    {
      onRequest: platformGuard('audit:read'),
      schema: {
        tags: ['Platform · Audit'],
        summary: 'Query the platform audit log',
        description:
          'Append-only record of every platform-plane action. Filterable by actor, ' +
          'action, tenant and date range.',
        security: [{ bearerAuth: [] }],
        querystring: listAuditQuerySchema,
      },
    },
    async (request, reply) => {
      const { page, limit } = request.query;
      const { items, total } = await listAudit(request.query);
      return sendPaginated(reply, items, total, page, limit);
    },
  );
}
