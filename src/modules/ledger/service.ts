import { v4 as uuidv4 } from 'uuid';
import { eq, sql, desc, and } from 'drizzle-orm';
import { withTenantSchema } from '../../shared/db/tenant.js';
import {
  ledgerAccounts,
  journalEntries,
  journalLines,
} from '../../shared/db/schema/tenant.js';
import type { JournalEntryDraft } from './templates.js';

// ─── Post journal entry ───────────────────────────────────────────────────────

export async function postJournalEntry(
  schemaName: string,
  draft: JournalEntryDraft,
  createdBy = 'system',
) {
  return withTenantSchema(schemaName, async (db) => {
    // Resolve account codes to IDs
    const codes = [...new Set(draft.lines.map((l) => l.accountCode))];
    const accounts = await db
      .select({ id: ledgerAccounts.id, code: ledgerAccounts.code })
      .from(ledgerAccounts)
      .where(sql`${ledgerAccounts.code} = ANY(ARRAY[${sql.join(codes.map((c) => sql`${c}`), sql`, `)}])`);

    const codeToId = new Map(accounts.map((a) => [a.code, a.id]));

    for (const code of codes) {
      if (!codeToId.has(code)) {
        throw new Error(`Ledger account code '${code}' not found in tenant schema`);
      }
    }

    const entryId = uuidv4();

    await db.insert(journalEntries).values({
      id: entryId,
      referenceId: draft.referenceId,
      referenceType: draft.referenceType,
      description: draft.description,
      createdBy,
    });

    await db.insert(journalLines).values(
      draft.lines.map((line) => ({
        id: uuidv4(),
        journalEntryId: entryId,
        accountId: codeToId.get(line.accountCode)!,
        type: line.type,
        amountKobo: line.amountKobo,
      })),
    );

    return entryId;
  });
}

// ─── List journal entries ─────────────────────────────────────────────────────

export async function listJournalEntries(
  schemaName: string,
  query: {
    page?: number;
    limit?: number;
    referenceType?: string;
    referenceId?: string;
  },
) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(query.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  return withTenantSchema(schemaName, async (db) => {
    const conditions = [];
    if (query.referenceType) conditions.push(eq(journalEntries.referenceType, query.referenceType));
    if (query.referenceId) conditions.push(eq(journalEntries.referenceId, query.referenceId));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRow] = await db
      .select({ count: sql<string>`count(*)` })
      .from(journalEntries)
      .where(where);

    const items = await db
      .select()
      .from(journalEntries)
      .where(where)
      .orderBy(desc(journalEntries.postedAt))
      .limit(limit)
      .offset(offset);

    const total = parseInt(countRow?.count ?? '0');
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  });
}

// ─── Account balances ─────────────────────────────────────────────────────────

export async function getAccountBalances(schemaName: string) {
  return withTenantSchema(schemaName, async (db) => {
    const accounts = await db.select().from(ledgerAccounts);

    const balances = await db
      .select({
        accountId: journalLines.accountId,
        type: journalLines.type,
        total: sql<string>`sum(${journalLines.amountKobo})`,
      })
      .from(journalLines)
      .groupBy(journalLines.accountId, journalLines.type);

    const debitMap = new Map<string, number>();
    const creditMap = new Map<string, number>();

    for (const row of balances) {
      if (row.type === 'debit') {
        debitMap.set(row.accountId, parseInt(row.total ?? '0'));
      } else {
        creditMap.set(row.accountId, parseInt(row.total ?? '0'));
      }
    }

    return accounts.map((account) => {
      const debits = debitMap.get(account.id) ?? 0;
      const credits = creditMap.get(account.id) ?? 0;
      // For asset/expense accounts: balance = debits - credits (normal debit balance)
      // For liability/equity/revenue accounts: balance = credits - debits (normal credit balance)
      const isDebitNormal = account.type === 'asset' || account.type === 'expense';
      const balanceKobo = isDebitNormal ? debits - credits : credits - debits;
      return { ...account, debitsKobo: debits, creditsKobo: credits, balanceKobo };
    });
  });
}

// ─── Wallet balance (Cash account) ────────────────────────────────────────────

export async function getWalletBalance(schemaName: string): Promise<number> {
  return withTenantSchema(schemaName, async (db) => {
    const [cashAccount] = await db
      .select({ id: ledgerAccounts.id })
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.code, '1000'))
      .limit(1);

    if (!cashAccount) return 0;

    const [row] = await db
      .select({
        debits: sql<string>`coalesce(sum(case when ${journalLines.type} = 'debit' then ${journalLines.amountKobo} else 0 end), 0)`,
        credits: sql<string>`coalesce(sum(case when ${journalLines.type} = 'credit' then ${journalLines.amountKobo} else 0 end), 0)`,
      })
      .from(journalLines)
      .where(eq(journalLines.accountId, cashAccount.id));

    const debits = parseInt(row?.debits ?? '0');
    const credits = parseInt(row?.credits ?? '0');
    return debits - credits; // Asset account: normal debit balance
  });
}

// ─── List ledger accounts ─────────────────────────────────────────────────────

export async function listLedgerAccounts(schemaName: string) {
  return withTenantSchema(schemaName, async (db) => {
    return db.select().from(ledgerAccounts).orderBy(ledgerAccounts.code);
  });
}
