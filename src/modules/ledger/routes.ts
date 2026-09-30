import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { createContext } from '../../shared/http/context.js';
import { sendSuccess } from '../../shared/http/response.js';
import * as controller from './controller.js';
import { listEntriesQuerySchema } from './validators.js';

export default async function ledgerRoutes(fastify: FastifyInstance) {
  const typed = fastify.withTypeProvider<ZodTypeProvider>();
  const guard = [requireAuth, resolveTenant, requireFeature('ledger:view')];

  // GET /ledger/accounts — chart of accounts
  typed.get(
    '/accounts',
    {
      preHandler: guard,
      schema: {
        tags: ['Ledger'],
        summary: 'List chart of accounts',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const accounts = await controller.listAccounts(ctx);
      sendSuccess(reply, accounts);
    },
  );

  // GET /ledger/balances — account balances with debit/credit totals
  typed.get(
    '/balances',
    {
      preHandler: guard,
      schema: {
        tags: ['Ledger'],
        summary: 'Get account balances (derived from ledger)',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const balances = await controller.listBalances(ctx);
      sendSuccess(reply, balances);
    },
  );

  // GET /ledger/wallet — cash account balance
  typed.get(
    '/wallet',
    {
      preHandler: guard,
      schema: {
        tags: ['Ledger'],
        summary: 'Get platform wallet balance (cash account)',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const wallet = await controller.walletBalance(ctx);
      sendSuccess(reply, wallet);
    },
  );

  // GET /ledger/entries — paginated journal entries
  typed.get(
    '/entries',
    {
      preHandler: guard,
      schema: {
        tags: ['Ledger'],
        summary: 'List journal entries',
        security: [{ bearerAuth: [] }],
        querystring: listEntriesQuerySchema,
      },
    },
    async (request, reply) => {
      const ctx = createContext(request);
      const result = await controller.listEntries(ctx, request.query);
      sendSuccess(reply, result);
    },
  );
}
