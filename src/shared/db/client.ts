import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { env } from '../../config/env.js';
import * as publicSchema from './schema/public.js';

neonConfig.fetchConnectionCache = true;

// Lazy initialization — DB client is created on first use, not at module load.
// This allows the app to start and tests to run without a real DB connection
// for routes that don't require database access (e.g. /health).
let _db: ReturnType<typeof drizzle<typeof publicSchema>> | null = null;

export function getDb() {
  if (!_db) {
    const sql = neon(env.DATABASE_URL);
    _db = drizzle(sql, { schema: publicSchema });
  }
  return _db;
}

/**
 * Platform-level DB client — operates on the public schema.
 * Used for tenant management and platform-wide lookups only.
 * Use as a function call: getDb() or import the proxy `db` for convenience.
 */
export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get(_target, prop) {
    return Reflect.get(getDb(), prop);
  },
}) as ReturnType<typeof getDb>;

export type PublicDb = ReturnType<typeof getDb>;
