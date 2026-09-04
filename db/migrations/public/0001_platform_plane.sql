-- Platform operations plane (public schema).
-- Idempotent: safe to run on an existing database. Applied via
--   npm run db:migrate:platform
-- Kept as a hand-authored, standalone migration because the public schema is
-- not yet under drizzle-kit migration control (db/migrations/public was empty).

-- Enum: platform_role. The runner tolerates a "already exists" duplicate here,
-- which is what makes re-running this file safe (every other statement below is
-- explicitly IF NOT EXISTS).
CREATE TYPE platform_role AS ENUM ('support', 'admin', 'super_admin');

-- ─── platform_users ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_users (
  id                    text PRIMARY KEY,
  email                 text NOT NULL,
  name                  text NOT NULL,
  password_hash         text NOT NULL,
  role                  platform_role NOT NULL DEFAULT 'support',
  is_active             boolean NOT NULL DEFAULT true,
  mfa_enabled           boolean NOT NULL DEFAULT false,
  mfa_secret_encrypted  text,
  last_login_at         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_users_email_idx ON platform_users (email);
CREATE INDEX IF NOT EXISTS platform_users_active_idx ON platform_users (is_active);

-- ─── platform_refresh_tokens ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_refresh_tokens (
  id                text PRIMARY KEY,
  platform_user_id  text NOT NULL REFERENCES platform_users (id) ON DELETE CASCADE,
  token_hash        text NOT NULL,
  expires_at        timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  revoked_at        timestamptz
);
CREATE INDEX IF NOT EXISTS platform_refresh_tokens_user_idx ON platform_refresh_tokens (platform_user_id);
CREATE INDEX IF NOT EXISTS platform_refresh_tokens_expiry_idx ON platform_refresh_tokens (expires_at);

-- ─── platform_audit_log (append-only) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_audit_log (
  id           text PRIMARY KEY,
  actor_id     text,
  actor_email  text NOT NULL,
  action       text NOT NULL,
  target_type  text,
  target_id    text,
  summary      text,
  before       jsonb,
  after        jsonb,
  ip           text,
  request_id   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_audit_log_actor_idx ON platform_audit_log (actor_id);
CREATE INDEX IF NOT EXISTS platform_audit_log_action_idx ON platform_audit_log (action);
CREATE INDEX IF NOT EXISTS platform_audit_log_target_idx ON platform_audit_log (target_type, target_id);
CREATE INDEX IF NOT EXISTS platform_audit_log_created_idx ON platform_audit_log (created_at);

-- ─── support_access_grants ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_access_grants (
  id                text PRIMARY KEY,
  platform_user_id  text NOT NULL REFERENCES platform_users (id) ON DELETE CASCADE,
  tenant_id         text NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  reason            text NOT NULL,
  scope             text NOT NULL DEFAULT 'read_only',
  granted_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  revoked_at        timestamptz,
  consented_by      text
);
CREATE INDEX IF NOT EXISTS support_access_grants_user_idx ON support_access_grants (platform_user_id);
CREATE INDEX IF NOT EXISTS support_access_grants_tenant_idx ON support_access_grants (tenant_id);
CREATE INDEX IF NOT EXISTS support_access_grants_expiry_idx ON support_access_grants (expires_at);
