import type { Config } from 'drizzle-kit';

// Two separate drizzle configs — public (platform) and tenant (template)
// Run: drizzle-kit generate --config drizzle.config.ts
const config: Config = {
  schema: './src/shared/db/schema/public.ts',
  out: './db/migrations/public',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
};

export default config;
