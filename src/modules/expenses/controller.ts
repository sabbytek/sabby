import type { RequestContext } from '../../shared/types/controller.js';
import { auditUserAction } from '../../shared/audit/tenant-audit.js';
import { createExpense, listExpenses, getExpense } from './service.js';

export async function create(
  ctx: RequestContext,
  input: {
    description: string;
    amountKobo: number;
    category: string;
    expenseDate: string;
    locationId?: string;
    receiptUrl?: string;
  },
) {
  const expense = await createExpense(ctx.schema, ctx.userId, input);
  await auditUserAction(ctx, {
    action: 'expense.created',
    targetType: 'expense',
    targetId: expense.id,
    metadata: { amountKobo: input.amountKobo, category: input.category },
  });
  return expense;
}

export async function list(
  ctx: RequestContext,
  query: {
    page?: string;
    limit?: string;
    category?: string;
    locationId?: string;
    from?: string;
    to?: string;
  },
) {
  return listExpenses(ctx.schema, {
    ...(query.page && { page: parseInt(query.page) }),
    ...(query.limit && { limit: parseInt(query.limit) }),
    ...(query.category && { category: query.category }),
    ...(query.locationId && { locationId: query.locationId }),
    ...(query.from && { from: query.from }),
    ...(query.to && { to: query.to }),
  });
}

export async function get(ctx: RequestContext, id: string) {
  return getExpense(ctx.schema, id);
}
