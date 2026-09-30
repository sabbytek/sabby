import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../../config/env.js';
import * as publicSchema from './schema/public.js';

// Production runs on Neon and talks to it over Neon's HTTP driver. Local dev
// and CI point DATABASE_URL at a standard PostgreSQL server, which the HTTP
// driver cannot speak to — so pick the driver by host. A Neon host keeps the
// exact production path; anything else uses the wire-protocol postgres-js
// driver. The drizzle query API is identical across both.
export function isNeonUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('neon.tech');
  } catch {
    return false;
  }
}

type PublicDatabase = ReturnType<typeof drizzleNeon<typeof publicSchema>>;

// Lazy initialization — DB client is created on first use, not at module load.
// This allows the app to start and tests to run without a real DB connection
// for routes that don't require database access (e.g. /health).
let _db: PublicDatabase | null = null;

export function getDb(): PublicDatabase {
  if (!_db) {
    if (isNeonUrl(env.DATABASE_URL)) {
      _db = drizzleNeon(neon(env.DATABASE_URL), { schema: publicSchema });
    } else {
      // Standard PostgreSQL (local/CI). Cast to the Neon database type: only the
      // transport differs, the drizzle query surface every caller uses is the
      // same, so downstream types stay unchanged.
      const client = postgres(env.DATABASE_URL);
      _db = drizzlePostgres(client, { schema: publicSchema }) as unknown as PublicDatabase;
    }
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
    return Reflect.get(getDb(), prop) as unknown;
  },
});

export type PublicDb = ReturnType<typeof getDb>;
