import type { Config } from 'drizzle-kit';

// Generates migrations for the tenant schema template
// Apply these to each tenant schema on provisioning and upgrades
// Run: drizzle-kit generate --config drizzle.tenant.config.ts
const config: Config = {
  schema: './src/shared/db/schema/tenant.ts',
  out: './db/migrations/tenant',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
};

export default config;
