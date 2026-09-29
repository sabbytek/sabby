/**
 * Runs tenant schema migrations against a single tenant schema.
 * Usage: npm run db:migrate:tenant -- <schema_name>
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { ValidationError } from '../errors/types.js';
import { validateSchemaName } from './tenant.js';
import { createMigrationSession } from './migration-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TENANT_MIGRATIONS_PATH = path.resolve(__dirname, '../../../db/migrations/tenant');

/**
 * Runs all pending tenant schema migrations against the given schema.
 * Called during tenant provisioning and can be called again for schema upgrades.
 */
export async function runTenantMigrations(schemaName: string): Promise<void> {
  // The name reaches raw SQL below. It is server-derived today
  // (tenantSchemaName()), but this is the one path that took it on trust —
  // the same guard provisionTenantSchema() and withTenantSchema() apply.
  if (!validateSchemaName(schemaName)) {
    throw new ValidationError(`Invalid tenant schema name: "${schemaName}"`);
  }

  const session = await createMigrationSession();
  try {
    // Set search_path to target schema before running migrations
    await session.execute(`SET search_path TO "${schemaName}"`);
    await session.migrate(TENANT_MIGRATIONS_PATH, schemaName);
  } finally {
    await session.close();
  }
}

// CLI entry point. Guarded so importing this module during tenant provisioning
// does not try to read a schema name off the server's argv.
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const schemaName = process.argv[2];
  if (!schemaName) {
    console.error('Usage: npm run db:migrate:tenant -- <schema_name>');
    process.exit(1);
  }
  await runTenantMigrations(schemaName);
  console.log(`Tenant schema migrations completed for "${schemaName}"`);
}
