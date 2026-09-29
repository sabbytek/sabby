# BPOS QA Test Guide

Test guide for the BPOS multi-tenant commerce API, covering every shipped
feature on both planes: the **merchant plane** (`/v1/*`) that merchants and
their staff use, and the **internal admin plane** (`/v1/platform/*`) that BPOS
support and admin staff use.

Everything here is exercised over HTTP against the deployed QA service. Use
Postman, Insomnia, `curl` or the Swagger UI at `<BASE>/docs`.

Companion files:

| File | What it is |
| --- | --- |
| [`docs/qa/payloads/`](qa/payloads/) | Copy-paste request bodies for every endpoint — valid, boundary and invalid — plus query-string examples |
| [`docs/qa/smoke.sh`](qa/smoke.sh) | Optional scripted smoke run over the same flow, if you prefer a one-command sanity check |
| [`docs/openapi.yaml`](openapi.yaml), [`docs/BPOS-API.postman_collection.json`](BPOS-API.postman_collection.json) | API schema and a ready-made Postman collection |

---

## 1. How the product works

### 1.1 Two planes, two identities

**Merchant plane — `/v1/*`.** A merchant (one business) signs up, gets its own
isolated data space, and invites staff. Every request carries a merchant access
token, and every response is scoped to that merchant. Roles inside a merchant
are `owner` > `manager` > `staff` > `viewer`.

**Admin plane — `/v1/platform/*`.** BPOS's own employees. Completely separate
accounts, separate tokens and separate roles (`super_admin`, `admin`, `support`,
`read_only`). A platform token must never work on a merchant route, and a
merchant token must never work on an admin route — that is one of the things you
are testing.

Crucially, **being BPOS staff does not grant access to a merchant's data.** To
look inside one merchant, a support agent must open a time-boxed *access grant*
with a written reason, and the merchant sees that access, and the reason, in
their own activity trail.

### 1.2 What a merchant does, end to end

This is the main journey the test matrix in §5 follows:

1. **Sign up** (`POST /v1/tenants`, public) — a business registers with a name, a
   `slug` (their handle), a business email and an owner password. They land on the
   **trial** plan and get a default "Main Location" and a chart of accounts.
2. **Log in** (`POST /v1/auth/login`) — with `tenantSlug` + email + password. The
   slug matters: the same email in a different business is a different account.
3. **Set up the business** — invite staff, add locations (growth plan and above),
   build the catalogue: category → product → variant. Price and cost live on the
   **variant**, not the product.
4. **Stock it** — receive stock into a location, adjust it for damage or a stock
   count. Every movement is recorded and auditable.
5. **Sell** — create a draft order (from the POS, WhatsApp, the website or
   manually), then move it through its lifecycle:
   `draft → confirmed → processing → fulfilled` (with `dispatched` in between when
   a courier is used). Confirming is the moment stock is deducted and the sale is
   posted to the books. Cancelling a confirmed order puts the stock back.
6. **Get paid** — a payment link is generated through Paystack (or Flutterwave).
   The customer pays on the gateway's page, and the gateway calls back to a
   **webhook**, which is what actually marks the order paid and posts the money.
7. **Invoice** — an invoice PDF is generated for the order and emailed to the customer.
8. **Keep books automatically** — every confirmed order, payment and expense posts
   a double-entry journal entry. Debits must always equal credits.
9. **See the business** — P&L, best sellers, revenue by location, staff sales,
   inventory valuation, plus CSV exports.
10. **Pay BPOS** — the merchant subscribes to a plan; what they can do is decided
    by that plan (§4.3).

Two extras hang off the same data: **shipping** (zones, rates and a checkout
calculator the storefront calls) and **WhatsApp ordering**, where a customer
browses and orders entirely inside a WhatsApp chat.

### 1.3 What a BPOS staff member does

1. **Log in** to the admin plane. `support` and `read_only` need only a password;
   `admin` and `super_admin` must also enter a 6-digit authenticator code (MFA).
2. **Manage merchants** — list and search them, provision one on their behalf,
   suspend or reactivate one, change their plan. Every one of these needs a
   written **reason of at least 10 characters**, and is recorded in the audit log.
3. **Help a merchant** — open a read or write access grant on that one merchant,
   then read their orders, re-send a receipt, re-process a payment webhook,
   unlock an account or trigger a password reset.
4. **Manage BPOS staff accounts** (`super_admin` only) and **read the audit log**,
   which is append-only: nothing can edit or delete an entry.

### 1.4 The four things that decide whether a request succeeds

Almost every test in this guide comes down to one of these. When something is
refused, work out which one refused it before filing a bug:

| Check | Fails with | Means |
| --- | --- | --- |
| **Authentication** | 401 | No token, a bad or expired token, or a token from the other plane |
| **Role** | 403 | Logged in, but this role is not allowed (e.g. `staff` confirming an order) |
| **Plan entitlement** | 402 | The merchant's plan does not include this feature (§4.3) |
| **Tenant scope** | 404 | The record belongs to a different merchant — it must look like it does not exist, never 403 |

---

## 2. What you need before you start

Ask the dev team for these — none of it is something QA sets up:

| What | Why | Notes |
| --- | --- | --- |
| The QA **base URL** | Everything below is `<BASE>/v1/...` | Referred to as `<BASE>` throughout |
| A **growth-plan** merchant: owner login | Full feature coverage — locations, WhatsApp, dispatch, revenue-by-location | Note its `tenantSlug` |
| An **entry-plan** merchant: owner login | Mid-tier gates: locations, WhatsApp and dispatch must be **denied** | |
| A **trial-plan** merchant: owner login | The most restricted plan — most features must be denied | You can also create one yourself via `POST /v1/tenants` |
| `manager`, `staff` and `viewer` logins inside the growth merchant | The role matrix in §4.2 | Or invite them yourself with `staff_invite_*` from the payload files |
| Platform logins for **`read_only`, `support`, `admin`, `super_admin`** | The permission matrix in §5.20.2 | `admin`/`super_admin` need an authenticator app for MFA |
| The **Paystack test secret** and the **WhatsApp app secret** | Needed to sign webhook calls (§6.1) | Test keys only — never a live key |
| Whether email delivery is switched on in QA | Decides whether INVC-03 or INVC-04 applies | |

Keep one variable per identity so you never mix tokens up:

```
BASE=<qa base url>
OWNER=…   MANAGER=…   STAFF=…   VIEWER=…    # merchant access tokens (growth)
ENTRY=…   TRIAL=…                           # owner tokens on the other plans
OTHER=…                                     # owner token of a DIFFERENT merchant
PF_RO=…   PF_SUPPORT=…  PF_ADMIN=…  PF_SUPER=…   # platform access tokens
```

`OTHER` is not optional: the tenant-isolation suite (§4.4) is the
highest-severity set in this guide, and it needs two merchants.

### 2.1 Configuration facts that change what "correct" looks like

You cannot change these, but you need to know them before judging a result.
Confirm each with the dev team for the environment under test:

| Question | Why it matters |
| --- | --- |
| Is the admin plane enabled? | If not, **every** `/v1/platform/*` route returns 404. That is configuration, not a routing bug |
| How long does an access token last? | Default 15 minutes — that is the wait for the token-expiry test (XAUTH-08) |
| Is email delivery enabled? | Invoices are generated either way; only delivery differs |
| Is WhatsApp signature checking enabled? | If the app secret is not configured, signatures are not checked and WA-07 cannot be signed off |
| What is the upload size cap? | Default 10 MiB — needed for UPL-05 |
| Is the API docs page exposed? | `<BASE>/docs` being reachable on a production-like environment is itself a finding |
| What is the request rate limit? | 200 requests/minute per merchant+IP outside test environments (XOPS-01) |

---

## 3. API conventions to check on every response

**Success envelope** — `{"success": true, "data": …}`; `201` on create.
Paginated endpoints return `data.items` plus `data.pagination.{page,limit,total,totalPages}`
(nested, **not** flat — a client that reads `data.total` is the client's bug).

**Error envelope** — `{"success": false, "error": {"code", "message", "details"?}}`.

| Code | HTTP | Raised when |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Zod/Fastify schema failure, or a business rule such as an illegal state transition |
| `UNAUTHORIZED` | 401 | Missing, malformed, expired or wrong-plane token; suspended tenant |
| `FEATURE_GATED` | 402 | The tenant's plan does not include the feature, or the subscription has lapsed |
| `FORBIDDEN` | 403 | Authenticated but the role or platform permission is insufficient |
| `NOT_FOUND` | 404 | Unknown id — **including an id that exists in another tenant** |
| `CONFLICT` | 409 | Duplicate slug, SKU or staff email |
| `RATE_LIMIT_EXCEEDED` | 429 | More than 200 requests/minute per tenant+IP |
| `EXTERNAL_SERVICE_ERROR` | 502 | Paystack, Flutterwave, Termii, R2 or a courier failed |
| `LEDGER_IMBALANCE` | 500 | A journal entry did not balance — always a bug, file it |
| `INTERNAL_ERROR` | 500 | Unhandled. Always a bug: capture `x-request-id` and the server log |

**Non-negotiables to assert on every single request**

1. Money is an **integer number of kobo**. `1250.75` must be rejected; ₦12,500.00 is `1250000`.
2. Request bodies are `.strict()`. An unknown key is a `400`, never silently dropped.
3. Errors never leak a stack trace, SQL, a password hash, or a stored API key.
4. Every response carries `x-request-id` (echoed from the request when supplied) — quote it in bug reports.
5. Security headers from Helmet are present; CORS only echoes origins in `CORS_ORIGINS`.

---

## 4. Cross-cutting suites

Run these first. A failure here invalidates the feature testing that follows.

### 4.1 Authentication and session handling

| ID | Scenario | Expected |
| --- | --- | --- |
| XAUTH-01 | `POST /v1/auth/login` with correct credentials | 200, `accessToken` + `refreshToken` + user profile |
| XAUTH-02 | Correct email/password but **another tenant's** `tenantSlug` | 401, generic message (no hint that the account exists elsewhere) |
| XAUTH-03 | Wrong password | 401, message identical to XAUTH-04 |
| XAUTH-04 | Unknown email | 401, identical message and comparable response time (no user enumeration) |
| XAUTH-05 | Any protected route with no `Authorization` header | 401 |
| XAUTH-06 | Protected route with `Bearer garbage.token.value` | 401, not 500 |
| XAUTH-07 | Token signed with a different secret | 401 |
| XAUTH-08 | Access token used after its lifetime (15 minutes by default — park the token and come back) | 401 |
| XAUTH-09 | `POST /v1/auth/refresh` with a valid refresh token | 200, a new access token that works |
| XAUTH-10 | Refresh with a token belonging to a different `tenantSlug` | 401 |
| XAUTH-11 | `POST /v1/auth/logout`, then reuse that refresh token | First 200, second 401 |
| XAUTH-12 | `GET /v1/auth/me` | 200, `userId`, `tenantId`, `role`, `email`; **no password hash** |
| XAUTH-13 | `POST /v1/auth/forgot-password` for a real account | 200; reset email queued; token stored hashed |
| XAUTH-14 | `forgot-password` for an unknown email | 200 with the **same** body — never reveal membership |
| XAUTH-15 | `reset-password` with the emailed token | 200; old password now 401, new password logs in |
| XAUTH-16 | Reuse the same reset token twice | Second attempt 400/401 — single use |
| XAUTH-17 | `reset-password` with a token from another tenant | 400/401 |
| XAUTH-18 | Login while the tenant is suspended (suspend it via the admin plane) | 401 `Tenant account is suspended` |

### 4.2 Role-based access (tenant plane)

Roles: `owner` > `manager` > `staff` > `viewer`. `requireManager` accepts owner
and manager only.

| ID | Endpoint | owner | manager | staff | viewer |
| --- | --- | --- | --- | --- | --- |
| XRBAC-01 | `POST /v1/products` (and category, variant, product `PATCH`) | 200/201 | 200/201 | **403** | **403** |
| XRBAC-02 | `GET /v1/products`, `GET /v1/orders`, `GET /v1/customers` | ✓ | ✓ | ✓ | ✓ |
| XRBAC-03 | `POST /v1/orders` (create draft) | ✓ | ✓ | ✓ | ✓ |
| XRBAC-04 | `POST /v1/orders/:id/confirm` and `/cancel` | ✓ | ✓ | **403** | **403** |
| XRBAC-05 | `POST /v1/orders/:id/process` and `/fulfil` | ✓ | ✓ | ✓ | ✓ |
| XRBAC-06 | `POST /v1/inventory/receive`, `/adjust` | ✓ | ✓ | **403** | **403** |
| XRBAC-07 | `POST/PATCH/DELETE /v1/locations` | ✓ | ✓ | **403** | **403** |
| XRBAC-08 | `POST /v1/staff/invite`, `PATCH`/`DELETE /v1/staff/:id` | ✓ | ✓ | **403** | **403** |
| XRBAC-09 | `GET /v1/settings/audit` | ✓ | ✓ | **403** | **403** |
| XRBAC-10 | `POST /v1/dispatch/configure` | ✓ | ✓ | **403** | **403** |
| XRBAC-11 | Shipping writes (`/zones`, `/methods`, `/rates`, `/conditions`, `/pickup-locations`) | ✓ | ✓ | ✓ | ✓ |

> XRBAC-11 is deliberately listed: the shipping module's `managerGuard` is
> `[requireAuth, resolveTenant]` only, so **`staff` and `viewer` can create and
> delete shipping zones, methods and rates**. Confirm the behaviour and raise it
> with the product owner if that is not intended — the name of the guard suggests
> it is not. See §7.

Two escalation checks that do not fit the grid:

- **XRBAC-12** — a `staff` or `manager` user invites someone with `"role": "owner"`.
  Expect 400: the invite enum is `manager | staff | viewer`, so a second owner
  cannot be minted through the staff API.
- **XRBAC-13** — a `manager` deactivates the owner via `DELETE /v1/staff/:id`.
  Expect a guard. If it succeeds, file it — a manager can then lock the owner out
  of their own business.

### 4.3 Plan feature gates

A blocked feature always answers **402** with `code: "FEATURE_GATED"`, never 403.

| Feature key | trial | entry | growth | enterprise | Endpoints to probe |
| --- | :---: | :---: | :---: | :---: | --- |
| `orders:create` | ✓ (max 20) | ✓ | ✓ | ✓ | all of `/v1/orders`, `POST /v1/payments/initiate` |
| `inventory:track` | ✓ | ✓ | ✓ | ✓ | `/v1/inventory`, `/receive`, `/adjust`, `/movements` |
| `inventory:alerts` | ✗ | ✓ | ✓ | ✓ | `GET /v1/inventory/low-stock` |
| `customers:manage` | ✓ (max 50) | ✓ | ✓ | ✓ | all of `/v1/customers` |
| `ledger:view` | ✓ | ✓ | ✓ | ✓ | all of `/v1/ledger` |
| `expenses:track` | ✗ | ✓ | ✓ | ✓ | all of `/v1/expenses` |
| `invoicing:generate` | ✗ | ✓ | ✓ | ✓ | all of `/v1/invoices` |
| `reporting:pl` | ✗ | ✓ | ✓ | ✓ | `/v1/reports/pl`, `/best-sellers`, `/pl/export` |
| `reporting:margin` | ✗ | ✓ | ✓ | ✓ | `/v1/reports/inventory-valuation` |
| `reporting:staff_sales` | ✗ | ✓ | ✓ | ✓ | `/v1/reports/staff-sales`, `/staff-sales/export` |
| `reporting:revenue_by_location` | ✗ | **✗** | ✓ | ✓ | `/v1/reports/revenue-by-location` |
| `staff:invite` | ✗ | ✓ (5 seats) | ✓ (20 seats) | ✓ (∞) | all of `/v1/staff` |
| `locations:manage` | ✗ | **✗** | ✓ | ✓ | all of `/v1/locations` |
| `whatsapp:ordering` | ✗ | ✗ | ✓ | ✓ | WhatsApp conversational flow |
| `logistics:dispatch` | ✗ | ✗ | ✓ | ✓ | all of `/v1/dispatch` |
| `shipping:manage` | ✓ | ✓ | ✓ | ✓ | shipping writes |
| `subscriptions:manage` | ✓ | ✓ | ✓ | ✓ | all of `/v1/subscriptions` |

| ID | Scenario | Expected |
| --- | --- | --- |
| XGATE-01 | Each ✗ cell above, called with a valid token of that plan | 402, `code: "FEATURE_GATED"`, message names the feature |
| XGATE-02 | Change plan via `PATCH /v1/platform/tenants/:id/plan`, immediately retry the gated call | New entitlement applies **on the very next request** — there is no cache, so any stale answer is a bug |
| XGATE-03 | Set the tenant's `subscriptionStatus` to `lapsed`, then call any gated endpoint | 402 on everything except `/v1/subscriptions/*` |
| XGATE-04 | Same lapsed tenant calls `GET /v1/subscriptions` and `POST /v1/subscriptions/initiate` | 200 — the merchant must always be able to pay their way back in |
| XGATE-05 | Trial tenant creates a 21st order | Limit enforced (or documented as not yet enforced — verify against `limit: 20`) |
| XGATE-06 | Trial tenant creates a 51st customer | As XGATE-05 against `limit: 50` |
| XGATE-07 | Entry tenant invites a 6th staff member | Seat limit enforced |
| XGATE-08 | Gate ordering: trial tenant calls `GET /v1/reports/pl` with **no** query params | 402 before 400 — an unentitled caller must not learn the schema |

### 4.4 Tenant isolation — the highest-severity suite

Each merchant's data is stored in its own isolated space. Any leak here is a release blocker.

| ID | Scenario | Expected |
| --- | --- | --- |
| XISO-01 | Tenant A's token requests tenant B's order/product/customer/invoice/expense id | 404 for every resource type (never 200, never 403) |
| XISO-02 | Tenant A creates an order referencing a `variantId` owned by tenant B | 400/404 — never a cross-schema read |
| XISO-03 | `GET /v1/products?search=` from A never returns a B SKU | Verified against the seed catalogue (`IP15P-…` vs the fashion SKUs) |
| XISO-04 | Same SKU string created in both tenants | Both succeed — uniqueness is per tenant |
| XISO-05 | Paystack webhook whose `metadata.schemaName` points at tenant B while `orderId` belongs to A | No cross-tenant write; nothing is marked paid |
| XISO-06 | Hand-craft a token with A's signature but B's `tid` | 401/404 — the tenant is re-read from the DB on every request |
| XISO-07 | Reports (`/pl`, `/best-sellers`, `/staff-sales`, `/inventory-valuation`) run for A | Totals reconcile with A's own orders only |
| XISO-08 | `GET /v1/settings/audit` from A | Contains no entry naming tenant B or B's staff |

### 4.5 Input validation and abuse

| ID | Scenario | Expected |
| --- | --- | --- |
| XVAL-01 | Extra property on any `.strict()` body (e.g. `planTier` on signup) | 400 — no privilege assignment through an unknown field |
| XVAL-02 | Wrong type (`"quantity": "two"`, `"priceKobo": "2500"`) | 400 — `coerceTypes` is off, strings are not silently cast |
| XVAL-03 | Decimal kobo (`1250.75`) | 400 |
| XVAL-04 | Negative money where `min(0)` applies | 400 |
| XVAL-05 | SQL in a text field: `'; DROP TABLE orders; --` as a product name | Stored and returned verbatim; tables intact |
| XVAL-06 | XSS in a text field: `<script>alert(1)</script>` | Stored verbatim, returned JSON-escaped, `content-type: application/json` |
| XVAL-07 | Path traversal in an id param: `../../etc/passwd` | 400/404 |
| XVAL-08 | 1 MB string in `note` | Rejected or safely truncated — never a 500 |
| XVAL-09 | Malformed JSON body | 400, not 500 |
| XVAL-10 | `limit=500` on any paginated platform endpoint | 400 — the cap is 100 |
| XVAL-11 | `page=0` or `page=-1` | 400 |
| XVAL-12 | Unicode/emoji in names, `+234` phone formats | Stored and echoed intact |

### 4.6 Rate limiting, health, observability

| ID | Scenario | Expected |
| --- | --- | --- |
| XOPS-01 | 250 requests inside a minute from one IP (`NODE_ENV≠test`) | 429 after ~200, body `{"success":false,"error":{"code":"RATE_LIMIT_EXCEEDED"}}` |
| XOPS-02 | Wait out the window and retry | Requests succeed again |
| XOPS-03 | `GET /health` with DB and Redis up | 200, `status: "ok"`, per-dependency checks |
| XOPS-04 | `/health` while a dependency is down (**dev-assisted** — ask the team to take Redis out in the QA environment) | `degraded` (200) or `error` (503), and ordinary CRUD still responds |
| XOPS-05 | `/health` while the database is down (**dev-assisted**) | 503, and API errors stay clean `INTERNAL_ERROR` responses with no stack traces |
| XOPS-06 | `GET /metrics` | Prometheus exposition format |
| XOPS-07 | Send `x-request-id: qa-trace-001` | Same id echoed in the response header and present in the server log line |
| XOPS-08 | Force a 500 | Response body is the generic `INTERNAL_ERROR` (no stack); the full error reaches the log and, if configured, Slack/Sentry |
| XOPS-09 | `GET /docs` | Served when `SWAGGER_ENABLED=true`; **must be off in production-like environments** |
| XOPS-10 | CORS preflight from an origin outside `CORS_ORIGINS` | No permissive `access-control-allow-origin` echoed back |

---

## 5. Feature test matrix

Payload keys referenced below (`signup_valid`, `order_create_multi_line_with_discount`, …)
live in `docs/qa/payloads/`. Unless stated otherwise every request carries
`Authorization: Bearer <OWNER>` and `Content-Type: application/json`.

### 5.1 Tenant signup and provisioning — `POST /v1/tenants` (public)

| ID | Scenario | Payload | Expected |
| --- | --- | --- | --- |
| TEN-01 | Happy path signup | `signup_valid` | 201 with the new merchant's identifiers; the merchant starts on the **trial** plan with a default "Main Location" and a full chart of accounts (verify via `GET /v1/locations` and `GET /v1/ledger/accounts` after logging in) |
| TEN-02 | Owner can log in straight away | — | 200 from `/v1/auth/login` with the signup credentials, role `owner` |
| TEN-03 | Duplicate slug | `signup_duplicate_slug` | 409 `CONFLICT` |
| TEN-04 | Slug with spaces/uppercase | `signup_invalid_slug` | 400 |
| TEN-05 | Password under 8 chars | `signup_short_password` | 400 |
| TEN-06 | Self-assigning a plan | `signup_unknown_field` | 400 — strict schema; tenant must **not** be created |
| TEN-07 | Invalid `businessEmail` | any body with `businessEmail: "nope"` | 400 |
| TEN-08 | Signup is unauthenticated | no `Authorization` header | 201 — it is a public route by design |
| TEN-09 | Partial-failure cleanup | kill the DB mid-provision, or provoke an error after the schema is created | No half-built tenant left behind: either the tenant row and schema both exist, or neither does |

### 5.2 Products, categories and variants — `/v1/products`

| ID | Scenario | Payload | Expected |
| --- | --- | --- | --- |
| PRD-01 | Create category | `category_create` | 201 |
| PRD-02 | Nested category | `category_create_child` | 201, `parentId` set |
| PRD-03 | Empty category name | `category_create_empty_name` | 400 |
| PRD-04 | Create product with category and image | `product_create` | 201 |
| PRD-05 | Create product, name only | `product_create_minimal` | 201 |
| PRD-06 | List with pagination and filters | `?page=1&limit=20&isActive=true&search=pixel` | 200, pagination block correct, filters honoured |
| PRD-07 | Get one product | `GET /v1/products/:id` | 200 including its variants |
| PRD-08 | Unknown product id | random UUID | 404 |
| PRD-09 | Update product, clear a nullable field | `product_update` | 200, `description` now null |
| PRD-10 | Deactivate | `product_deactivate` | 200; excluded from `?isActive=true` |
| PRD-11 | Price sent on the product body | `product_update_unknown_field` | 400 — price lives on the variant |
| PRD-12 | Add variant | `variant_create` | 201; `priceKobo` and `taxRateBps` stored exactly |
| PRD-13 | Duplicate SKU within the tenant | `variant_create_duplicate_sku` | 409 |
| PRD-14 | Same SKU in the other tenant | `variant_create` on tenant B | 201 — uniqueness is per tenant |
| PRD-15 | Negative price | `variant_create_negative_price` | 400 |
| PRD-16 | Decimal price | `variant_create_decimal_price` | 400 |
| PRD-17 | `taxRateBps` above 10000 | `{"taxRateBps": 10001, …}` | 400 |
| PRD-18 | Update variant price | `variant_update` | 200; **orders already placed keep their historic `unitPriceKobo`** |
| PRD-19 | Variant under the wrong product | `/v1/products/<other>/variants/<vid>` | 404 |
| PRD-20 | Staff/viewer attempts any write | any | 403 |

### 5.3 Inventory — `/v1/inventory`

| ID | Scenario | Payload | Expected |
| --- | --- | --- | --- |
| INV-01 | Receive stock | `inventory_receive` | 201; `quantityOnHand` = 25; a `receive` stock movement is recorded |
| INV-02 | Receive zero | `inventory_receive_zero` | 400 `Receive quantity must be greater than zero` |
| INV-03 | Receive against an unknown variant or location | random UUIDs | 404 |
| INV-04 | Write-off | `inventory_adjust_write_off` | 201; quantity 25 → 22; movement recorded with the note |
| INV-05 | Positive correction | `inventory_adjust_topup` | 201; 22 → 27 |
| INV-06 | Adjustment below zero | `inventory_adjust_below_zero` | 400 — stock must never go negative |
| INV-07 | List, filtered by location and variant | `?locationId=…`, `?variantId=…` | 200 with SKU, variant name and location name joined in |
| INV-08 | Movement audit trail | `/movements?variantId=…&from=…&to=…` | 200, paginated, chronological, every receive/adjust/sale present |
| INV-09 | Low-stock list | `/low-stock?locationId=…` | 200 on entry+; only variants at or below `lowStockThreshold`; **402 on trial** |
| INV-10 | Stock deducted on order confirm | confirm a 2-unit order | quantity drops by exactly 2, movement type reflects the sale |
| INV-11 | Stock restored on cancel | cancel a confirmed order | quantity restored; a compensating movement is written (not a deleted row) |
| INV-12 | Concurrent confirm of the last unit | two confirms in parallel for stock = 1 | Exactly one succeeds; the other 400s; quantity never goes negative |
| INV-13 | Staff/viewer receives or adjusts | any | 403 |

### 5.4 Locations — `/v1/locations` (growth+ only)

| ID | Scenario | Expected |
| --- | --- | --- |
| LOC-01 | Growth tenant lists locations | 200, includes the auto-created "Main Location" |
| LOC-02 | Entry or trial tenant calls any location route | 402 |
| LOC-03 | Create (`location_create`) | 201 |
| LOC-04 | Create with `isDefault: true` (`location_update`) | 200; the previous default is demoted — exactly one default at all times |
| LOC-05 | Update name/address | 200 |
| LOC-06 | `DELETE /v1/locations/:id` | 200, soft deactivation (`isActive: false`), row retained for history |
| LOC-07 | Deactivate the location holding stock, then read inventory | Historic inventory and movements still resolve |
| LOC-08 | Deactivate the only/default location | Guard expected; if it succeeds, order confirmation may break — file it |
| LOC-09 | Staff/viewer write | 403 |

### 5.5 Customers — `/v1/customers`

| ID | Scenario | Payload | Expected |
| --- | --- | --- | --- |
| CUS-01 | Create full record | `customer_create` | 201, consent fields stored |
| CUS-02 | Create with first name only | `customer_create_minimal` | 201 |
| CUS-03 | Invalid email | `customer_create_bad_email` | 400 |
| CUS-04 | Invalid consent source | `customer_create_bad_consent_source` | 400 — enum is `pos_signup｜whatsapp_chat｜web_checkout｜manual` |
| CUS-05 | Search by name, phone, email | `?search=chidinma` | 200, relevant matches only |
| CUS-06 | Pagination | `?page=2&limit=5` | 200, no overlap with page 1 |
| CUS-07 | Update and null out a field | `customer_update` | 200, `email` cleared |
| CUS-08 | Cross-tenant id | B's customer id with A's token | 404 |
| CUS-09 | Trial tenant beyond 50 customers | Limit enforced per `customers:manage` |
| CUS-10 | Customer with orders is still readable after updates | Order history intact |

### 5.6 Orders — `/v1/orders`

Order lifecycle:

```
draft ──► confirmed ──► processing ──► fulfilled ──► refunded
  │           │             │   └────► dispatched ──► fulfilled
  └──────────►└─────────────┴────────► cancelled          │
                                  (dispatched ──► cancelled)
```
`cancelled` and `refunded` are terminal.

| ID | Scenario | Payload | Expected |
| --- | --- | --- | --- |
| ORD-01 | Create single-line draft | `order_create_single_line` | 201, status `draft`, order number assigned, no stock movement yet |
| ORD-02 | Multi-line with line and order discounts and tax | `order_create_multi_line_with_discount` | 201; verify by hand: subtotal = Σ(qty × unitPrice − lineDiscount); total = subtotal − orderDiscount + tax; no rounding drift |
| ORD-03 | No items | `order_create_no_items` | 400 |
| ORD-04 | Quantity 0 | `order_create_zero_quantity` | 400 |
| ORD-05 | Unknown variant | `order_create_unknown_variant` | 404/400 |
| ORD-06 | Invalid channel | `order_create_bad_channel` | 400 (`website｜pos｜whatsapp｜manual`) |
| ORD-07 | Quantity beyond stock, at draft | `order_create_oversell` | Draft may be allowed; **confirm must fail** |
| ORD-08 | Confirm | `POST /:id/confirm` | 200, status `confirmed`, stock deducted, ledger entries posted (DR A/R or Cash, CR Revenue; DR COGS, CR Inventory) and balanced |
| ORD-09 | Confirm an order with no location | order created without `locationId` | 400 `Order must have a location to confirm` |
| ORD-10 | Confirm twice | repeat ORD-08 | Second call 400 — no double stock deduction, no duplicate ledger entry |
| ORD-11 | draft → fulfilled directly | `POST /:id/fulfil` on a draft | 400 |
| ORD-12 | confirmed → processing → fulfilled | in order | 200 each |
| ORD-13 | Cancel a draft | `POST /:id/cancel` | 200; no stock change (none was deducted) |
| ORD-14 | Cancel a confirmed order | | 200; stock restored; reversing ledger entries posted |
| ORD-15 | Cancel a fulfilled order | | 400 — terminal |
| ORD-16 | Any transition out of `cancelled` / `refunded` | | 400 |
| ORD-17 | `staff` confirms or cancels | | 403 |
| ORD-18 | List filters | `?status=confirmed&channel=pos&from=…&to=…` | 200, every filter honoured, pagination correct |
| ORD-19 | `from` later than `to` | | 400 or empty result — never a 500 |
| ORD-20 | Get one order | `GET /:id` | 200 with line items, customer, location, totals |
| ORD-21 | Order placed against a now-deactivated variant | | Still readable with its historic price |
| ORD-22 | Trial tenant's 21st order | | Limit per `orders:create` |

### 5.7 Payments and gateway webhooks — `/v1/payments`

| ID | Scenario | Payload | Expected |
| --- | --- | --- | --- |
| PAY-01 | Initiate for a confirmed order | `initiate_payment` | 200 with `authorizationUrl` + `reference`; a `payments` row in `initiated`; reference format `bpos-<uuid>` |
| PAY-02 | Unknown order | `initiate_payment_unknown_order` | 404 |
| PAY-03 | Invalid email | `initiate_payment_bad_email` | 400 |
| PAY-04 | Paystack unreachable / bad key | break `PAYSTACK_SECRET_KEY` | 502 `EXTERNAL_SERVICE_ERROR`, no orphan payment row left in a wrong state |
| PAY-05 | `charge.success` with a **valid** signature | `paystack_charge_success` (signed, see `_signing_commands`) | 200; payment `paid`; order marked paid; ledger entries posted and balanced |
| PAY-06 | Same event delivered twice | replay PAY-05 | Second delivery is a no-op: one payment row, one ledger posting (idempotency by reference) |
| PAY-07 | **Invalid** signature | tamper one character | 200 `{received:true}` **and nothing changes** — verify in the DB, not by status code |
| PAY-08 | Missing `metadata.schemaName` | `paystack_missing_schema_name` | 200, no-op |
| PAY-09 | `schemaName` of tenant B, `orderId` of tenant A | hand-edited | No cross-tenant write |
| PAY-10 | `charge.failed` | `paystack_charge_failed` | Payment marked failed; order not marked paid; no revenue posted |
| PAY-11 | Amount mismatch (webhook amount ≠ order total) | edit `data.amount` | Discrepancy detected or logged — must not silently mark a ₦1 payment as settling a ₦1.25m order |
| PAY-12 | Flutterwave `charge.completed` with a valid `verif-hash` | `flutterwave_charge_completed` | Processed; note the naira→kobo conversion (`amount × 100`) is exact |
| PAY-13 | Flutterwave with a wrong `verif-hash` | | 200, no-op |
| PAY-14 | Malformed JSON to either webhook | `--data-raw '{'` | 400/200, never a 500 or a crash |
| PAY-15 | Webhook while the tenant is suspended | suspend first | No processing, no crash |

### 5.8 Invoicing — `/v1/invoices` (entry+)

| ID | Scenario | Expected |
| --- | --- | --- |
| INVC-01 | Generate for an order (`invoice_create`) | 201; invoice number assigned; PDF rendered and stored; URL returned |
| INVC-02 | Fetch the PDF URL | Valid PDF; merchant name, line items, totals in kobo→naira format, and the invoice number all correct |
| INVC-03 | Email delivery enabled in this environment | The invoice email reaches the customer address |
| INVC-04 | Email delivery **not** enabled | Still 201, PDF still produced, delivery silently skipped — **not** a 500. Confirm which of the two applies here (§2.1) |
| INVC-05 | Unknown order (`invoice_create_unknown_order`) | 404 |
| INVC-06 | Generate twice for the same order | Idempotent, or a second invoice with a distinct number — define the expectation and hold to it |
| INVC-07 | Invoice for a draft order | Rejected or clearly marked unpaid |
| INVC-08 | List (`?orderId=…`) and get by id | 200, includes order details and line items |
| INVC-09 | Trial tenant | 402 on every route |
| INVC-10 | Cross-tenant invoice id | 404 |

### 5.9 Ledger — `/v1/ledger`

| ID | Scenario | Expected |
| --- | --- | --- |
| LED-01 | `GET /accounts` | 200; the standard chart: 1000 Cash, 1100 A/R, 2000 A/P, 3000 Owner Equity, 4000 Revenue, 5000 COGS (+ any others), `isSystem: true` |
| LED-02 | `GET /balances` | 200; derived from journal lines, not a stored column |
| LED-03 | **Σ debits = Σ credits** across every entry | Always true. Any `LEDGER_IMBALANCE` is a blocker |
| LED-04 | `GET /wallet` | 200, matches the Cash account balance |
| LED-05 | `GET /entries?referenceType=order&referenceId=…` | 200, the entries for that order only |
| LED-06 | Confirm an order, re-read balances | Revenue and COGS move by exactly the expected kobo |
| LED-07 | Record an expense, re-read balances | DR the expense account, CR Cash |
| LED-08 | Cancel a confirmed order | Reversing entries appear; **no row is deleted or edited** — the ledger is append-only |
| LED-09 | Pagination on `/entries` | Correct and stable ordering |
| LED-10 | There is no write endpoint | Confirm `POST /v1/ledger/*` does not exist (404/405) |

### 5.10 Expenses — `/v1/expenses` (entry+)

| ID | Scenario | Payload | Expected |
| --- | --- | --- | --- |
| EXP-01 | Record with a receipt | `expense_create` | 201; journal entry DR OpEx / CR Cash |
| EXP-02 | Minimal record | `expense_create_minimal` | 201 |
| EXP-03 | Invalid category | `expense_create_bad_category` | 400 (`rent｜utilities｜salaries｜marketing｜supplies｜transport｜other`) |
| EXP-04 | Zero amount | `expense_create_zero_amount` | 400 (`min(1)`) |
| EXP-05 | Non-ISO date | `expense_create_bad_date` | 400 |
| EXP-06 | Filters | `?category=utilities&locationId=…&from=…&to=…` | 200, all filters honoured |
| EXP-07 | Get by id / cross-tenant id | | 200 / 404 |
| EXP-08 | `receiptUrl` from `POST /v1/uploads/image` | | Round-trips and resolves |
| EXP-09 | Expense appears in the P&L for its period | | Included in the correct month, excluded from adjacent ones |
| EXP-10 | Trial tenant | | 402 |

### 5.11 Reporting — `/v1/reports`

| ID | Scenario | Expected |
| --- | --- | --- |
| REP-01 | `/pl?from&to` | 200; revenue, COGS, gross margin, expenses, net — reconcile by hand against the orders and expenses you created in the same window |
| REP-02 | `/pl` with a missing or non-ISO date | 400 (entitled plans) |
| REP-03 | `/pl` over an empty range | 200 with zeros, not a 500 |
| REP-04 | `/best-sellers?limit=5` | 200, ranked by quantity sold, respects `limit` |
| REP-05 | `/revenue-by-location` on growth | 200; per-location revenue sums to the P&L total |
| REP-06 | `/revenue-by-location` on **entry** | **402** — this is the one report entry does not get |
| REP-07 | `/staff-sales` | 200; attribution matches each order's `assignedTo` |
| REP-08 | `/inventory-valuation?format=json` | 200, Σ(quantity × cost) per variant per location |
| REP-09 | `/inventory-valuation?format=csv` | `text/csv` |
| REP-10 | `/pl/export`, `/staff-sales/export` | `text/csv` + `Content-Disposition: attachment; filename="…"`; opens cleanly in Excel/Sheets; headers present |
| REP-11 | CSV injection: a product named `=cmd|'/c calc'!A0` | Escaped/quoted in the export, not emitted as a live formula |
| REP-12 | Cancelled and refunded orders | Excluded from revenue |
| REP-13 | Reports for a tenant with no data | Zeros, not a 500 |
| REP-14 | Trial tenant, every report | 402 |

### 5.12 Staff — `/v1/staff` (entry+)

| ID | Scenario | Payload | Expected |
| --- | --- | --- | --- |
| STF-01 | Invite a manager | `staff_invite_manager` | 201; the invitee can log in with `temporaryPassword` on the tenant slug |
| STF-02 | Invite staff and viewer | `staff_invite_staff`, `staff_invite_viewer` | 201 each; roles behave per §4.2 |
| STF-03 | Duplicate email | `staff_invite_duplicate_email` | 409 |
| STF-04 | `role: "owner"` | `staff_invite_invalid_role` | 400 |
| STF-05 | Temporary password under 8 chars | `staff_invite_weak_password` | 400 |
| STF-06 | Promote to manager | `staff_update_role` | 200; the new permission set applies on the **next** request (re-login if the role is carried in the token) |
| STF-07 | Update details, clear `locationId` | `staff_update_details` | 200 |
| STF-08 | `DELETE /v1/staff/:id` | | 200, soft deactivation; that user's token/login now fails; their historic orders remain attributed |
| STF-09 | Reactivate | `staff_reactivate` | 200, can log in again |
| STF-10 | Seat limit: entry tenant invites a 6th | | Limit enforced (`staff:limit` = 5) |
| STF-11 | Trial tenant calls any staff route, including `GET` | | 402 — `staff:invite` is off on trial |
| STF-12 | Staff/viewer invites or deactivates | | 403 |
| STF-13 | Deactivate yourself | | Guard expected; a tenant must never be left with no active owner |
| STF-14 | Cross-tenant staff id | | 404 |

### 5.13 Subscriptions — `/v1/subscriptions`

State machine: `trial → active | cancelled`; `active → grace | cancelled`;
`grace → active | lapsed | cancelled`; `lapsed → active | cancelled`; `cancelled` terminal.

| ID | Scenario | Payload | Expected |
| --- | --- | --- | --- |
| SUB-01 | `GET /v1/subscriptions` | — | 200, current plan, status, period start/end |
| SUB-02 | Initiate entry | `subscription_initiate_entry` | 200, Paystack URL, reference `bpos-sub-…`, amount **350000 kobo** (₦3,500) |
| SUB-03 | Initiate growth | `subscription_initiate_growth` | 200, amount **1000000 kobo** (₦10,000) |
| SUB-04 | Initiate enterprise | `subscription_initiate_enterprise` | 400 — enterprise is manually billed |
| SUB-05 | Initiate trial | `subscription_initiate_trial` | 400 — not a purchasable tier |
| SUB-06 | Subscription webhook success | `paystack_subscription_success` (signed) | Status `active`, plan applied, period end ≈ +30 days, authorization code stored |
| SUB-07 | Entitlements follow the upgrade | re-probe §4.3 gates | Newly included features return 200 immediately |
| SUB-08 | `POST /v1/subscriptions/cancel` | — | 200, status `cancelled`; access until period end (confirm the intended behaviour) |
| SUB-09 | Cancel an already-cancelled subscription | repeat SUB-08 | 400 — terminal state |
| SUB-10 | A merchant whose subscription has **lapsed** calls any gated feature (**dev-assisted** — ask for a merchant in that state) | — | 402 on everything except `/v1/subscriptions/*` |
| SUB-11 | Lapsed tenant pays again | SUB-02 then SUB-06 | Back to `active`; gates reopen |
| SUB-12 | Invalid transition (`trial → lapsed` directly) | DB/state probe | `VALIDATION_ERROR` |

### 5.14 Onboarding checklist — `GET /v1/onboarding`

| ID | Scenario | Expected |
| --- | --- | --- |
| ONB-01 | Brand-new tenant | 200; `percentComplete` low; pending steps list |
| ONB-02 | After inviting a staff member | `staff_invited` moves to completed (it needs ≥ 2 users: owner + 1) |
| ONB-03 | After adding a location | `location_created` completed |
| ONB-04 | After adding a product | `product_created` completed |
| ONB-05 | After a **paid** payment lands | `payment_received` completed — an `initiated` payment must not count |
| ONB-06 | After the subscription goes active | `subscription_active` completed |
| ONB-07 | All steps done | `isComplete: true`, `percentComplete: 100`, empty pending list |
| ONB-08 | Trial tenant that cannot create a location | Verify the checklist is still achievable — a step the plan forbids is a UX bug worth raising |

### 5.15 Activity trail — `GET /v1/settings/audit`

| ID | Scenario | Expected |
| --- | --- | --- |
| SET-01 | Owner or manager reads the trail | 200, paginated (default 50, max 100) |
| SET-02 | Staff or viewer reads it | 403 |
| SET-03 | `?actorType=platform` | Only BPOS-staff access entries, each carrying the **reason** the agent gave |
| SET-04 | `?actorType=user` / `system` | Filters correctly |
| SET-05 | `?action=order.confirm` | Filters by action |
| SET-06 | `?actorType=robot` | 400 |
| SET-07 | After a support grant is opened (§5.20) | The merchant sees that access, with the agent's reason, in their own trail |
| SET-08 | Cross-tenant leakage | No entry from another tenant, ever |
| SET-09 | Trail is append-only | No API path edits or deletes an entry |

### 5.16 Uploads — `POST /v1/uploads/image`

| ID | Scenario | Expected |
| --- | --- | --- |
| UPL-01 | JPEG under the cap | 201, public URL; the object is compressed (compare stored vs source size) |
| UPL-02 | PNG and WebP | 201 |
| UPL-03 | GIF, PDF or SVG | 400 `Unsupported image type` |
| UPL-04 | A `.jpg` file that is actually a PDF (content-type spoof) | Rejected — the check must not trust the extension alone |
| UPL-05 | File over the configured size cap (10 MiB by default — see §2.1) | 400 `File too large. Maximum size: …` |
| UPL-06 | No file part | 400 `No file provided` |
| UPL-07 | No token | 401 |
| UPL-08 | Returned URL used as `imageUrl` / `receiptUrl` | Round-trips through products and expenses |
| UPL-09 | Object key is tenant-scoped | Key starts with the tenant schema name — tenants never share a prefix |
| UPL-10 | R2 misconfigured | 502, not 500 |

### 5.17 Shipping — `/v1/shipping`

| ID | Scenario | Payload | Expected |
| --- | --- | --- | --- |
| SHP-01 | `GET /states` | — | 200, canonical 36 states + FCT |
| SHP-02 | Create zone | `zone_create`, `zone_create_multi` | 201 |
| SHP-03 | Zone with no states | `zone_create_empty_states` | 400 |
| SHP-04 | Zone with an invalid state | `zone_create_invalid_state` | 400 — must be validated against `/states` |
| SHP-05 | Update, list, delete zones | `zone_update` | 200 each; deleting a zone still referenced by a rate is either blocked or cascades cleanly |
| SHP-06 | Create each method type | `method_flat_rate` … `method_pickup` | 201 each |
| SHP-07 | Invalid method type | `method_bad_type` | 400 |
| SHP-08 | Add zone / value / weight rates | `rate_zone`, `rate_value_tier_low/high`, `rate_weight_tier` | 201 each |
| SHP-09 | Negative fee | `rate_negative_fee` | 400 |
| SHP-10 | Add a rate to a `flat_rate` or `free` method | `rate_zone` on that method | Rejected — rates only apply to zone/value/weight methods |
| SHP-11 | Free-shipping conditions | `condition_always`, `condition_min_order_value`, `condition_product`, `condition_category`, `condition_promo_code` | 201 each |
| SHP-12 | Invalid condition type | `condition_bad_type` | 400 |
| SHP-13 | Pick-up locations, branch and third-party | `pickup_create_branch`, `pickup_create_third_party` | 201 each |
| SHP-14 | **Checkout calculator** — order above the free threshold | `?orderValueKobo=7500000&destinationState=Lagos` | Free method offered at 0 kobo; options sorted cheapest-first |
| SHP-15 | Order below the free threshold | `?orderValueKobo=1000000&destinationState=Lagos` | Free method absent; flat and zone rates returned with correct fees |
| SHP-16 | Destination in a zone with no rate row | a state in no zone | Zone method omitted rather than returned at 0 |
| SHP-17 | Weight tiers | `&totalWeightKg=2.5` vs `=50` | Correct tier selected for each |
| SHP-18 | Promo code | `&promoCode=QAFREESHIP` vs a wrong code | Free method appears only for the right code |
| SHP-19 | `automated` methods | any `/available` call | Always excluded — those come from `/v1/dispatch/quote` |
| SHP-20 | Deactivated method | `method_deactivate` then `/available` | Excluded |
| SHP-21 | Plan gate | trial/entry/growth | `shipping:manage` is on for **all** plans — a 402 here is a bug |
| SHP-22 | Role check | staff/viewer write | See XRBAC-11 and §7 — currently permitted |
| SHP-23 | "Public" endpoints without a token (`/available`, `/pickup-locations`) | See §7 — currently 500, a known defect |

### 5.18 Dispatch / logistics — `/v1/dispatch` (growth+)

| ID | Scenario | Payload | Expected |
| --- | --- | --- | --- |
| DSP-01 | Configure a provider | `dispatch_configure` | 200; key stored **encrypted** |
| DSP-02 | `GET /config` | — | 200 with provider and status; the API key is **never** returned, in full or in part |
| DSP-03 | Short API key / webhook secret | `dispatch_configure_short_key` | 400 |
| DSP-04 | Unsupported provider | `dispatch_configure_bad_provider` | 400 (`traka｜sendstack｜gig｜dhl｜kwik｜generic`) |
| DSP-05 | Quote | `dispatch_quote` | 200 with a fee, or 502 if the provider is unreachable — never a 500 |
| DSP-06 | Zero weight | `dispatch_quote_zero_weight` | 400 (`min 0.1`) |
| DSP-07 | Dispatch an order | `dispatch_order` on a `processing` order | 200; order moves to `dispatched`; tracking reference stored |
| DSP-08 | Dispatch a `draft` order | | 400 — invalid transition |
| DSP-09 | Track | `GET /:orderId/track` | 200 with live status; unknown order 404 |
| DSP-10 | Dispatch before configuring a provider | fresh tenant | 400/404 with a clear message |
| DSP-11 | Entry or trial tenant | any dispatch route | 402 |
| DSP-12 | Staff/viewer calls `/configure` | | 403 |
| DSP-13 | Provider returns 500/timeout | point `baseUrl` at a dead host | 502 `EXTERNAL_SERVICE_ERROR`; the order is not left in a bogus state |

### 5.19 WhatsApp commerce — `/v1/whatsapp` (growth+ for ordering)

| ID | Scenario | Payload | Expected |
| --- | --- | --- | --- |
| WA-01 | Webhook verification, correct token | `_webhook_verify.ok` | 200, body is the challenge **verbatim** |
| WA-02 | Wrong verify token | `_webhook_verify.bad_token` | 403 |
| WA-03 | Missing query params | `_webhook_verify.missing_param` | 400 |
| WA-04 | Register a phone number id | `setup` | 200; inbound messages now route to this tenant |
| WA-05 | Register an id already owned by another tenant | same `setup` on tenant B | Rejected — one `phone_number_id`, one tenant |
| WA-06 | Inbound "hi" with a **valid** signature | `inbound_text_greeting` | 200; greeting + category list sent (check the outbound call or its log) |
| WA-07 | Inbound with an **invalid** signature | tamper the header | 200 `{success:true}` and **nothing processed** — verify no session and no outbound message |
| WA-08 | Unregistered `phone_number_id` | `inbound_unregistered_phone_number_id` | 200, silently ignored |
| WA-09 | `object` is not `whatsapp_business_account` | `inbound_wrong_object` | 200, ignored |
| WA-10 | Delivery-status callback with no `messages` | `inbound_status_update_no_messages` | 200, ignored, no crash |
| WA-11 | Browse → select category → select variant | `inbound_interactive_list_reply` twice | Session advances through `greeting → browsing → products → cart` |
| WA-12 | "cart" from any state | `inbound_text_cart` | Cart summary returned |
| WA-13 | "menu" / "hi" / "0" | any | Session resets to greeting |
| WA-14 | Complete checkout (name, then address) | text messages in sequence | A customer is created (`consentSource: whatsapp_chat`) and a draft order appears in `GET /v1/orders?channel=whatsapp` |
| WA-15 | Checkout produces a payment link | | Paystack URL returned in chat; the reference matches a `payments` row |
| WA-16 | Session store unavailable mid-conversation (**dev-assisted**) | — | Graceful degradation, no 500 storm |
| WA-17 | Session expiry | wait out the TTL, send a message | Flow restarts at the greeting, no stale cart |
| WA-18 | Entry-plan tenant | inbound message | `whatsapp:ordering` denied |
| WA-19 | Malformed JSON body | `--data-raw '{'` | 400/200, never a 500 |

### 5.20 Platform (internal admin) plane — `/v1/platform`

**Mount check first:** the admin plane can be switched off entirely, and when it
is, every route below returns **404** rather than 401. So a blanket 404 across
`/v1/platform/*` means the plane is disabled in this environment — check with the
dev team (§2.1) before filing it as a routing bug.

#### 5.20.1 Platform authentication and MFA

| ID | Scenario | Payload | Expected |
| --- | --- | --- | --- |
| PF-00 | Any platform route in an environment where the plane is disabled (**dev-assisted**, verify once) | — | 404 everywhere — the plane is absent, never served behind a default key |
| PF-01 | `support` logs in with a password | `login_support` | 200, access + refresh token, user profile |
| PF-02 | `admin` logs in **without** `totpCode` | `login_admin_without_mfa` | 401 `MFA code required`, or the enrolment prompt if not yet enrolled |
| PF-03 | `admin` logs in with a valid TOTP | `login_admin_with_mfa` | 200 |
| PF-04 | Reuse the **same** TOTP code immediately | repeat PF-03 | 401 — codes are single-use within their window |
| PF-05 | Wrong password | `login_bad_password` | 401 with the same message and timing as PF-06 |
| PF-06 | Unknown account | `login_unknown_account` | 401, indistinguishable from PF-05 |
| PF-07 | 5-digit TOTP | `login_bad_totp_format` | 400 |
| PF-08 | `POST /auth/mfa/setup` | — | 200, secret + otpauth URI; the stored secret is AES-256-GCM encrypted (check the DB column) |
| PF-09 | `POST /auth/mfa/verify` with a good code | `mfa_verify` | 200; `mfaEnabledAt` set |
| PF-10 | `mfa/verify` with a wrong code | `{"code":"000000"}` | 401/400; MFA stays un-enrolled |
| PF-11 | `GET /auth/me` | — | 200 `{platformUserId, email, role}` |
| PF-12 | `POST /auth/refresh` | `refresh` | 200, new access token |
| PF-13 | `POST /auth/logout`, then refresh again | `logout` | First 200, second 401 |
| PF-14 | **Tenant token** on any platform route | merchant `OWNER` token | 401 — separate secret, `aud: platform`, `type: access` |
| PF-15 | **Platform token** on a merchant route (`GET /v1/orders`) | `PF_SUPPORT` | 401 — the reverse direction matters just as much |
| PF-16 | Deactivate a platform user while their access token is still valid | via PF users API | Their **next** request is 401 — the account is re-read every request |
| PF-17 | Platform session lifetime (8 hours by default — shorter than a merchant's) | — | An expired refresh token is rejected |

#### 5.20.2 Permission matrix

| Permission | read_only | support | admin | super_admin |
| --- | :---: | :---: | :---: | :---: |
| `tenants:read`, `audit:read`, `analytics:read`, `billing:read` | ✓ | ✓ | ✓ | ✓ |
| `support:grant_read` / `grant_write` / `resend_receipt` / `retry_webhook` / `unlock_account` / `reset_password` | ✗ | ✓ | ✓ | ✓ |
| `tenants:create`, `tenants:suspend`, `tenants:change_plan`, `platform_users:read` | ✗ | ✗ | ✓ | ✓ |
| `tenants:delete`, `tenants:override_features`, `platform_users:manage`, `billing:refund` | ✗ | ✗ | ✗ | ✓ |

| ID | Scenario | Expected |
| --- | --- | --- |
| PFP-01 | Every ✗ cell, called with a token of that role | 403, message names the required permission and the caller's role |
| PFP-02 | Every ✓ cell | 200/201 |
| PFP-03 | `read_only` attempts any write anywhere on the plane | 403 |
| PFP-04 | `support` calls `POST /v1/platform/users` | 403 — creating staff is `super_admin` only |
| PFP-05 | An unauthorised caller sends a **deliberately invalid body** to a permission-gated route | 401/403 **before** any 400 — the guards run `onRequest`, so an unauthorised caller must not be able to probe the schema |

#### 5.20.3 Tenant administration — `/v1/platform/tenants`

| ID | Scenario | Payload | Expected |
| --- | --- | --- | --- |
| PFT-01 | List with filters | `?search=<part of a merchant name>&planTier=growth&isActive=true&page=1&limit=20` | 200; `data.items` + nested `data.pagination` |
| PFT-02 | `limit=500` | `tenants_list_limit_over_cap` | 400 |
| PFT-03 | Get one tenant | `GET /:id` | 200 with the tenant record |
| PFT-04 | Provision on a merchant's behalf | `tenant_create` | 201; identical result to public signup, plus an audit entry with the reason |
| PFT-05 | Missing reason | `tenant_create_no_reason` | 400 |
| PFT-06 | Reason under 10 chars | `tenant_create_short_reason` | 400 |
| PFT-07 | Suspend | `tenant_suspend` | 200; that tenant's users can no longer log in (XAUTH-18) |
| PFT-08 | Reactivate | `tenant_reactivate` | 200; logins work again |
| PFT-09 | Change plan up | `tenant_change_plan_growth` | 200; gates open on the merchant's **next** request |
| PFT-10 | Change plan down | `tenant_change_plan_trial` | 200; gates close immediately; existing data is not destroyed |
| PFT-11 | Invalid tier | `tenant_change_plan_invalid` | 400 |
| PFT-12 | Every mutation writes an audit row | check `/v1/platform/audit` | Actor, action, target, reason, IP, user agent, request id all present |
| PFT-13 | `support` or `read_only` attempts any of PFT-04..11 | | 403 |
| PFT-14 | Merchant PII in list/detail responses | | Email and phone are returned in full today — confirm against the current product decision before signing off |

#### 5.20.4 Platform staff administration — `/v1/platform/users` (super_admin)

| ID | Scenario | Payload | Expected |
| --- | --- | --- | --- |
| PFU-01 | List and filter | `?role=support&isActive=true` | 200; **no password hashes, no MFA secrets** in the payload |
| PFU-02 | Create a support account | `platform_user_create_support` | 201; the account can log in with the temporary password |
| PFU-03 | Password under 12 chars | `platform_user_create_short_password` | 400 |
| PFU-04 | A merchant role on the platform plane | `platform_user_create_bad_role` | 400 |
| PFU-05 | Duplicate email | repeat PFU-02 | 409 |
| PFU-06 | Promote to admin | `platform_user_update_role` | 200; MFA now required at their next login |
| PFU-07 | Deactivate | `platform_user_deactivate` | 200; their live token stops working on the next request (PF-16) |
| PFU-08 | Update with a reason but no fields | `platform_user_update_no_fields` | 400 `Provide at least one field to update` |
| PFU-09 | Demote or deactivate the **last active `super_admin`** | on the only one | 400 `Cannot remove the last active super_admin` |
| PFU-10 | Deactivate your own account | self id | Blocked |
| PFU-11 | Reset a staff password | `platform_user_reset_password` | 200; the old password fails, the new one works |
| PFU-12 | `admin` (not super) calls create/update/delete | | 403 (`platform_users:read` only) |
| PFU-13 | Every mutation is audited with its reason | | Present in `/v1/platform/audit` |

#### 5.20.5 Support tooling and access grants — `/v1/platform/support`

The rule under test: **holding a platform identity grants no access to tenant
data.** Every reach into a tenant needs an explicit, time-boxed, reason-carrying
grant, and the merchant can see it.

| ID | Scenario | Payload | Expected |
| --- | --- | --- | --- |
| PFS-01 | Read a tenant's orders **with no grant** | `GET /support/tenants/:tenantId/orders` | 403 — this is the core control |
| PFS-02 | Open a read grant | `grant_open_read` | 201; expiry ≤ 24h; audit row written |
| PFS-03 | Read orders under that grant | PFS-01 again | 200, that tenant's orders only |
| PFS-04 | Use the read grant for a **write** action (`resend-receipt`) | `support_resend_receipt` | 403 — read does not imply write |
| PFS-05 | Open a write grant | `grant_open_write` | 201 |
| PFS-06 | Re-send a receipt under the write grant | `support_resend_receipt` | 200; the invoice email is re-sent; audited |
| PFS-07 | Re-process a webhook from its raw payload | `support_retry_webhook` | 200; the payment settles; idempotency still holds (no double posting) |
| PFS-08 | Unlock a merchant account | `support_unlock_account` | 200; that merchant user can log in again |
| PFS-09 | Trigger a merchant password reset | `support_reset_password` | 200; a normal reset email is sent; **support never sees or sets the password** |
| PFS-10 | Grant duration above the cap | `grant_open_over_cap` | 400 (or silently capped at 1440 minutes — confirm which, and that it is capped) |
| PFS-11 | Grant duration below the floor | `grant_open_under_min` | 400 |
| PFS-12 | Grant with no reason | `grant_open_no_reason` | 400 |
| PFS-13 | Grant for tenant A, then use it against tenant B's `:tenantId` | swap the path id | 403 — a grant is per tenant |
| PFS-14 | Wait for expiry (open a 5-minute grant) | retry PFS-03 after expiry | 403 |
| PFS-15 | Revoke early | `DELETE /support/grants/:id` | 200; the next grant-scoped request is 403 |
| PFS-16 | List grants | `?tenantId=…&activeOnly=true` | 200, paginated |
| PFS-17 | **Merchant visibility** | `GET /v1/settings/audit?actorType=platform` as the merchant owner | Every grant and support action appears, with the reason the agent typed |
| PFS-18 | Merchant notification on grant open | check the email/SMS path | The merchant is notified that support opened access |
| PFS-19 | `read_only` opens a grant | `grant_open_read` as `PF_RO` | 403 |
| PFS-20 | Support tooling against a suspended tenant | suspend first | Handled cleanly, no 500 |

#### 5.20.6 Audit log and overview

| ID | Scenario | Expected |
| --- | --- | --- |
| PFA-01 | `GET /v1/platform/audit` | 200, paginated (default 50, max 100), newest first |
| PFA-02 | Filter by `action`, `tenantId`, `actorId`, `from`/`to` | Each filter honoured |
| PFA-03 | Every platform mutation performed in this test run appears | Actor, role, action, target, reason, IP, user agent, request id all populated |
| PFA-04 | The log has no write, update or delete route | `POST`/`PATCH`/`DELETE /v1/platform/audit` → 404/405 |
| PFA-05 | `read_only` reads the audit log | 200 (`audit:read`) |
| PFA-06 | `GET /v1/platform/overview` | 200: `totalTenants`, `activeTenants`, `newLast30Days`, `byStatus`, `byPlan` |
| PFA-07 | Overview counts reconcile with `GET /v1/platform/tenants?limit=100` | Totals match |
| PFA-08 | Overview after suspending a tenant | `activeTenants` drops by one |
| PFA-09 | A role without `tenants:read` calls overview | 403 |

---

## 6. Integration testing notes

### 6.1 Signing webhooks

```bash
# Paystack (HMAC-SHA512 over the raw body, header x-paystack-signature)
BODY=$(jq -c .paystack_charge_success docs/qa/payloads/04-payments-webhooks.json)
SIG=$(printf '%s' "$BODY" | openssl dgst -sha512 -hmac "$PAYSTACK_SECRET_KEY" | awk '{print $2}')
curl -sS -X POST "$BASE/v1/payments/webhook/paystack" \
  -H 'content-type: application/json' -H "x-paystack-signature: $SIG" --data-raw "$BODY"

# WhatsApp (HMAC-SHA256, header x-hub-signature-256, prefixed with sha256=)
BODY=$(jq -c .inbound_text_greeting docs/qa/payloads/08-whatsapp.json)
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$WHATSAPP_APP_SECRET" | awk '{print $2}')"
curl -sS -X POST "$BASE/v1/whatsapp/webhook" \
  -H 'content-type: application/json' -H "x-hub-signature-256: $SIG" --data-raw "$BODY"

# Flutterwave (shared secret compared verbatim, no HMAC)
BODY=$(jq -c .flutterwave_charge_completed docs/qa/payloads/04-payments-webhooks.json)
curl -sS -X POST "$BASE/v1/payments/webhook/flutterwave" \
  -H 'content-type: application/json' -H "verif-hash: $FLUTTERWAVE_WEBHOOK_SECRET" --data-raw "$BODY"
```

The body must be byte-identical to what you sign — the signature is computed over
the **raw** body, so re-formatting the JSON between signing and sending breaks it.

> **All three webhooks answer 200 to an invalid signature and do nothing.** That
> is deliberate (it stops probing), and it means HTTP 200 is never evidence that
> a webhook was processed. Every webhook test must assert the *side effect*:
> the payment row, the order status, the ledger entry, the outbound message.

### 6.2 Dependency-failure scenarios (dev-assisted)

These need the dev team to break a dependency in the QA environment for you.
Batch them into one session rather than chasing them individually. In every
case the rule is the same: a third party failing must produce a clean **502**
and leave no half-finished record behind — never a 500, never a stuck order.

| Dependency broken | What to check |
| --- | --- |
| Payment gateway (Paystack / Flutterwave) | 502 on initiate; no orphaned payment row; the order stays in its previous state |
| File storage | 502 on image upload; every other endpoint unaffected |
| Email provider | Invoice still generated and returned; only delivery is skipped |
| SMS provider | A failed notification must not roll back the business action that triggered it |
| Courier API | 502 on quote and dispatch; the order is not left marked dispatched |
| Session store | WhatsApp conversations degrade gracefully; ordinary CRUD keeps working |
| Database | `/health` reports 503; API responses stay generic `INTERNAL_ERROR` with no stack traces |

---

## 7. Known defects and expected failures

Known as of 2026-09-22 — confirm against the build under test before filing a
duplicate. K-01, K-04 and K-05 were reproduced against a live server.

| # | Area | What you will see |
| --- | --- | --- |
| K-01 | Shipping | `GET /v1/shipping/available` and `GET /v1/shipping/pickup-locations` return **500 for everyone**, with or without a token. They are documented as public storefront endpoints but still try to resolve a merchant from the request. A storefront cannot use them at all. |
| K-02 | Shipping | Shipping writes are **not** role-restricted: `staff` and `viewer` can create and delete zones, methods, rates, conditions and pick-up locations. Every other module restricts writes to owner/manager. |
| K-03 | Shipping | `GET /v1/shipping/states` is shown in the API docs as requiring a token but works without one. Docs and behaviour disagree. |
| K-04 | **Signup — blocker** | Creating a merchant fails with a **500**, on both public signup (`POST /v1/tenants`) and admin-side provisioning (`POST /v1/platform/tenants`). The set-up step that builds a new merchant's data space is missing from the build. **Reproduced 2026-09-22.** Until the dev team ships the fix, TEN-01 and every test that depends on a freshly created merchant is blocked — use merchants the team provides instead. |
| K-05 | **Signup — blocker** | K-04 fails only *part way* through, so a failed signup still consumes the `slug`: retrying the same slug returns 409, and logging in to that half-built merchant returns 500. Signup is not all-or-nothing (TEN-09). **Reproduced 2026-09-22.** Use a fresh slug on every attempt. |
| K-06 | Platform plane | Authorisation is meant to be decided before the request body is validated. If an unauthorised caller sends a deliberately invalid body and gets a **400** describing the schema instead of a 401/403, that is PFP-05 failing — it lets an outsider map the admin API. |
| K-07 | Admin console | `POST /v1/platform/tenants/:id/extend-trial` does not exist, but the admin UI has a button for it. Expect 404 until it ships. |
| K-08 | Platform users | "Deleting" a platform user **deactivates** it rather than removing it, and their access stops at their next request rather than instantly. Both are by design — do not file them as bugs. |

---

## 8. What the developers' own tests already cover

The dev team runs an automated suite on every build. Ask for its latest result
before starting a pass — you should not be the one to discover a known-red
build. Between them, those tests already cover: the happy-path merchant journey,
per-module CRUD behaviour, admin-plane auth and support tooling, order and
subscription state-transition legality, discount/tax/total arithmetic, webhook
signature validation and idempotency, and the plan-entitlement and
platform-permission matrices.

Your time is best spent on what an automated suite cannot assert:

- real gateway callbacks and the money that moves with them;
- the **contents** of generated PDFs and CSV exports;
- email, SMS and WhatsApp delivery as a customer actually receives it;
- courier integrations against a real provider sandbox;
- cross-tenant probing with tokens and ids you deliberately mix up (§4.4);
- timing — that a plan change takes effect on the very next request (§4.3);
- anything involving a human reading a message, an error or a screen.

---

## 9. Sign-off

**Release blockers** — any failure in §4.4 (tenant isolation), §4.1 (auth),
§5.20.1 (plane separation), §5.20.5 (grant enforcement), PAY-05..PAY-11
(payment correctness), or any `LEDGER_IMBALANCE`.

**Exit criteria**

- [ ] The dev team's automated suite is green on the build under test
- [ ] Every §4 cross-cutting suite executed and recorded
- [ ] Every §5 module matrix executed on at least one plan that entitles the feature, plus one that does not
- [ ] Full role matrix (§4.2) walked with real owner/manager/staff/viewer logins
- [ ] Full platform permission matrix (§5.20.2) walked with real read_only/support/admin/super_admin logins
- [ ] Webhook cases verified by **side effect**, not by status code
- [ ] Known defects in §7 re-confirmed or closed
- [ ] On a production-like environment: the API docs page is not publicly reachable

**Bug report template**

```
ID / Title      : e.g. ORD-10 — confirming an order twice deducts stock twice
Environment     : QA | staging | <build or release under test>
Plan / Role     : growth / manager   (or platform role)
Request         : METHOD /path  + exact body (name the payload file key)
Expected        : …
Actual          : status code + full response body
x-request-id    : from the response headers — the devs trace the failure with it
Reproducibility : always | intermittent (n of m)
Severity        : blocker | major | minor | cosmetic
Notes           : what the data looked like before and after, screenshots
```
