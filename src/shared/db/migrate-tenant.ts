import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { sql } from 'drizzle-orm';
import { env } from '../../config/env.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT_MIGRATIONS_PATH = path.resolve(__dirname, '../../../db/migrations/tenant');

/**
 * Runs all pending tenant schema migrations against the given schema.
 * Called during tenant provisioning and can be called again for schema upgrades.
 */
export async function runTenantMigrations(schemaName: string): Promise<void> {
  const sqlClient = neon(env.DATABASE_URL);
  const db = drizzle(sqlClient);

  // Set search_path to target schema before running migrations
  await db.execute(sql.raw(`SET search_path TO "${schemaName}"`));
  await migrate(db, { migrationsFolder: TENANT_MIGRATIONS_PATH });
}
