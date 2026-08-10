# Backend Best Practices — Pedantic Tasks

This document identifies backend best practices not yet implemented in the BPOS codebase, organized by priority.

---

## Priority 1: Critical (Blocks Production)

- [x] **1.1 Health Check Enhancement** — DB + Redis + queue status checks
- [x] **1.2 Graceful Shutdown** — BullMQ worker drain + Redis close
- [x] **1.3 Password Reset Endpoint** — forgot-password + reset-password with rate limiting

---

## Priority 2: High (Security & Reliability)

- [x] **2.1 Termii SMS Integration** — Pluggable SMS provider (Termii + VTPASS), all 4 workers updated
- [x] **2.2 Structured Log Drain** — Pino → Axiom/Loki/Datadog for persistent log storage
- [x] **2.3 Sentry Integration** — Exception tracking with request context
- [ ] **2.4 Backup Configuration** — Neon point-in-time recovery (dashboard config)

---

## Priority 3: Medium (Quality & Maintainability)

- [x] **3.1 Test Coverage for Missing Modules** — auth, customers, expenses, invoicing, locations, staff, reporting, whatsapp, onboarding, shipping
- [ ] **3.2 OpenAPI Response Schemas** — Add Zod response schemas for Swagger docs (currently stripped for Fastify 5 compat)
- [ ] **3.3 Consistent Guard Naming** — Standardize readGuard/writeGuard/adminGuard across all 19 modules
- [ ] **3.4 Webhook Response Consistency** — Always return 200 to providers, log failures internally
- [ ] **3.5 Middleware Test Coverage** — requireAuth, resolveTenant, requireRole, requireManager

---

## Priority 4: Low (Nice-to-Have)

- [ ] **4.1 API Versioning Strategy** — Document /v1/ strategy for future breaking changes
- [ ] **4.2 Rate Limiting per Tenant** — Tier-based limits (starter/growth/enterprise)
- [x] **4.3 Request Validation Middleware** — Zod schemas for all 19 modules via @fastify/type-provider-zod
- [ ] **4.4 API Changelog** — Maintain CHANGELOG.md for API consumers
- [ ] **4.5 OpenAPI Diff in CI** — Detect breaking API changes

---

## Summary

| Priority | Category | Total | Done | Remaining |
|----------|----------|-------|------|-----------|
| P1 | Critical | 3 | 3 | 0 |
| P2 | High | 4 | 3 | 1 |
| P3 | Medium | 5 | 2 | 3 |
| P4 | Low | 5 | 1 | 4 |
| **Total** | | **17** | **9** | **8** |

**Completed this session:**
1. ✅ Health check with DB/Redis/queue status
2. ✅ Graceful shutdown with BullMQ drain
3. ✅ Password reset endpoints (forgot + reset)
4. ✅ Pluggable SMS provider (Termii + VTPASS) with all workers updated
5. ✅ Controller layer refactoring (19 modules, on `refactor` branch)
6. ✅ Structured logging (Axiom integration)
7. ✅ Sentry error tracking with request context
8. ✅ Zod request validation for all 19 modules (Fastify 5 + @fastify/type-provider-zod)
9. ✅ Integration tests for customers, expenses, invoicing, locations, staff
10. ✅ Fastify 4→5 + Zod 3→4 migration (all plugins upgraded)
11. ✅ Fixed all test regressions from Zod migration (19 → 2 failures)

**Remaining 2 test failures (infra, not code):**
- `GET /health` — Redis ECONNREFUSED (no local Redis)
- `e2e Step 9` — Same Redis timeout

---

## Next Session Priorities

1. **Merge `refactor` branch into `development`** — All changes are on refactor, need to land
2. **Add Zod response schemas back** — Re-add for Swagger docs using `jsonSchemaTransform` compatible format
3. **Middleware test coverage** — Unit tests for requireAuth, resolveTenant, requireRole, requireManager, requireFeature
4. **Webhook response consistency audit** — Ensure all webhook handlers return 200 and log errors
5. **Guard naming standardization** — Rename inconsistent guard variables across modules
6. **Backup configuration** — Neon dashboard: enable point-in-time recovery
