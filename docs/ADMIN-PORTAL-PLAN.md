# Admin Portal — Implementation Plan

**Status:** In progress — Phase A and Phase B shipped; Phase C and D not started.
**Depends on:** `development` @ `5a180bc`
**Audiences:** business owner (merchant), support team (internal), super-admin (internal)

> This document is the living plan. It was previously held only in a chat session and
> was not committed, which meant every new session started blind. Keep the status table
> in section 5 and the checkboxes below in sync with the code so that stops happening.

---

## 0. Status at a glance

Reconstructed by diffing this plan against the code on
`claude/admin-portal-implementation-20nolk` (merged via PR #8 Phase A, PR #9 Phase B).

| Phase | State | Notes |
|---|---|---|
| A — Platform foundation | Shipped, 2 carve-outs | `POST /v1/tenants` only rate-limited (email verification outstanding); `tenants:delete` / `tenants:override_features` are permissions with no routes |
| B — Support tooling | Shipped | Owner notification ships over SMS, not the email default assumed in §7 |
| C — Owner admin | Not started | Only `GET /v1/settings/audit` exists (pulled forward in B). No mutating module writes to the tenant `auditLog` |
| D — Platform intelligence | Not started | No `tenant_feature_overrides`, no analytics module |
| Platform user management (`platform/users/`) | Not built, unphased | Cannot provision a second platform user via API — only a directly seeded super-admin exists |

### Checklist

Phase A
- [x] Schema: `platform_users`, `platform_sessions`, `platform_audit_log`, `tenant_access_grants` + `platform_role_enum`
- [x] Second JWT namespace + `JWT_PLATFORM_SECRET` (15m access / 8h refresh)
- [x] `platform-auth.ts` middleware (`requirePlatformAuth`, `requirePlatformPermission`)
- [x] `platform-permissions.ts` permission matrix
- [x] Append-only audit write service
- [x] `platform/auth` with TOTP (required for `super_admin` and `admin`)
- [x] `platform/tenants`: list, detail, create, suspend, reactivate, change plan
- [ ] Close `POST /v1/tenants` fully — email verification for public signup still outstanding
- [ ] `tenants:delete` (soft) + retention window (§4.5) — permission exists, no route
- [ ] `tenants:override_features` — permission exists, no route
- [ ] `GET /v1/platform/tenants/:id/health`

Phase B
- [x] `tenant_access_grants` + `requireTenantGrant`
- [x] Support read endpoints reusing existing tenant services
- [x] Four repair actions (resend-receipt, retry-webhook, unlock-account, reset-password)
- [x] Tenant-side `audit_log` table
- [x] Owner notification on grant open (shipped as SMS — ratify vs the email default in §7)

Phase C
- [x] `GET /v1/settings/audit` (owner reads their own trail — built early in Phase B)
- [ ] Tenant `audit_log` **writes** across mutating modules (currently only the support flow writes)
- [ ] `settings`: `GET|PATCH /business`
- [ ] `settings`: `GET /sessions`, `DELETE /sessions/:id`
- [ ] `settings`: `POST /export` (NDPR data export)

Phase D
- [ ] `tenant_feature_overrides` table + resolution in feature gate
- [ ] `platform/analytics`: `GET /overview`, `/revenue`, `/usage`

Unphased gap
- [ ] `platform/users/` module: `GET /`, `POST /`, `PATCH /:id`, `DELETE /:id`, `POST /:id/reset-password`
      — `platform_users:manage` exists but no way to manage platform staff via API

---

## 1. Context

BPOS has 19 tenant-facing modules and no platform-side administration. `PRD.md` names a
"Platform Admin" persona (§4, Persona 4) whose only implemented capability is receiving
Slack alerts. Three distinct audiences need admin surfaces, and today **none of the two
internal ones can even be represented in the auth model**:

| Audience | Needs | Exists today |
|---|---|---|
| Business owner | Manage own business: team, billing, settings, activity trail | Partially — `staff`, `subscriptions`, `locations`, `reporting`. No audit trail, no billing history, no session control |
| Support (admin) | Cross-tenant read + a narrow set of audited repair actions | **Nothing.** No non-tenant identity can exist |
| Super-admin | Tenant lifecycle, plan control, platform user management, audit | **Nothing** |

There is also a live security gap this plan closes: **`POST /v1/tenants` is
unauthenticated** (`src/modules/tenants/routes.ts` registers no `preHandler`), so any
caller can provision a Postgres schema — both an access-control hole and a
resource-exhaustion vector.

### Decisions taken

- Support gets **read + narrow writes** — a fixed whitelist of repair actions, no
  order/inventory/ledger mutation.
- Support access is **visible to the merchant and actively notified** — it lands in the
  merchant's own audit log and triggers an owner notification when a grant opens.
- Build order: **platform foundation first** (Phase A), because it unblocks both internal
  audiences and closes the `/v1/tenants` hole.

---

## 2. Core architectural decision: a second identity plane

Today every authenticated request is tenant-scoped:

```ts
// src/shared/types/fastify.d.ts
payload: { sub, tid, role: 'owner'|'manager'|'staff'|'viewer', email, type }
// src/shared/middleware/tenant.ts — throws if tid absent
// src/shared/http/context.ts    — reads request.user.tid
```

Platform users cannot be squeezed into this shape, for three reasons:

1. They belong to no tenant, so `tid` would be meaningless or forged.
2. Adding `super_admin` to `userRoleEnum` would mean **any row in any tenant's `users`
   table could be escalated to platform-wide power by a single `UPDATE`**. Unacceptable
   blast radius.
3. One JWT secret minting both tenant and platform tokens turns any tenant-token
   forgery bug into a full platform compromise.

**Therefore: separate table, separate role enum, separate JWT secret, separate audience
claim, separate guard.** The two planes never share a credential.

### New tables (public schema — `src/shared/db/schema/public.ts`)

```
platform_role_enum        'super_admin' | 'admin' | 'support' | 'read_only'

platform_users            id, email (unique), passwordHash, firstName, lastName,
                          role: platform_role_enum, isActive,
                          mfaSecretEncrypted, mfaEnabledAt, lastLoginAt,
                          createdAt, updatedAt

platform_sessions         id, platformUserId FK, tokenHash, tokenPrefix,
                          expiresAt, revokedAt, createdAt
                          — mirrors the refreshTokens design incl. the tokenPrefix
                            index pattern from f0074b6

platform_audit_log        id, actorId, actorEmail, actorRole, action, targetType,
                          targetId, tenantId, reason, ipAddress, userAgent,
                          requestId, metadata jsonb, createdAt
                          — APPEND-ONLY. No update/delete endpoint, ever.

tenant_access_grants      id, platformUserId FK, tenantId FK, scope 'read'|'write',
                          reason (NOT NULL), expiresAt, revokedAt, createdAt
```

`platform_users` is deliberately **not** related to any tenant's `users` table. A person
who is both a merchant and an employee has two separate accounts.

### JWT

```ts
{ sub, role: PlatformRole, email, aud: 'platform', type: 'access' }  // note: no tid
```

Signed with a **new** `JWT_PLATFORM_SECRET` (add to `src/config/env.ts`, required when
`NODE_ENV === 'production'`). Register a second `@fastify/jwt` instance under a namespace
so both key sets coexist:

```ts
// src/app.ts
void app.register(jwtPlugin, {
  secret: env.JWT_PLATFORM_SECRET,
  namespace: 'platform',
  jwtVerify: 'platformJwtVerify',
  jwtSign: 'platformJwtSign',
  sign: { expiresIn: '15m', aud: 'platform' },
});
```

Platform access tokens live **15 minutes**, refresh **8 hours** — versus the tenant
plane's 7 days. Short sessions are the cheapest mitigation for a high-privilege console.

### New middleware — `src/shared/middleware/platform-auth.ts`

- `requirePlatformAuth` — `platformJwtVerify()`, assert `aud === 'platform'`, load the
  user, assert `isActive`, attach `request.platformUser`.
- `requirePlatformPermission(perm)` — config-driven; deliberately mirrors the existing
  `requireFeature` shape in `src/shared/middleware/feature-gate.ts`.
- `requireTenantGrant(scope)` — resolves an active `tenant_access_grants` row for
  (platformUser, `:tenantId` route param) and **populates `request.tenant` with the same
  `{ tenantId, schema }` contract `resolveTenant` produces**.

That last one is the key bridge: because the contract is identical, every existing
tenant-scoped service (`orders`, `payments`, `ledger`, …) is reusable from support
tooling with **zero changes**. No service needs to learn what a platform user is.

### Permissions config — `src/config/platform-permissions.ts`

Deliberately a **separate** map from `PLAN_ENTITLEMENTS`. Plan entitlements answer "what
did this merchant pay for"; platform permissions answer "what is this employee trusted
with". Conflating them would let a billing change alter internal access.

```ts
export type PlatformPermission =
  | 'tenants:read' | 'tenants:create' | 'tenants:suspend' | 'tenants:delete'
  | 'tenants:change_plan' | 'tenants:override_features'
  | 'platform_users:read' | 'platform_users:manage'
  | 'audit:read'
  | 'support:grant_read' | 'support:grant_write'
  | 'support:resend_receipt' | 'support:retry_webhook'
  | 'support:unlock_account' | 'support:reset_password'
  | 'billing:read' | 'billing:refund'
  | 'analytics:read';

export const PLATFORM_PERMISSIONS: Record<PlatformRole, PlatformPermission[]>;
```

| Role | Grants |
|---|---|
| `read_only` | `tenants:read`, `audit:read`, `analytics:read`, `billing:read` |
| `support` | above + `support:grant_read`, `support:grant_write`, and the four repair actions |
| `admin` | above + `tenants:create`, `tenants:suspend`, `tenants:change_plan`, `platform_users:read` |
| `super_admin` | everything, incl. `tenants:delete`, `tenants:override_features`, `platform_users:manage`, `billing:refund` |

> Implementation note: the full permission enum above is shipped in
> `src/config/platform-permissions.ts`, but `tenants:delete`, `tenants:override_features`,
> `billing:read`, `billing:refund`, and `analytics:read` currently grant access to routes
> that do not yet exist (Phase A carve-outs and Phases C/D). A permission with no route is
> a promise the API does not keep — implement the route or drop the permission.

### Audit log

Every platform-plane mutation writes exactly one row via an explicit
`writeAudit(ctx, {...})` call from the controller. Explicit rather than an automatic hook:
a reviewer can grep for the call and see precisely what is recorded, and a silently
missing hook is worse than a visible omission.

Because support access is merchant-visible, a grant writes to **both** the platform audit
log *and* the tenant's own `audit_log`, then enqueues an owner notification on
`notificationsQueue`.

---

## 3. Module layout

Follows the established 4-file convention (`controller.ts` / `service.ts` / `routes.ts` /
`validators.ts`) and the `createContext` → controller → service call path.

```
src/modules/platform/
├── auth/       POST /login  /refresh  /logout  /mfa/setup  /mfa/verify   GET /me   [done]
├── tenants/    GET /  GET /:id  POST /
│               PATCH /:id/suspend  /:id/reactivate  /:id/plan            [done]
│               DELETE /:id        GET /:id/health                        [not built]
├── users/      GET /  POST /  PATCH /:id  DELETE /:id  POST /:id/reset-password  [not built]
├── audit/      GET /  (filter: actor, action, tenantId, dateRange)   GET /:id  [done]
├── support/    POST /grants  GET /grants  DELETE /grants/:id            [done]
│               GET  /tenants/:id/orders | /payments | /subscription   (via grant)
│               POST /tenants/:id/resend-receipt  /retry-webhook
│                    /unlock-account  /reset-user-password
└── analytics/  GET /overview  /revenue  /usage                          [not built]
```

All registered under `/v1/platform/*` in `src/app.ts`, all behind `requirePlatformAuth`.

Owner-side (tenant plane) — one new module plus a new tenant table:

```
src/modules/settings/   GET|PATCH /business                              [not built]
                        GET /audit          — the owner's own activity trail  [done]
                        GET /sessions   DELETE /sessions/:id              [not built]
                        POST /export        — NDPR data export            [not built]
```

`audit_log` exists in `src/shared/db/schema/tenant.ts` so owners see who did what inside
their own business (`Chike voided order ORD-000123 at 14:02`), with support access
appearing as a first-class entry. **But today only the support flow writes to it** — the
mutating merchant modules (orders, payments, ledger, …) do not yet emit audit entries, so
the owner trail is empty except for support access. Wiring those writes is the first task
of Phase C.

---

## 4. Security hardening bundled in

1. **Close `POST /v1/tenants`.** Split the two legitimate callers: public self-signup
   moves behind `/v1/onboarding` with email verification and a strict rate limit;
   admin-initiated provisioning becomes `POST /v1/platform/tenants` gated on
   `tenants:create`. **Status:** partially done — admin provisioning shipped and public
   signup is rate-limited to 3/hr, but email verification is still outstanding.
2. **TOTP MFA required for `super_admin`** (shipped as required for `super_admin` and
   `admin`), optional for other roles. Use `otplib`; store the secret through the existing
   `src/shared/crypto/encrypt.ts` (AES-256-GCM, already built for logistics keys).
3. **Separate rate-limit bucket** for `/v1/platform/*`, plus an optional IP allowlist via
   env.
4. **Audit every failed platform login**, and never log a platform JWT.
5. **Suspend, don't delete.** `tenants:delete` is super-admin-only and soft — it flips
   `isActive` and schedules schema drop after a retention window, so a mis-click is
   recoverable and NDPR retention stays satisfiable. **Status:** not built — the
   permission exists but there is no delete route or retention job.

---

## 5. Phasing (~20 hrs/week)

### Phase A — Platform foundation (~2 weeks) — SHIPPED (2 carve-outs)
Schema (4 tables + enum) and migrations · second JWT namespace · `platform/auth` with
TOTP · `platform-auth.ts` middleware · `platform-permissions.ts` · audit write service ·
`platform/tenants` (list, detail, suspend, reactivate, change plan) · close
`POST /v1/tenants` · tests.

Outstanding within A: email verification for public signup; the soft `tenants:delete` +
retention window; `tenants:override_features`; `GET /:id/health`.

**Exit:** a super-admin logs in with TOTP, lists every tenant, suspends one, and that
tenant's users get 401 on their next request. Every action appears in
`platform_audit_log`. A tenant token is rejected on `/v1/platform/*` and a platform token
is rejected on `/v1/orders`. — MET.

### Phase B — Support tooling (~1.5 weeks) — SHIPPED
`tenant_access_grants` + `requireTenantGrant` · support read endpoints reusing existing
services · the four repair actions · tenant-side `audit_log` table · owner notification on
grant open.

**Exit:** support opens a 60-minute read grant with a stated reason, reads the merchant's
orders, and the merchant sees the access in their own settings and gets notified. On
expiry the same request returns 403. — MET (notification ships over SMS, not email).

### Phase C — Owner admin (~1.5 weeks) — NOT STARTED
Tenant `audit_log` writes across mutating modules · `settings` module · session listing and
revocation · subscription/billing history · NDPR data export.

Priority-1 within C: wire `writeTenantAudit` into the mutating modules. Everything else in
the owner trail depends on that data actually being recorded.

### Phase D — Platform intelligence (~1 week) — NOT STARTED
`tenant_feature_overrides` (grant one merchant a feature without changing their plan —
also fixes the static-config limitation in `PLAN_ENTITLEMENTS`) · MRR, active tenants,
churn, per-tenant usage.

### Cross-cutting — Platform user management — NOT STARTED, unphased
The `platform/users/` module. Without it there is no API path to create a second platform
user; the only super-admin is one seeded directly into the database. Treat this as Phase A
debt, not a Phase D nicety — it blocks onboarding any real support staff.

Total ≈ 6 weeks at 20 hrs/week (A and B spent).

---

## 6. Verification

**Unit**
- Permission matrix: every `PlatformRole` × every `PlatformPermission`.
- Grant resolution: active, expired, revoked, wrong-tenant, wrong-scope.
- Audit row shape — required fields present and non-empty on every action type.
- TOTP verify: valid code, replayed code, clock-skew window.

**Integration**
- Platform login → list tenants → suspend → tenant login now 401.
- Support grant → read merchant orders → wait past `expiresAt` → 403.
- Grant opens → row present in tenant `audit_log` → notification job enqueued.
- Support attempts an order write → 403 (read+narrow-write boundary holds).

**Cross-plane isolation — the critical tests**
- Tenant token on `/v1/platform/*` → 401.
- Platform token on `/v1/orders` → 401.
- Platform user with a grant on tenant A cannot read tenant B (extends the existing
  tenant-isolation test in `test/unit/tenant.test.ts`).
- A tenant `users` row whose `role` is hand-edited to `super_admin` gains **no** platform
  access — the value isn't in `platform_role_enum` and the plane is keyed off a different
  table and secret.

**Manual**
```bash
curl -X POST /v1/platform/auth/login -d '{"email":"...","password":"...","totp":"123456"}'
curl /v1/platform/tenants           -H "Authorization: Bearer <platform_token>"
curl -X POST /v1/platform/support/grants \
     -H "Authorization: Bearer <platform_token>" \
     -d '{"tenantId":"...","scope":"read","reason":"ticket #412 — missing receipt"}'
curl /v1/platform/audit?tenantId=... -H "Authorization: Bearer <platform_token>"
```

---

## 7. Open items

- **Tenant retention window** before a suspended tenant's schema is dropped — needs an
  NDPR call (suggest 90 days). Still open; blocks the soft `tenants:delete` in §4.5.
- **Support access notification channel** — Phase B shipped **SMS** via Termii. The plan
  originally assumed email via Resend as the default. Ratify SMS, or add email alongside.
- **IP allowlist for `/v1/platform/*`** — worth it once support headcount exists; skip
  while the team is one person.
