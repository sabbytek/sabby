import { eq, or, like, desc, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { withTenantSchema } from '../../shared/db/tenant.js';
import { customers } from '../../shared/db/schema/tenant.js';
import type { Customer } from '../../shared/db/schema/tenant.js';
import { NotFoundError } from '../../shared/errors/types.js';
import type { PaginatedResult } from '../../shared/types/index.js';

export async function createCustomer(
  schemaName: string,
  input: {
    firstName: string;
    lastName?: string;
    email?: string;
    phone?: string;
    address?: string;
    note?: string;
    consentGivenAt?: string; // ISO 8601 — the moment the customer consented to data collection
    consentSource?: string;  // 'pos_signup' | 'whatsapp_chat' | 'web_checkout' | 'manual'
  },
) {
  return withTenantSchema(schemaName, async (db) => {
    const id = uuidv4();
    await db.insert(customers).values({
      id,
      firstName: input.firstName,
      lastName: input.lastName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      note: input.note ?? null,
      ...(input.consentGivenAt && { consentGivenAt: new Date(input.consentGivenAt) }),
      ...(input.consentSource && { consentSource: input.consentSource }),
    });
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer!;
  });
}

export async function listCustomers(
  schemaName: string,
  query: { page?: number; limit?: number; search?: string },
): Promise<PaginatedResult<Customer>> {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(query.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  return withTenantSchema(schemaName, async (db) => {
    const where = query.search
      ? or(
          like(customers.firstName, `%${query.search}%`),
          like(customers.phone, `%${query.search}%`),
          like(customers.email, `%${query.search}%`),
        )
      : undefined;

    const [countRow] = await db
      .select({ count: sql<string>`count(*)` })
      .from(customers)
      .where(where);

    const items = await db
      .select()
      .from(customers)
      .where(where)
      .orderBy(desc(customers.createdAt))
      .limit(limit)
      .offset(offset);

    const total = parseInt(countRow?.count ?? '0');
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  });
}

export async function getCustomer(schemaName: string, customerId: string) {
  return withTenantSchema(schemaName, async (db) => {
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    if (!customer) throw new NotFoundError('Customer', customerId);
    return customer;
  });
}

export async function updateCustomer(
  schemaName: string,
  customerId: string,
  input: Partial<{
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    note: string | null;
    consentGivenAt: Date | null;
    consentSource: string | null;
  }>,
) {
  return withTenantSchema(schemaName, async (db) => {
    const [existing] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    if (!existing) throw new NotFoundError('Customer', customerId);

    await db
      .update(customers)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(customers.id, customerId));

    const [updated] = await db.select().from(customers).where(eq(customers.id, customerId));
    return updated!;
  });
}
