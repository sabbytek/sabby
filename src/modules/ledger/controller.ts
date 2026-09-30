import type { RequestContext } from '../../shared/types/controller.js';
import {
  listLedgerAccounts,
  listJournalEntries,
  getAccountBalances,
  getWalletBalance,
} from './service.js';

export async function listAccounts(ctx: RequestContext) {
  return listLedgerAccounts(ctx.schema);
}

export async function listBalances(ctx: RequestContext) {
  return getAccountBalances(ctx.schema);
}

export async function walletBalance(ctx: RequestContext) {
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
) {
  return listJournalEntries(ctx.schema, {
    ...(query.page && { page: parseInt(query.page) }),
    ...(query.limit && { limit: parseInt(query.limit) }),
    ...(query.referenceType && { referenceType: query.referenceType }),
    ...(query.referenceId && { referenceId: query.referenceId }),
  });
}
