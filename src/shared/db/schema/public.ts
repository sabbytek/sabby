/**
 * Public (platform-level) schema.
 * Contains cross-tenant tables: tenants, platform users, billing.
 * These tables are NOT per-tenant — they exist once in the public schema.
 */
import {
  pgTable,
  text,
  timestamp,
  boolean,
  pgEnum,
  uniqueIndex,
  index,
  jsonb,
} from 'drizzle-orm/pg-core';

export const planTierEnum = pgEnum('plan_tier', ['trial', 'entry', 'growth', 'enterprise']);
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trial',
  'active',
  'grace',
  'lapsed',
  'cancelled',
]);

export const tenants = pgTable(
  'tenants',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    schemaName: text('schema_name').notNull(),
    planTier: planTierEnum('plan_tier').notNull().default('trial'),
    subscriptionStatus: subscriptionStatusEnum('subscription_status').notNull().default('trial'),
    subscriptionExpiresAt: timestamp('subscription_expires_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    // PII: business contact info
    businessEmail: text('business_email').notNull(),
    businessPhone: text('business_phone'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugIdx: uniqueIndex('tenants_slug_idx').on(table.slug),
    schemaIdx: uniqueIndex('tenants_schema_idx').on(table.schemaName),
    activeIdx: index('tenants_active_idx').on(table.isActive),
  }),
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => ({
    tenantUserIdx: index('refresh_tokens_tenant_user_idx').on(table.tenantId, table.userId),
    expiryIdx: index('refresh_tokens_expiry_idx').on(table.expiresAt),
  }),
);

export const tenantIntegrations = pgTable(
  'tenant_integrations',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    integrationType: text('integration_type').notNull(), // 'logistics'
    providerName: text('provider_name').notNull(),       // 'sendstack', 'gig', 'dhl', etc.
    apiKeyEncrypted: text('api_key_encrypted').notNull(), // AES-256-GCM, base64
    config: jsonb('config'),                              // baseUrl, webhookSecret, etc.
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantTypeIdx: uniqueIndex('tenant_integrations_tenant_type_idx').on(
      table.tenantId,
      table.integrationType,
    ),
  }),
);

// Password reset tokens — cross-tenant, stored in public schema.
// Tokens are single-use and expire after 1 hour.
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    tokenHash: text('token_hash').notNull(), // argon2 hash of the raw token
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantUserIdx: index('password_reset_tokens_tenant_user_idx').on(table.tenantId, table.userId),
    expiryIdx: index('password_reset_tokens_expiry_idx').on(table.expiresAt),
  }),
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
export type TenantIntegration = typeof tenantIntegrations.$inferSelect;
export type NewTenantIntegration = typeof tenantIntegrations.$inferInsert;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
