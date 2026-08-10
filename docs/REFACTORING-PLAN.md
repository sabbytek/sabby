# Refactoring Plan: Route → Controller → Service Architecture

## Context

The BPOS backend currently uses a lean pattern: **Route → Service → Database**. The route handler acts as both HTTP layer AND controller. This works for small modules but breaks down as modules grow — route handlers become bloated with request extraction, response formatting, and business logic leakage.

This plan introduces a **Controller** layer between Route and Service, giving us:

```
Route (HTTP definition) → Middleware (auth/tenant) → Controller (HTTP logic) → Service (business logic) → Database
```

## Target Architecture

### Layer Responsibilities

| Layer | Owns | Does NOT Own |
|-------|------|--------------|
| **Route** | Endpoint definition, JSON Schema, preHandler guards, rate limiting | Business logic, response formatting, request data extraction |
| **Middleware** | Auth, tenant resolution, feature gating, request ID | Business logic |
| **Controller** | Request data extraction, type transformation, service invocation, response formatting, HTTP status codes | Business logic, database queries |
| **Service** | Business rules, validation, domain events, database transactions | HTTP concerns, request/response objects |
| **Database (Drizzle)** | Schema, queries, migrations | Business rules |

### What Moves Where

| Current Location | New Location | Example |
|------------------|--------------|---------|
| `request.body` extraction | Controller | `const { email, password } = request.body` |
| `request.params` extraction | Controller | `const { id } = request.params` |
| `request.query` parsing (`parseInt`, `new Date()`) | Controller | `const page = parseInt(query.page ?? '1')` |
| `request.user.userId` / `request.tenant.schema` | Controller | Passed as context object |
| Response formatting `{ success: true, data }` | Controller | Centralized via helper |
| `reply.status(201)` | Controller | HTTP status decisions |
| Response post-processing (e.g., `sanitizeVariant`) | Controller | Authorization-aware shaping |
| Business validation | Service | `throw new ValidationError(...)` |
| Database queries | Service | Drizzle ORM calls |
| Domain events | Service | Queue jobs, webhooks |

## Shared Utilities

### 1. Controller Context Type

```typescript
// src/shared/types/controller.ts

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { TenantContext, AuthUser, UserRole } from './index.js';

/**
 * Standardized context passed to all controller methods.
 * Extracts only what controllers need from the Fastify request.
 * Controllers never import Fastify types directly.
 */
export interface RequestContext {
  /** Tenant schema name for database queries */
  schema: string;
  /** Tenant ID */
  tenantId: string;
  /** Authenticated user's ID */
  userId: string;
  /** Authenticated user's role */
  role: UserRole;
  /** Authenticated user's email */
  email: string;
}

/**
 * Creates a RequestContext from a Fastify request.
 * Called once per request, before controller invocation.
 */
export function createContext(request: FastifyRequest): RequestContext {
  return {
    schema: request.tenant.schema,
    tenantId: request.user.tenantId,
    userId: request.user.userId,
    role: request.user.role,
    email: request.user.email,
  };
}
```

### 2. Response Helpers

```typescript
// src/shared/http/response.ts

import type { FastifyReply } from 'fastify';

/**
 * Send a success response with optional status code.
 */
export function sendSuccess<T>(reply: FastifyReply, data: T, status = 200): void {
  reply.status(status).send({ success: true, data });
}

/**
 * Send a created response (201).
 */
export function sendCreated<T>(reply: FastifyReply, data: T): void {
  sendSuccess(reply, data, 201);
}

/**
 * Send a success message response.
 */
export function sendMessage(reply: FastifyReply, message: string, status = 200): void {
  reply.status(status).send({ success: true, data: { message } });
}

/**
 * Send a CSV file download.
 */
export function sendCsv(reply: FastifyReply, csv: string, filename: string): void {
  reply
    .header('Content-Type', 'text/csv')
    .header('Content-Disposition', `attachment; filename="${filename}"`)
    .send(csv);
}
```

### 3. Controller Base Types

```typescript
// src/shared/types/controller.ts (additional)

import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Base controller interface. All controllers implement this.
 */
export interface BaseController {
  /** Handler context — set by the route wrapper */
  ctx?: RequestContext;
}

/**
 * Generic controller method signature.
 * Controllers receive pre-extracted, typed data — never the raw request.
 */
export type ControllerMethod<TInput, TOutput> = (
  ctx: RequestContext,
  input: TInput,
) => Promise<TOutput>;

/**
 * Pagination input — common across all list endpoints.
 */
export interface PaginationInput {
  page: number;
  limit: number;
}

/**
 * Parse pagination query params with defaults.
 */
export function parsePagination(query: { page?: string; limit?: string }): PaginationInput {
  return {
    page: Math.max(1, parseInt(query.page ?? '1', 10) || 1),
    limit: Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10) || 20)),
  };
}
```

## Refactored Module Example

### Before (Current: Route + Service)

```typescript
// src/modules/customers/routes.ts (current)
export default async function customersRoutes(app: FastifyInstance) {
  app.post('/', {
    preHandler: guard,
    schema: { /* ... */ },
  }, async (request, reply) => {
    const body = request.body as CreateCustomerInput;
    const customer = await createCustomer(request.tenant.schema, {
      ...body,
      consentGivenAt: body.consentGivenAt ? new Date(body.consentGivenAt) : undefined,
    });
    return reply.status(201).send({ success: true, data: customer });
  });
}
```

### After (Refactored: Route + Controller + Service)

```typescript
// src/modules/customers/controller.ts (NEW)
import { sendCreated, sendSuccess } from '../../shared/http/response.js';
import { parsePagination } from '../../shared/types/controller.js';
import type { RequestContext } from '../../shared/types/controller.js';
import { createCustomer, getCustomer, listCustomers, updateCustomer } from './service.js';

export interface CreateCustomerBody {
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  consentGivenAt?: string;
  consentSource?: string;
}

export interface UpdateCustomerBody {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

export interface ListCustomerQuery {
  page?: string;
  limit?: string;
  search?: string;
}

export async function create(ctx: RequestContext, body: CreateCustomerBody, reply: FastifyReply) {
  const customer = await createCustomer(ctx.schema, {
    ...body,
    consentGivenAt: body.consentGivenAt ? new Date(body.consentGivenAt) : undefined,
  });
  sendCreated(reply, customer);
}

export async function list(ctx: RequestContext, query: ListCustomerQuery, reply: FastifyReply) {
  const pagination = parsePagination(query);
  const result = await listCustomers(ctx.schema, pagination, query.search);
  sendSuccess(reply, result);
}

export async function get(ctx: RequestContext, id: string, reply: FastifyReply) {
  const customer = await getCustomer(ctx.schema, id);
  sendSuccess(reply, customer);
}

export async function update(ctx: RequestContext, id: string, body: UpdateCustomerBody, reply: FastifyReply) {
  const customer = await updateCustomer(ctx.schema, id, body);
  sendSuccess(reply, customer);
}
```

```typescript
// src/modules/customers/routes.ts (refactored)
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../shared/middleware/auth.js';
import { resolveTenant } from '../../shared/middleware/tenant.js';
import { requireFeature } from '../../shared/middleware/feature-gate.js';
import { createContext } from '../../shared/types/controller.js';
import * as controller from './controller.js';

const guard = [requireAuth, resolveTenant, requireFeature('customers:manage')];

export default async function customersRoutes(app: FastifyInstance) {
  app.post('/', {
    preHandler: guard,
    schema: {
      tags: ['Customers'],
      summary: 'Create a customer record',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['firstName', 'lastName'],
        properties: {
          firstName: { type: 'string', minLength: 1 },
          lastName: { type: 'string', minLength: 1 },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string' },
          consentGivenAt: { type: 'string', format: 'date-time' },
          consentSource: { type: 'string', enum: ['pos_checkout', 'website', 'whatsapp', 'manual'] },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    await controller.create(createContext(request), request.body as controller.CreateCustomerBody, reply);
  });

  app.get('/', {
    preHandler: guard,
    schema: { /* ... */ },
  }, async (request, reply) => {
    await controller.list(createContext(request), request.query as controller.ListCustomerQuery, reply);
  });

  // ... other routes follow same pattern
}
```

```typescript
// src/modules/customers/service.ts (UNCHANGED — already clean)
// No changes needed — service is already pure business logic
```

### Key Differences

| Aspect | Before | After |
|--------|--------|-------|
| Route handler size | 10-20 lines | 2-3 lines |
| Request extraction | In route handler | In controller |
| Type transformation | In route handler | In controller |
| Response formatting | In route handler | In controller (via helpers) |
| Service imports | In routes.ts | In controller.ts |
| Testability | Must spin up Fastify | Can test controller directly |

## Migration Strategy

### Phase 1: Shared Utilities (No Breaking Changes)

Create the shared types and helpers that controllers will use:

1. `src/shared/types/controller.ts` — RequestContext, PaginationInput, parsePagination
2. `src/shared/http/response.ts` — sendSuccess, sendCreated, sendCsv, sendMessage

### Phase 2: Refactor Modules (One at a Time)

**Refactor order** (by complexity, simplest first):

| Priority | Module | Routes | Complexity | Reason |
|----------|--------|--------|------------|--------|
| 1 | `onboarding` | 1 | Trivial | Single GET, no mutation |
| 2 | `locations` | 5 | Low | Simple CRUD, no complex logic |
| 3 | `staff` | 5 | Low | Simple CRUD with role checks |
| 4 | `expenses` | 3 | Low | Simple CRUD + ledger side-effect |
| 5 | `customers` | 4 | Low | Simple CRUD + NDPR fields |
| 6 | `invoicing` | 3 | Low | Simple CRUD + PDF generation |
| 7 | `subscriptions` | 3 | Medium | State machine, webhook |
| 8 | `products` | 8 | Medium | Variants, sanitization logic |
| 9 | `inventory` | 5 | Medium | Stock movements, alerts |
| 10 | `orders` | 7 | High | Complex state machine, calculations |
| 11 | `payments` | 3 | High | Gateway abstraction, webhooks |
| 12 | `ledger` | 4 | Medium | Read-only, aggregation queries |
| 13 | `reporting` | 7 | Medium | CSV exports, aggregation |
| 14 | `shipping` | 18 | High | Many sub-resources |
| 15 | `dispatch` | 6 | High | Gateway integration, webhooks |
| 16 | `auth` | 6 | Medium | JWT, password reset |
| 17 | `tenants` | 1 | Low | Provisioning only |
| 18 | `uploads` | 1 | Low | File handling |

### Phase 3: Verification

After each module refactor:
1. Run `npm run typecheck` — must pass
2. Run `npm run lint` — must pass (no new errors)
3. Run `npm run test` — existing tests must still pass
4. Run `npm run test:coverage` — coverage should not decrease

### Phase 4: Documentation

Update `docs/README.md` with the new architecture pattern.

## Rollback Plan

Each module refactor is independent. If a module breaks:
1. Revert the controller file
2. Revert the routes.ts changes
3. Service.ts is unchanged — no rollback needed

## Estimated Effort

| Phase | Effort |
|-------|--------|
| Phase 1: Shared utilities | 1-2 hours |
| Phase 2: All 18 modules | 2-3 hours per module (avg) = 36-54 hours |
| Phase 3: Verification | Included in Phase 2 |
| Phase 4: Documentation | 1 hour |
| **Total** | **~40-60 hours** |

## Notes

- **Service files do NOT change** — they're already clean business logic
- **Middleware files do NOT change** — they're already properly separated
- **Test files may need updates** — if they mock route handlers directly
- **This is a non-breaking refactor** — API contracts remain identical
- **Can be done incrementally** — no big-bang rewrite needed

## Questions for You

1. **Priority**: Start with the trivial modules (onboarding, locations) or the complex ones (orders, payments)?
2. **Response helpers**: Use the shared `sendSuccess`/`sendCreated` everywhere, or keep the existing pattern for consistency during migration?
3. **Controller naming**: `controller.ts` or `handlers.ts`?
