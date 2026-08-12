# BPOS Codebase Review

Generated: 2026-08-11
Scope: Fastify + TypeScript + Neon PostgreSQL + Upstash Redis + BullMQ API
Branch: `development`

## Executive Summary

The codebase has a solid foundation — good JWT/argon2 auth patterns, hashed refresh/reset
tokens, tenant-aware schema isolation, rate limiting on auth routes, and a graceful shutdown
sequence. However, there are several **critical reliability issues** (background workers never
start, an always-broken tenant resolver, a health check that can hang indefinitely) and a
handful of **security gaps** that should be addressed before production traffic.

- **Critical:** 4
- **High:** 8
- **Medium:** 8
- **Low:** 6

---

## Critical

### C1 — BullMQ workers are never started; all background jobs silently fail
`src/shared/queue/workers/*.worker.ts` (6 files) — workers are created via `createWorker(...)`
at module-load time, but **no file imports them** and there is no worker process/script in
`package.json` or `fly.toml`. Every job enqueued by live code (invoice PDF generation, SMS
alerts, payment-webhook DLQ, subscription lifecycle) sits in Upstash Redis forever.

**Fix:** Create `src/queue/worker.ts` that imports all six workers and blocks; add a
`worker` script and a second `[processes]` entry in `fly.toml` (or start them in-process
behind a flag).

### C2 — `request.user.tenantId` / `request.user.userId` are never populated → auth middleware always fails
`src/shared/middleware/tenant.ts:17` reads `request.user.tenantId`, and `src/modules/auth/routes.ts:54`
reads `request.user.tenantId`. The JWT payload only contains `sub` and `tid`
(`src/modules/auth/service.ts:49-55`). `src/shared/types/fastify.d.ts:23-25` declares
`userId`/`tenantId` as "convenience aliases populated after jwtVerify", but **no hook or
decorator ever populates them** (verified: no assignment to `request.user.*` anywhere).
Result: `resolveTenant` always throws `Tenant context missing from token`, so **every
protected route is broken at runtime**.

**Fix:** Populate the aliases in a `preHandler`/`onRequest` hook after `jwtVerify` (e.g.
`request.user = { ...request.user, userId: request.user.sub, tenantId: request.user.tid }`),
or read `request.user.tid`/`request.user.sub` directly everywhere.

### C3 — Health check can hang indefinitely on Redis/queue outage
`src/shared/health/check.ts:82-87` calls `q.getJobCounts()` with no timeout, over BullMQ
connections configured with `maxRetriesPerRequest: null` (`src/shared/queue/client.ts:13`).
With ioredis offline-queue buffering, the command waits forever → `GET /` and `GET /health`
never respond (Fly probes fail, connections leak). `runHealthChecks()` also has no overall
deadline (`check.ts:120-125`).

**Fix:** Race each check against `AbortSignal.timeout(...)` (or `Promise.race`), and give
`runHealthChecks` an overall deadline (~5s). Return 503 on timeout.

### C4 — `drizzle-orm` SQL injection vulnerability (known CVE)
Dependency: `drizzle-orm@0.31.4` — GHSA-gpj5-g38j-94v9 (SQL injection via improperly escaped
SQL identifiers), fixed in `>=0.45.2`.

**Fix:** Upgrade to `drizzle-orm@0.45.x` and adjust any breaking API changes.

---

## High

### H1 — Password reset token is logged AND the reset email is never sent
`src/modules/auth/controller.ts:86-89` logs `{ token: result.rawToken, ... }` to the logger in
**all environments** (comment claims "dev only"), and no code path ever emails the token to the
user. Raw reset tokens in production logs + a broken reset flow.

**Fix:** Remove the token from logs; actually deliver the token via email (Brevo/Resend) in
`forgotPassword`, or return it via a gated dev-only path.

### H2 — Shipping module missing role enforcement (`managerGuard` is auth-only)
`src/modules/shipping/routes.ts:25` — `managerGuard = [requireAuth, resolveTenant]` with **no
`requireManager`**. Any authenticated user (staff/viewer) can create/update/delete zones,
methods, rates, and pickup locations.

**Fix:** Add `requireManager` to the shipping `managerGuard` (as done in `staff/routes.ts:17`).

### H3 — Dead QStash/Upstash code makes required env vars that can crash boot
`src/config/env.ts:20-25` requires `UPSTASH_REDIS_URL`, `QSTASH_URL`, `QSTASH_TOKEN`,
`QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` — but the only consumers
(`src/shared/queue/qstash.ts`, `src/shared/queue/redis.ts`) are **never imported**. If any is
missing in a deploy, `parseEnv()` calls `process.exit(1)` → crash-loop.

**Fix:** Delete the dead files and make those vars optional, or wire them up; document required
secrets in `.env.example`.

### H4 — `pino-axiom` transport is not installed
`src/plugins/axiom.ts:15-22` uses `pino.transport({ target: 'pino-axiom' })`, but the package
is absent from `package.json`/lockfile. When `AXIOM_TOKEN` is configured, the transport worker
cannot resolve the module → logging errors / possible crash.

**Fix:** Add `pino-axiom` to dependencies or drop the Axiom transport.

### H5 — Fresh database cannot be provisioned (migrations missing)
`db/migrations/public` and `db/migrations/tenant` do not exist in the repo. `drizzle.config.ts:8`
writes to them and `src/shared/db/migrate.ts` resolves them — `drizzle.migrate()` fails when the
folder is absent.

**Fix:** Generate and commit migrations (`npm run db:generate`), or vendor an initial migration.

### H6 — Placeholder secrets pass env validation and would ship insecure
`src/config/env.ts:12-13` only checks `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` length >= 32.
The `.env`/`.env.example` placeholder `replace-with-at-least-32-char-random-secret` (44 chars)
passes. If a deploy forgets to override it, all tokens are signed with a publicly-known secret.

**Fix:** Reject known placeholder prefixes in `parseEnv()` and fail fast.

### H7 — `.dockerignore` missing → secrets + junk uploaded on every Fly deploy
No `.dockerignore` at repo root. Build context ships `node_modules/`, `.git/`, `dist/`, and
**`.env` (live credentials)** to the Fly remote builder even though `COPY` only takes specific
paths.

**Fix:** Add `.dockerignore` excluding `node_modules`, `.git`, `dist`, `.env*`, `coverage`, `test`.

### H8 — Health check returns 200 when degraded
`src/app.ts:93,109` — a single failed component (`degraded`) returns HTTP 200. Orchestrators
treat the service as healthy when it's half-down.

**Fix:** Return 503 for both `degraded` and `error`, or only `error` per monitoring policy.

---

## Medium

### M1 — No `.dockerignore` + two Dockerfiles disagree on `NODE_ENV`
Root `Dockerfile:27` bakes `NODE_ENV=staging`; `docker/Dockerfile:20` uses `production`. A prod
build from the root file silently runs in staging mode.

**Fix:** Reconcile to a single Dockerfile and set `NODE_ENV` at runtime, not build time.

### M2 — `tsconfig.build.tsbuildinfo` (build artifact) is committed
`tsconfig.build.tsbuildinfo` (≈420KB) is tracked; `.gitignore:3` only ignores
`tsconfig.tsbuildinfo`. The incremental build cache churns the repo every build.

**Fix:** `git rm --cached tsconfig.build.tsbuildinfo` and add `*.tsbuildinfo` to `.gitignore`.

### M3 — Deploy CI references Postman files that don't exist
`.github/workflows/deploy-staging.yml:32-35` runs `newman` on
`docs/postman-collection.json` + `docs/postman-env-staging.json`, but only
`docs/BPOS-API.postman_collection.json` exists → staging smoke test always fails.

**Fix:** Point the workflow at the real collection file or generate one.

### M4 — Workers/DB tooling unavailable in the production container
`db:migrate` / `db:seed:*` use `tsx` (devDependency), but the Docker runner installs with
`npm ci --omit=dev`. Migrations/seeds cannot run inside the prod image.

**Fix:** Run migrations as a separate pre-deploy step (host/build stage) or move `tsx` to prod
deps for the migration image.

### M5 — WhatsApp sender is a PII-leaking stub in production code
`src/modules/whatsapp/sender.ts:8-12` logs the full payload (phone numbers, message bodies) to
stdout whenever `WHATSAPP_ACCESS_TOKEN` is unset — including in production.

**Fix:** Remove stdout logging of payloads; return a structured failure instead.

### M6 — Manager can promote users to `owner` (possible privilege escalation)
`src/modules/staff/service.ts:127` accepts `role` including `'owner'` on `updateStaffMember`, and
writes are guarded only by `requireManager` (`staff/routes.ts:17`). A manager could grant
themselves owner rights.

**Fix:** Restrict `owner` role mutation to `requireOwner`; validate role on invite/update.

### M7 — Internal error details leaked in 5xx responses
`src/shared/errors/handler.ts:12-33` returns `error.message` verbatim for `statusCode >= 500`;
`LedgerImbalanceError` and `ExternalServiceError('R2', ...)` embed provider/raw internals that
reach the client.

**Fix:** Return a generic message for 5xx; log full detail server-side only.

### M8 — Eager BullMQ connections at module load + root route runs full health battery
- `src/shared/queue/client.ts:49-53` opens 5 ioredis connections (no `lazyConnect`) at import
  time.
- `src/app.ts:91-103` runs the full health battery (DB + Redis + 5 `getJobCounts`) on every
  unauthenticated `GET /`.

**Fix:** Lazy-connect queues; make `/` a cheap liveness route and keep deep checks on `/health`.

---

## Low

### L1 — No pino `redact` list
`src/app.ts:44-56` — add `redact: ['req.headers.authorization', '*.token', '*.password']` so a
future body/header log can't ship secrets to Axiom.

### L2 — `GET /` returns 200 for degraded (see H8); root route duplicates `/health` behavior

### L3 — `.gitignore` lists `src/shared/http/context.ts` and `response.ts`, but both are tracked
Stale/misleading — a contributor could `git rm --cached` them accidentally.

### L4 — `pino-pretty` is in `dependencies` (dev-only tool)
Move to `devDependencies`.

### L5 — `npm run db:seed:dev` points to missing `db/seed/dev.ts`
Only `db/seed/qa.ts` exists. Either add the dev seed or fix the script.

### L6 — `uuid` CVE (moderate): GHSA-w5hq-g745-h8pq, fixed in `>=11.1.1`
Upgrade `uuid` (watch for breaking change to v14).

---

## Implementation Task List

**Phase 1 — Fix critical runtime failures (do first):**

- [ ] C2: Populate `request.user.userId`/`tenantId` aliases (or use `sub`/`tid`) so
      authenticated routes actually work.
- [ ] C1: Start BullMQ workers — add `src/queue/worker.ts` + `worker` script + Fly process.
- [ ] C3: Add timeouts to health checks so `/` and `/health` can't hang.
- [ ] C4: Upgrade `drizzle-orm` to `>=0.45.2`.

**Phase 2 — Security:**

- [ ] H1: Stop logging password reset tokens; deliver the reset email.
- [ ] H2: Add `requireManager` to shipping `managerGuard`.
- [ ] H6: Reject placeholder JWT secrets at boot.
- [ ] M6: Restrict `owner` role changes to `requireOwner`.
- [ ] M7: Sanitize 5xx error responses.

**Phase 3 — Deploy/ops reliability:**

- [ ] H3: Remove dead QStash/Upstash code or make env vars optional.
- [ ] H4: Add `pino-axiom` or drop the Axiom transport.
- [ ] H5: Generate and commit DB migrations.
- [ ] H7/M1: Add `.dockerignore`; reconcile Dockerfiles + `NODE_ENV`.
- [ ] M2: Untrack `tsconfig.build.tsbuildinfo`.
- [ ] M3: Fix Postman paths in the deploy workflow.
- [ ] M4: Move migrations out of the prod container or add `tsx` to prod deps.

**Phase 4 — Cleanup:**

- [ ] H8: Health status → 503 policy.
- [ ] M5: Remove WhatsApp PII stdout logging.
- [ ] M8: Lazy queues; lightweight `/`.
- [ ] L1–L6: pino redact, `.gitignore` cleanup, dep cleanup.
- [ ] Address remaining lint debt (~200 errors: `no-non-null-assertion` 32,
      `no-unnecessary-condition` 30, `require-await` 17, `no-deprecated` 15, etc.).
