import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { env } from '../../config/env.js';
import * as tenantSchema from './schema/tenant.js';

export type TenantDb = NeonHttpDatabase<typeof tenantSchema>;

function createTenantDb(): TenantDb {
  const sqlClient = neon(env.DATABASE_URL);
  return drizzle(sqlClient, { schema: tenantSchema });
}

/**
 * Executes a callback with the search_path set to the tenant schema.
 * Use this for all tenant-scoped database operations.
 *
 * The Neon HTTP transport is stateless per-request. search_path is set
 * via a raw SQL statement before the callback runs, scoping all queries
 * within the callback to the correct tenant schema.
 */
export async function withTenantSchema<T>(
  schemaName: string,
  callback: (db: TenantDb) => Promise<T>,
): Promise<T> {
  const tenantDb = createTenantDb();
  await tenantDb.execute(sql.raw(`SET search_path TO "${schemaName}", public`));
  return callback(tenantDb);
}

/**
 * Creates a new PostgreSQL schema for a tenant.
 * Called during tenant provisioning before running migrations.
 */
export async function provisionTenantSchema(schemaName: string): Promise<void> {
  const tenantDb = createTenantDb();
  await tenantDb.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`));
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
