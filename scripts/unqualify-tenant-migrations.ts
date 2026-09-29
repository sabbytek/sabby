#!/usr/bin/env tsx
/**
 * Strip the "public". schema qualifier from generated tenant migrations.
 *
 * The tenant tables are declared with pgTable(), so drizzle-kit writes their
 * foreign keys as REFERENCES "public"."orders"(...). Tenant migrations run
 * once per tenant schema with search_path set to that schema, so every name
 * must stay unqualified — otherwise the constraints point at the shared
 * public schema instead of the tenant's own tables.
 *
 * Usage: npm run db:generate:tenant (runs drizzle-kit, then this script)
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(import.meta.dirname, '../db/migrations/tenant');

for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
  const path = resolve(dir, file);
  const original = readFileSync(path, 'utf8');
  const fixed = original.replaceAll('"public".', '');
  if (fixed !== original) {
    writeFileSync(path, fixed);
    console.log(`Unqualified ${file}`);
  }
}
