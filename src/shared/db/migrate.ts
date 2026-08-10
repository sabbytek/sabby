/**
 * Runs public schema migrations (platform-level).
 * Run once on initial setup and after each public schema migration.
 * Usage: npm run db:migrate
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { env } from '../../config/env.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_MIGRATIONS_PATH = path.resolve(__dirname, '../../../db/migrations/public');

const sqlClient = neon(env.DATABASE_URL);
const db = drizzle(sqlClient);

await migrate(db, { migrationsFolder: PUBLIC_MIGRATIONS_PATH });
console.log('Public schema migrations completed');
