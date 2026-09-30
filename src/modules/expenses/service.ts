import { v4 as uuidv4 } from 'uuid';
import { eq, and, desc, sql } from 'drizzle-orm';
import { withTenantSchema } from '../../shared/db/tenant.js';
import { expenses } from '../../shared/db/schema/tenant.js';
import type { Expense } from '../../shared/db/schema/tenant.js';
import { NotFoundError } from '../../shared/errors/types.js';
import type { PaginatedResult } from '../../shared/types/index.js';
import { postJournalEntry } from '../ledger/service.js';
import { expenseRecordedTemplate } from '../ledger/templates.js';
import { resolveFileUrl } from '../../shared/storage/private.js';

// receiptUrl may hold a private-storage reference; callers get a signed link.
async function withSignedReceipt(schemaName: string, expense: Expense): Promise<Expense> {
  return { ...expense, receiptUrl: await resolveFileUrl(expense.receiptUrl, schemaName) };
}

export async function createExpense(
  schemaName: string,
  userId: string,
  input: {
    description: string;
    amountKobo: number;
    category: string;
    expenseDate: string; // ISO 8601
    locationId?: string;
    receiptUrl?: string;
  },
) {
  const id = uuidv4();

  await withTenantSchema(schemaName, async (db) => {
    await db.insert(expenses).values({
      id,
      description: input.description,
      amountKobo: input.amountKobo,
      category: input.category,
      expenseDate: new Date(input.expenseDate),
      locationId: input.locationId ?? null,
      receiptUrl: input.receiptUrl ?? null,
      createdBy: userId,
    });
  });

  // Post journal entry: DR Operating Expenses / CR Cash
  await postJournalEntry(
    schemaName,
    expenseRecordedTemplate(id, input.amountKobo, input.description),
    userId,
  ).catch(() => {
    /* non-fatal: secondary failure intentionally ignored */
  });

  const expense = await withTenantSchema(schemaName, async (db) => {
    const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
    return row!;
  });
  return withSignedReceipt(schemaName, expense);
}

export async function listExpenses(
  schemaName: string,
  query: {
    page?: number;
    limit?: number;
    category?: string;
    locationId?: string;
    from?: string;
    to?: string;
  },
): Promise<PaginatedResult<Expense>> {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(query.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  const result = await withTenantSchema(schemaName, async (db) => {
    const conditions = [];
    if (query.category) conditions.push(eq(expenses.category, query.category));
    if (query.locationId) conditions.push(eq(expenses.locationId, query.locationId));
    if (query.from) conditions.push(sql`${expenses.expenseDate} >= ${query.from}`);
    if (query.to) conditions.push(sql`${expenses.expenseDate} <= ${query.to}`);

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRow] = await db
      .select({ count: sql<string>`count(*)` })
      .from(expenses)
      .where(where);

    const items = await db
      .select()
      .from(expenses)
      .where(where)
      .orderBy(desc(expenses.expenseDate))
      .limit(limit)
      .offset(offset);

    const total = parseInt(countRow?.count ?? '0');
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  });
  return {
    ...result,
    items: await Promise.all(result.items.map((row) => withSignedReceipt(schemaName, row))),
  };
}

export async function getExpense(schemaName: string, expenseId: string) {
  const expense = await withTenantSchema(schemaName, async (db) => {
    const [row] = await db.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
    if (!row) throw new NotFoundError('Expense', expenseId);
    return row;
  });
  return withSignedReceipt(schemaName, expense);
}
