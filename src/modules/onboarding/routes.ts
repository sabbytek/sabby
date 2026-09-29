import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { createContext } from '../../shared/http/context.js';
import { sendSuccess } from '../../shared/http/response.js';
import * as controller from './controller.js';

export default function onboardingRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ─── GET /onboarding — merchant setup checklist ──────────────────────────
  typed.get(
    '/',
    {
      preHandler: [requireAuth, resolveTenant],
      schema: {
        tags: ['Onboarding'],
        summary: 'Get guided setup checklist for this merchant',
        description:
          'Returns which onboarding steps are complete and which are pending. ' +
          'Poll this endpoint to drive a guided first-time setup UI.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const status = await controller.getStatus(ctx);
      return sendSuccess(reply, status);
    },
  );
}
