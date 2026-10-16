# Release Notes — Sabby API (staging)

**Branch:** `staging` / `development` (in sync)
**Period:** covers all work since the last stable merge into staging

---

## Features

### Platform Admin Plane (internal ops)
- Refactored the monolithic `src/modules/platform/` into focused sub-modules:
  `auth/`, `users/`, `tenants/`, `support/`, `overview/`, `audit/`
- Fine-grained RBAC: `super_admin`, `admin`, `support`, `read_only` roles
- Append-only audit log — every platform action is recorded; no update or delete path
- Platform JWT is now optional (`JWT_PLATFORM_SECRET`); the entire `/v1/platform`
  plane stays unregistered when the secret is not set, so dev/test boot without it
- New public schema tables: `platform_users`, `platform_sessions`, `platform_audit_log`

### Settings Module
- New `src/modules/settings/` registered at `POST /v1/settings`
- Tenant configuration endpoints for business profile, notification preferences, etc.

### Private File Storage
- Pluggable private storage provider: Cloudflare R2 (default) or Neon S3-compatible
- Controlled by `PRIVATE_STORAGE_PROVIDER` env var — no code change to switch
- Used for invoice PDFs and expense receipts

### Email Abstraction
- `src/shared/email/` now abstracts over Resend and Brevo behind a common interface
- Provider selected via `EMAIL_PROVIDER` env var; emails are silently skipped when
  no API key is configured (invoice PDFs still generate regardless)

### Typed Queue Workers
- All five BullMQ workers (documents, inventory, logistics, payments, subscriptions)
  now have typed job payloads instead of `unknown`

---

## Bug Fixes

### Subscription 404 on new signup — `fix(tenants)`
- `createTenant` never inserted a subscription row, so `GET /v1/subscriptions`
  returned 404 for every business created through signup
- A trial subscription (`planTier='trial'`, `status='trial'`) is now seeded
  alongside locations and ledger accounts during tenant provisioning

### Tenant schema isolation — `fix(db)`
- Replaced the Neon HTTP driver with the Neon WebSocket Pool for tenant queries
- The HTTP driver is stateless per-request: `SET search_path` was gone by the
  next query, silently falling through to the public schema
- Each `withTenantSchema` callback now runs inside one transaction on one
  connection; nested calls use savepoints
- Schema name validated before SQL execution (SQL injection guard)

### Order number race condition — `fix(orders)`
- Order numbers were generated with `COUNT(*) + 1` — concurrent requests
  could get the same number
- Replaced with a per-tenant PostgreSQL sequence (`order_number_seq`);
  self-heals on first use for schemas provisioned before the fix
- Stock deduction now runs inside the same transaction as order creation,
  closing the TOCTOU race on concurrent orders

### Refresh token O(n) scan — `fix(auth)`
- Token refresh fetched all active tokens and iterated with `argon2.verify()`
  — slow for accounts with many sessions
- Added `token_prefix` column (first 16 chars of raw token) with an index;
  lookup is now O(1) before the single `argon2.verify` call
- Password reset tokens use `randomBytes(32)` instead of `uuidv4() + uuidv4()`
- Removed raw reset token from `console.log` in `forgotPassword`

### Redis non-fatal startup — `fix(redis)`
- A missing or wrong `REDIS_URL` was spamming error logs and destabilising
  the process with infinite reconnect attempts
- Cache client now connects in the background at startup; all cache ops
  (`cacheGet`, `cacheSet`, `cacheDel`) are silent no-ops when Redis is down
- Retry strategy capped at 10 attempts (~30 s) then stops
- `isRedisAvailable()` flag lets the health check and queue check report
  status without issuing commands that would hang on a dead socket
- BullMQ connection gets the same retry cap and `lazyConnect`

### Env var rename crash on startup — `fix(env)`
- `PLATFORM_JWT_ACCESS_SECRET` and `PLATFORM_JWT_REFRESH_SECRET` were
  required fields in the Zod schema but had already been renamed to
  `JWT_PLATFORM_SECRET` in `app.ts`, causing the env validation to
  `process.exit(1)` on every deploy
- Replaced with a single optional `JWT_PLATFORM_SECRET`; removed
  `PLATFORM_MFA_ISSUER` (inlined as a literal)

### Health check returning 503 for degraded state — `fix(health)`
- `/health` returned 503 whenever any single component was down, causing
  Render to treat a healthy app as crashed and restart it
- `degraded` (exactly 1 component failing) now returns 200
- `error` (2 or more components failing) returns 503
- Health check uses `isRedisAvailable()` fast-path before pinging Redis

### Root route 404 on deployed URL — `fix(app)`
- `GET /` was never registered; hitting the root URL returned Fastify's
  default 404 on the deployed server
- Added a lightweight liveness response at `GET /`

### Redis KEYS blocking — `fix(cache)`
- `cacheDelPattern` used `KEYS` which blocks Redis for the duration of
  the scan on large keyspaces
- Replaced with `SCAN` cursor-based iteration

---

## Infrastructure & Tooling

- **Migrations** — new public schema migration (`0001_condemned_reavers.sql`)
  adds `token_prefix` to `refresh_tokens` and the full platform identity tables;
  new tenant migration (`0000_sparkling_crystal.sql`) baseline
- **`.gitignore`** — broadened from `tsconfig.tsbuildinfo` to `*.tsbuildinfo`
  to catch `tsconfig.build.tsbuildinfo` and any future variants
- **CI** — updated test env vars to match renamed secrets
- **Removed** — `src/queue/worker.ts`, `src/shared/crypto/totp.ts`,
  `src/shared/pdf/receipt.ts`, `src/modules/orders/receipt.service.ts`,
  `src/modules/platform/service.ts` (all superseded by the refactored modules)
- **Docs** — updated `openapi.yaml`, Postman collection, QA guide, added
  `ADMIN-PORTAL-PLAN.md`, `PRODUCT-REQUIREMENTS.md`, `CODE-REVIEW-FIXES.md`

---

## Known Issues / Not Yet Tested

- **Charts on paid plan** — the test business was on trial; chart components
  show "Upgrade" panels and could not be tested with real data
- **Slow requests** — 4–7 s per request to the staging database (Neon cold
  start latency), with one outlier at 32 s. This is database latency, not
  application code. Mitigation options: Neon connection pooling (pgBouncer),
  keeping the DB branch warm with a scheduled ping, or moving to a closer region
- **Existing tenants without a subscription row** — businesses created before
  this release have no subscription record. They need a one-time data migration
  or can be re-created. New signups are unaffected.

---

## Env Vars Added / Changed

| Variable | Change | Required |
|---|---|---|
| `JWT_PLATFORM_SECRET` | Replaces `PLATFORM_JWT_ACCESS_SECRET` + `PLATFORM_JWT_REFRESH_SECRET` | Optional (platform plane disabled when unset) |
| `JWT_PLATFORM_ACCESS_EXPIRY` | Replaces `PLATFORM_JWT_ACCESS_EXPIRY` | No (default `15m`) |
| `JWT_PLATFORM_REFRESH_EXPIRY` | Replaces `PLATFORM_JWT_REFRESH_EXPIRY` | No (default `8h`) |
| `PRIVATE_STORAGE_PROVIDER` | New — `r2` or `neon` | No (default `r2`) |
| `EMAIL_PROVIDER` | New — `resend` or `brevo` | No (default `resend`) |
| `PLATFORM_JWT_ACCESS_SECRET` | **Removed** | — |
| `PLATFORM_JWT_REFRESH_SECRET` | **Removed** | — |
| `PLATFORM_MFA_ISSUER` | **Removed** | — |
