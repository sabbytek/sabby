/**
 * Driver-agnostic migration session.
 *
 * Mirrors the choice getDb() makes in client.ts: production is Neon over its
 * HTTP driver, while local dev and CI point DATABASE_URL at a standard
 * PostgreSQL server the HTTP driver cannot speak to. Migrations were
 * previously pinned to Neon, so a developer with a local Postgres could not
 * bring their database up at all.
 */

import { Client, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { migrate as migrateNeon } from 'drizzle-orm/neon-serverless/migrator';
import ws from 'ws';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { isNeonUrl } from './client.js';

export interface MigrationSession {
  /** Run a raw statement before migrating — e.g. setting search_path. */
  execute(statement: string): Promise<void>;
  /**
   * migrationsSchema: where drizzle records applied migrations. Tenant
   * migrations must pass the tenant schema, or every tenant after the first
   * finds them "already applied" in the shared record and gets no tables.
   */
  migrate(migrationsFolder: string, migrationsSchema?: string): Promise<void>;
  /** Releases the connection. A postgres-js script hangs without it. */
  close(): Promise<void>;
}

/**
 * Neon's pooled host (ep-xxx-pooler) shares server connections between
 * clients. The session-level SET search_path a tenant migration needs would
 * stay on a shared connection and redirect other clients' unqualified queries
 * into that tenant's schema. Migrations therefore use the direct host.
 */
export function directNeonUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hostname = parsed.hostname.replace('-pooler.', '.');
  return parsed.toString();
}

export async function createMigrationSession(): Promise<MigrationSession> {
  if (isNeonUrl(env.DATABASE_URL)) {
    // One WebSocket client, not the HTTP driver: the HTTP driver is stateless
    // per statement, so a SET search_path would not reach the migration.
    neonConfig.webSocketConstructor = ws;
    const client = new Client(directNeonUrl(env.DATABASE_URL));
    await client.connect();
    const db = drizzleNeon(client);
    return {
      execute: async (statement) => {
        await db.execute(sql.raw(statement));
      },
      migrate: (migrationsFolder, migrationsSchema) =>
        migrateNeon(db, { migrationsFolder, ...(migrationsSchema ? { migrationsSchema } : {}) }),
      close: async () => {
        await client.end();
      },
    };
  }

  // max: 1 is load-bearing, not tuning. postgres-js pools, and a SET
  // search_path on one pooled connection is invisible to the next — the tenant
  // migration would then run against public. One connection keeps the session
  // state the migration depends on.
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzlePostgres(client);

  return {
    execute: async (statement) => {
      await db.execute(sql.raw(statement));
    },
    migrate: (migrationsFolder, migrationsSchema) =>
      migratePostgres(db, { migrationsFolder, ...(migrationsSchema ? { migrationsSchema } : {}) }),
    close: async () => {
      await client.end();
    },
  };
}
