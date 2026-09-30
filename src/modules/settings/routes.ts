import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { requireAuth, requireManager } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { sendPaginated } from '../../shared/http/response.js';
import { listTenantAudit } from '../../shared/audit/tenant-audit.js';

const auditQuerySchema = z
  .object({
    actorType: z.enum(['user', 'platform', 'system']).optional(),
    action: z.string().min(1).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

/**
 * Merchant-facing business settings.
 *
 * Phase B ships only the activity trail, because that is what makes support
 * access visible to the merchant. The rest of the settings surface (business
 * profile, session management, data export) is Phase C.
 */
export default function settingsRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/audit',
    // Manager-or-owner: the trail names staff and shows why BPOS staff looked
    // at the account, so it is not general staff-level reading.
    {
      preHandler: [requireAuth, resolveTenant, requireManager],
      schema: {
        tags: ['Settings'],
        summary: 'Your business activity trail',
        description:
          'Who did what in your business, including any access by BPOS support staff ' +
          'and the reason they gave. Filter with actorType=platform to see only ' +
          'BPOS staff access.',
        security: [{ bearerAuth: [] }],
        querystring: auditQuerySchema,
      },
    },
    async (request, reply) => {
      const { page, limit } = request.query;
      const { items, total } = await listTenantAudit(request.tenant.schema, request.query);
      return sendPaginated(reply, items, total, page, limit);
    },
  );
}
