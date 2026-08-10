import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { db } from '../../shared/db/client.js';
import { tenants } from '../../shared/db/schema/public.js';
import {
  provisionTenantSchema,
  tenantSchemaName,
  withTenantSchema,
} from '../../shared/db/tenant.js';
import { ConflictError } from '../../shared/errors/types.js';
import { registerOwner } from '../auth/service.js';
import { runTenantMigrations } from '../../shared/db/migrate-tenant.js';

export interface CreateTenantInput {
  name: string;
  slug: string;
  businessEmail: string;
  businessPhone?: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerPassword: string;
}

export interface CreateTenantResult {
  tenantId: string;
  slug: string;
  schemaName: string;
}

export async function createTenant(input: CreateTenantInput): Promise<CreateTenantResult> {
  const slug = input.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  // Check slug uniqueness
  const [existing] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);

  if (existing) {
    throw new ConflictError(`Tenant slug '${slug}' is already taken`);
  }

  const tenantId = uuidv4();
  const schemaName = tenantSchemaName(tenantId);

  // Create tenant record in public schema
  await db.insert(tenants).values({
    id: tenantId,
    name: input.name,
    slug,
    schemaName,
    businessEmail: input.businessEmail.toLowerCase(),
    businessPhone: input.businessPhone ?? null,
    planTier: 'trial',
    subscriptionStatus: 'trial',
  });

  // Create the PostgreSQL schema and run tenant template migrations
  await provisionTenantSchema(schemaName);
  await runTenantMigrations(schemaName);

  // Register the owner user within the new tenant schema
  await registerOwner(schemaName, {
    email: input.businessEmail,
    password: input.ownerPassword,
    firstName: input.ownerFirstName,
    lastName: input.ownerLastName,
  });

  // Seed default data (default location, chart of accounts)
  await withTenantSchema(schemaName, async (tenantDb) => {
    const { locations, ledgerAccounts } = await import('../../shared/db/schema/tenant.js');
    const { v4: uuid } = await import('uuid');

    await tenantDb.insert(locations).values({
      id: uuid(),
      name: 'Main Location',
      isDefault: true,
    });

    await tenantDb.insert(ledgerAccounts).values([
      { id: uuid(), code: '1000', name: 'Cash', type: 'asset', isSystem: true },
      { id: uuid(), code: '1100', name: 'Accounts Receivable', type: 'asset', isSystem: true },
      { id: uuid(), code: '2000', name: 'Accounts Payable', type: 'liability', isSystem: true },
      { id: uuid(), code: '3000', name: 'Owner Equity', type: 'equity', isSystem: true },
      { id: uuid(), code: '4000', name: 'Revenue', type: 'revenue', isSystem: true },
      { id: uuid(), code: '5000', name: 'Cost of Goods Sold', type: 'expense', isSystem: true },
      { id: uuid(), code: '5100', name: 'Payment Processing Fees', type: 'expense', isSystem: true },
      { id: uuid(), code: '5200', name: 'Operating Expenses', type: 'expense', isSystem: true },
      { id: uuid(), code: '5300', name: 'Refunds', type: 'expense', isSystem: true },
    ]);
  });

  return { tenantId, slug, schemaName };
}
