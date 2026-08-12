import type { RequestContext } from '../../shared/types/controller.js';
import {
  listLedgerAccounts,
  listJournalEntries,
  getAccountBalances,
  getWalletBalance,
} from './service.js';

export async function listAccounts(ctx: RequestContext): Promise<unknown> {
  const result = await listLedgerAccounts(ctx.schema);
  return result;
}

export async function listBalances(ctx: RequestContext): Promise<unknown> {
  const result = await getAccountBalances(ctx.schema);
  return result;
}

export async function walletBalance(ctx: RequestContext): Promise<unknown> {
  const balanceKobo = await getWalletBalance(ctx.schema);
  return { balanceKobo, balanceNaira: (balanceKobo / 100).toFixed(2) };
}

export async function listEntries(
  ctx: RequestContext,
  query: {
    page?: string;
    limit?: string;
    referenceType?: string;
    referenceId?: string;
  },
): Promise<unknown> {
  const result = await listJournalEntries(ctx.schema, {
    ...(query.page && { page: parseInt(query.page) }),
    ...(query.limit && { limit: parseInt(query.limit) }),
    ...(query.referenceType && { referenceType: query.referenceType }),
    ...(query.referenceId && { referenceId: query.referenceId }),
  });
  return result;
}
