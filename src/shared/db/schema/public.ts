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
    tokenPrefix: text('token_prefix').notNull(), // First 16 chars of raw token for O(1) lookup
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => ({
    tenantUserIdx: index('refresh_tokens_tenant_user_idx').on(table.tenantId, table.userId),
    expiryIdx: index('refresh_tokens_expiry_idx').on(table.expiresAt),
    prefixIdx: index('refresh_tokens_prefix_idx').on(table.tokenPrefix),
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
    tokenPrefix: text('token_prefix').notNull(), // First 16 chars of raw token for O(1) lookup
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantUserIdx: index('password_reset_tokens_tenant_user_idx').on(table.tenantId, table.userId),
    expiryIdx: index('password_reset_tokens_expiry_idx').on(table.expiresAt),
    prefixIdx: index('password_reset_tokens_prefix_idx').on(table.tokenPrefix),
  }),
);

// ─── Platform identity plane ─────────────────────────────────────────────────
//
// Internal staff (support, admins) live here — NOT in any tenant's `users`
// table. The two identity planes are deliberately disjoint: they share no
// table, no role enum, and no JWT secret. Folding platform roles into
// `userRoleEnum` would mean any row in any tenant's `users` table could be
// escalated to platform-wide power by a single UPDATE.

export const platformRoleEnum = pgEnum('platform_role', [
  'super_admin',
  'admin',
  'support',
  'read_only',
]);

export const platformUsers = pgTable(
  'platform_users',
  {
    id: text('id').primaryKey(),
    // PII: internal staff contact details
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    role: platformRoleEnum('role').notNull().default('read_only'),
    isActive: boolean('is_active').notNull().default(true),
    // TOTP secret, AES-256-GCM encrypted via shared/crypto/encrypt.ts
    mfaSecretEncrypted: text('mfa_secret_encrypted'),
    mfaEnabledAt: timestamp('mfa_enabled_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex('platform_users_email_idx').on(table.email),
    activeIdx: index('platform_users_active_idx').on(table.isActive),
  }),
);

export const platformSessions = pgTable(
  'platform_sessions',
  {
    id: text('id').primaryKey(),
    platformUserId: text('platform_user_id')
      .notNull()
      .references(() => platformUsers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    // First 16 chars of the raw token — bounds the argon2 verify scan to ~1 row
    tokenPrefix: text('token_prefix').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('platform_sessions_user_idx').on(table.platformUserId),
    prefixIdx: index('platform_sessions_prefix_idx').on(table.tokenPrefix),
    expiryIdx: index('platform_sessions_expiry_idx').on(table.expiresAt),
  }),
);

/**
 * Append-only record of every platform-plane action.
 *
 * Written explicitly from platform controllers via writeAudit() rather than
 * by an automatic hook, so a reviewer can grep the call sites and see exactly
 * what is recorded. There is deliberately no update or delete path.
 */
export const platformAuditLog = pgTable(
  'platform_audit_log',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').notNull(),
    actorEmail: text('actor_email').notNull(),
    actorRole: text('actor_role').notNull(),
    action: text('action').notNull(), // e.g. 'tenant.suspend'
    targetType: text('target_type'), // 'tenant' | 'platform_user' | ...
    targetId: text('target_id'),
    tenantId: text('tenant_id'), // set when the action concerns a tenant
    reason: text('reason'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    requestId: text('request_id'),
    metadata: jsonb('metadata'), // before/after diff, extra context
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    actorIdx: index('platform_audit_actor_idx').on(table.actorId),
    tenantIdx: index('platform_audit_tenant_idx').on(table.tenantId),
    actionIdx: index('platform_audit_action_idx').on(table.action),
    createdIdx: index('platform_audit_created_idx').on(table.createdAt),
  }),
);

export const grantScopeEnum = pgEnum('grant_scope', ['read', 'write']);

/**
 * Time-boxed, reason-required authorisation for a platform user to reach into
 * ONE tenant's data.
 *
 * Cross-tenant reach is deliberately not implied by holding a platform
 * identity: a support agent must open a grant, state why, and it expires. The
 * merchant sees every grant in their own audit_log and is notified when one
 * opens.
 */
export const tenantAccessGrants = pgTable(
  'tenant_access_grants',
  {
    id: text('id').primaryKey(),
    platformUserId: text('platform_user_id')
      .notNull()
      .references(() => platformUsers.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    scope: grantScopeEnum('scope').notNull().default('read'),
    // Not nullable: an unexplained grant is not defensible after the fact.
    reason: text('reason').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // The lookup requireTenantGrant does on every support request.
    activeIdx: index('tenant_access_grants_active_idx').on(
      table.platformUserId,
      table.tenantId,
      table.expiresAt,
    ),
    tenantIdx: index('tenant_access_grants_tenant_idx').on(table.tenantId),
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
export type PlatformUser = typeof platformUsers.$inferSelect;
export type NewPlatformUser = typeof platformUsers.$inferInsert;
export type PlatformSession = typeof platformSessions.$inferSelect;
export type NewPlatformSession = typeof platformSessions.$inferInsert;
export type PlatformAuditEntry = typeof platformAuditLog.$inferSelect;
export type NewPlatformAuditEntry = typeof platformAuditLog.$inferInsert;
export type TenantAccessGrant = typeof tenantAccessGrants.$inferSelect;
export type NewTenantAccessGrant = typeof tenantAccessGrants.$inferInsert;
