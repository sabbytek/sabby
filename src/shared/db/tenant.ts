import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import ws from 'ws';
import { sql } from 'drizzle-orm';
import { env } from '../../config/env.js';
import * as tenantSchema from './schema/tenant.js';
import { isNeonUrl } from './client.js';
import { ValidationError } from '../errors/types.js';

export type TenantDb = NeonDatabase<typeof tenantSchema>;

// Tenant queries depend on search_path, which is session state. Neon's HTTP
// driver runs every statement as its own request, so a SET search_path is
// gone by the next query and everything silently falls through to public.
// Tenant access therefore uses Neon's WebSocket Pool (a real session) and
// runs each callback in a transaction with SET LOCAL, which also keeps the
// setting from leaking to the next user of the pooled connection.
// Node 20 has no global WebSocket, so hand the driver the ws implementation.
neonConfig.webSocketConstructor = ws;

let _tenantDb: TenantDb | null = null;

// The transaction of the withTenantSchema call currently running, if any.
const activeTenantTx = new AsyncLocalStorage<{ schemaName: string; tx: TenantDb }>();

function getTenantDb(): TenantDb {
  if (!_tenantDb) {
    if (isNeonUrl(env.DATABASE_URL)) {
      _tenantDb = drizzleNeon(new Pool({ connectionString: env.DATABASE_URL }), {
        schema: tenantSchema,
      });
    } else {
      // Standard PostgreSQL (local/CI). Same query surface; see client.ts.
      _tenantDb = drizzlePostgres(postgres(env.DATABASE_URL), {
        schema: tenantSchema,
      }) as unknown as TenantDb;
    }
  }
  return _tenantDb;
}

/**
 * Executes a callback with the search_path set to the tenant schema.
 * Use this for all tenant-scoped database operations.
 *
 * The callback runs inside one transaction on one connection: every query in
 * it sees the tenant schema, and a thrown error rolls back its writes.
 *
 * A call nested inside another for the same schema (e.g. posting journal
 * entries while confirming a payment) runs as a savepoint of the outer
 * transaction. It sees the outer, uncommitted writes, needs no second pooled
 * connection, and if it fails only its own statements roll back, so callers
 * can still .catch() a non-fatal nested failure and carry on.
 */
export async function withTenantSchema<T>(
  schemaName: string,
  callback: (db: TenantDb) => Promise<T>,
): Promise<T> {
  if (!validateSchemaName(schemaName)) {
    throw new ValidationError(`Invalid tenant schema name: "${schemaName}"`);
  }
  const outer = activeTenantTx.getStore();
  if (outer?.schemaName === schemaName) {
    return outer.tx.transaction((savepoint) =>
      activeTenantTx.run({ schemaName, tx: savepoint }, () => callback(savepoint)),
    );
  }
  return getTenantDb().transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL search_path TO "${schemaName}", public`));
    return activeTenantTx.run({ schemaName, tx }, () => callback(tx));
  });
}

/**
 * Creates a new PostgreSQL schema for a tenant.
 * Called during tenant provisioning before running migrations.
 */
export async function provisionTenantSchema(schemaName: string): Promise<void> {
  if (!validateSchemaName(schemaName)) {
    throw new ValidationError(`Invalid tenant schema name: "${schemaName}"`);
  }
  const tenantDb = getTenantDb();
  await tenantDb.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`));
  // Create the order_number_seq in the new schema for atomic order number generation.
  await tenantDb.execute(sql.raw(`CREATE SEQUENCE IF NOT EXISTS "${schemaName}".order_number_seq`));
}

/**
 * Validates that a schema name is safe to use in raw SQL.
 * Schema names: lowercase alphanumeric + underscore, max 63 chars (PostgreSQL limit).
 */
export function validateSchemaName(name: string): boolean {
  return /^[a-z][a-z0-9_]{0,62}$/.test(name);
}

/**
 * Derives a deterministic schema name from a tenant ID.
 * Format: t_{tenantId with hyphens replaced by underscores}
 */
export function tenantSchemaName(tenantId: string): string {
  return `t_${tenantId.replace(/-/g, '_')}`;
}
