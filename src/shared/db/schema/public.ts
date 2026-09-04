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
    providerName: text('provider_name').notNull(), // 'sendstack', 'gig', 'dhl', etc.
    apiKeyEncrypted: text('api_key_encrypted').notNull(), // AES-256-GCM, base64
    config: jsonb('config'), // baseUrl, webhookSecret, etc.
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

// ─── Platform operations plane ────────────────────────────────────────────────
// Cross-tenant staff (support, admin, super-admin) who operate the platform.
// These identities are NOT tenants and carry no tenant scope. Everything here
// lives once in the public schema. See docs/ADMIN-DASHBOARD-PLAN.md in
// sabbytek/sabby-admin for the full design and security posture.

export const platformRoleEnum = pgEnum('platform_role', ['support', 'admin', 'super_admin']);

export const platformUsers = pgTable(
  'platform_users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: platformRoleEnum('role').notNull().default('support'),
    isActive: boolean('is_active').notNull().default(true),
    // MFA (TOTP). Secret is AES-256-GCM encrypted at rest (see shared/crypto/encrypt).
    mfaEnabled: boolean('mfa_enabled').notNull().default(false),
    mfaSecretEncrypted: text('mfa_secret_encrypted'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('platform_users_email_idx').on(table.email),
    index('platform_users_active_idx').on(table.isActive),
  ],
);

export const platformRefreshTokens = pgTable(
  'platform_refresh_tokens',
  {
    id: text('id').primaryKey(),
    platformUserId: text('platform_user_id')
      .notNull()
      .references(() => platformUsers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(), // argon2 hash of the raw refresh token
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    index('platform_refresh_tokens_user_idx').on(table.platformUserId),
    index('platform_refresh_tokens_expiry_idx').on(table.expiresAt),
  ],
);

// Append-only record of every state-changing or PII-revealing platform action.
// Rows are never updated or deleted in application code.
export const platformAuditLog = pgTable(
  'platform_audit_log',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id'), // null for system/unauthenticated events (e.g. failed login)
    actorEmail: text('actor_email').notNull(),
    action: text('action').notNull(), // e.g. 'auth.login', 'tenant.suspend'
    targetType: text('target_type'), // e.g. 'tenant', 'platform_user'
    targetId: text('target_id'),
    summary: text('summary'),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: text('ip'),
    requestId: text('request_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('platform_audit_log_actor_idx').on(table.actorId),
    index('platform_audit_log_action_idx').on(table.action),
    index('platform_audit_log_target_idx').on(table.targetType, table.targetId),
    index('platform_audit_log_created_idx').on(table.createdAt),
  ],
);

// Time-boxed, consented, audited access grants for support to inspect a tenant.
// Defined now for the schema; consumed by the support-access feature (Phase 3).
export const supportAccessGrants = pgTable(
  'support_access_grants',
  {
    id: text('id').primaryKey(),
    platformUserId: text('platform_user_id')
      .notNull()
      .references(() => platformUsers.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    scope: text('scope').notNull().default('read_only'), // 'read_only' | 'break_glass'
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    consentedBy: text('consented_by'), // tenant user id who consented; null for break-glass
  },
  (table) => [
    index('support_access_grants_user_idx').on(table.platformUserId),
    index('support_access_grants_tenant_idx').on(table.tenantId),
    index('support_access_grants_expiry_idx').on(table.expiresAt),
  ],
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
export type TenantIntegration = typeof tenantIntegrations.$inferSelect;
export type NewTenantIntegration = typeof tenantIntegrations.$inferInsert;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;

export type PlatformUser = typeof platformUsers.$inferSelect;
export type NewPlatformUser = typeof platformUsers.$inferInsert;
export type PlatformRefreshToken = typeof platformRefreshTokens.$inferSelect;
export type NewPlatformRefreshToken = typeof platformRefreshTokens.$inferInsert;
export type PlatformAuditLogEntry = typeof platformAuditLog.$inferSelect;
export type NewPlatformAuditLogEntry = typeof platformAuditLog.$inferInsert;
export type SupportAccessGrant = typeof supportAccessGrants.$inferSelect;
export type NewSupportAccessGrant = typeof supportAccessGrants.$inferInsert;
