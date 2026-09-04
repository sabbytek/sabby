#!/usr/bin/env tsx
/**
 * Applies the platform-plane migration (db/migrations/public/0001_platform_plane.sql).
 *
 * Usage:
 *   npm run db:migrate:platform
 *
 * Idempotent: every table/index is IF NOT EXISTS, and the single CREATE TYPE is
 * tolerant of an "already exists" duplicate. Standalone because the public
 * schema is not yet under drizzle-kit migration control.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { env } from '../src/config/env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = resolve(__dirname, '../db/migrations/public/0001_platform_plane.sql');

function statements(sqlText: string): string[] {
  return sqlText
    .split('\n')
    .filter((line) => !line.trim().startsWith('--')) // drop comment lines
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isAlreadyExists(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /already exists/i.test(message);
}

async function main() {
  const sqlClient = neon(env.DATABASE_URL);
  const sqlText = readFileSync(SQL_FILE, 'utf8');
  const stmts = statements(sqlText);

  console.log(`Applying ${stmts.length} platform-plane statements ...`);
  for (const stmt of stmts) {
    try {
      await sqlClient.query(stmt);
    } catch (err) {
      if (isAlreadyExists(err)) {
        continue; // idempotent re-run
      }
      throw err;
    }
  }
  console.log('Platform-plane migration completed');
}

main().catch((err) => {
  console.error('Platform-plane migration failed:', err);
  process.exit(1);
});
