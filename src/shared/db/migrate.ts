/**
 * Runs public schema migrations (platform-level).
 * Run once on initial setup and after each public schema migration.
 * Usage: npm run db:migrate
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { createMigrationSession } from './migration-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_MIGRATIONS_PATH = path.resolve(__dirname, '../../../db/migrations/public');

const session = await createMigrationSession();
try {
  await session.migrate(PUBLIC_MIGRATIONS_PATH);
  console.log('Public schema migrations completed');
} finally {
  await session.close();
}
