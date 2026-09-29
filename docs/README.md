# BPOS API Documentation

## Overview

This directory contains API documentation for the BPOS Multi-Tenant Commerce Platform.

### Files

| File | Description |
|------|-------------|
| `BPOS-API.postman_collection.json` | Postman collection with all 78 endpoints |
| `SWAGGER-IMPROVEMENTS.md` | Swagger/OpenAPI documentation gaps and fixes |
| `openapi.json` / `openapi.yaml` | Generated OpenAPI 3.0.3 spec, same content in two formats. Regenerate both with `npm run docs:export` after changing route schemas; don't edit by hand |

### Quick Start

**Postman:**
1. Import `BPOS-API.postman_collection.json` into Postman
2. Set the `baseUrl` variable (default: `http://localhost:5001`, the `PORT` in `.env`)
3. Run "Provision Tenant" once (it saves `tenantSlug`), or set `tenantSlug` to an existing business
4. Run the "Login" request to auto-populate `accessToken` and `refreshToken`

**Swagger UI:**
1. Start the dev server: `npm run dev`
2. Open `http://localhost:5001/docs` (port = `PORT` in `.env`)

**Export OpenAPI Spec:**
```bash
npm run docs:export
# Reads the running server at http://localhost:$PORT, writes docs/openapi.json and docs/openapi.yaml
```

### Database Setup

Each business (tenant) gets its own PostgreSQL schema; shared tables live in `public`.

```bash
npm run db:migrate          # public schema — once on a new database, then after public schema changes
```

Tenant schemas are created and migrated automatically when a tenant is provisioned (`POST /v1/tenants`). After changing `src/shared/db/schema/tenant.ts`:

```bash
npm run db:generate:tenant  # writes db/migrations/tenant/*.sql (unqualified, schema-agnostic)
npm run db:migrate:tenant -- t_<tenant_id_with_underscores>   # upgrade an existing tenant
```

Notes:
- Tenant queries rely on `search_path`, so they run inside a transaction on Neon's WebSocket driver (`withTenantSchema`), never the stateless HTTP driver.
- Migrations connect to Neon's **direct** host even when `DATABASE_URL` uses the `-pooler` host, so their session-level `search_path` cannot leak to other clients.
- `PLATFORM_BASE_URL` must be this API's own public URL (payment callbacks and webhooks point at it).

### API Base URL

| Environment | URL |
|-------------|-----|
| Development | `http://localhost:5001` (`PORT` in `.env`) |
| Staging | `https://staging-api.bpos.ng` |
| Production | `https://api.bpos.ng` |

### Authentication

All protected endpoints require a Bearer token:

```
Authorization: Bearer <accessToken>
```

1. `POST /v1/auth/login` with `{ "tenantSlug", "email", "password" }`. `tenantSlug` is the business handle chosen at signup; the same email under another business is a different account. Returns `accessToken`, `refreshToken` and `user` (`id`, `email`, `firstName`, `lastName`, `role`).
2. Access tokens last 15 minutes by default (`JWT_ACCESS_EXPIRY`). When a request returns `401`, call `POST /v1/auth/refresh` with `{ "tenantSlug", "refreshToken" }`. It returns a new `accessToken` only; keep the same refresh token (valid 7 days).
3. `POST /v1/auth/logout` with `{ "refreshToken" }` revokes it.

Wrong email, wrong password and credentials from another business all return the same `401`. An unknown `tenantSlug` returns `404`. Request bodies are camelCase and reject unknown keys.

### Response Envelope

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "'from' must be before 'to'",
    "details": []
  }
}
```

A path that does not exist returns Fastify's own shape instead: `{ "message", "error", "statusCode" }`.

### Pagination

Merchant list endpoints (orders, products, customers, inventory, expenses, ledger) accept `page` and `limit` and return:

```json
{ "success": true, "data": { "items": [], "total": 0, "page": 1, "limit": 20, "totalPages": 0 } }
```

Platform (admin) list endpoints nest the counts: `data: { items, pagination: { page, limit, total, totalPages } }`.

### File Storage

| Files | Where | Stored value | Returned to clients |
|-------|-------|--------------|---------------------|
| Product photos | Cloudflare R2, public bucket (`R2_BUCKET_NAME`) | public URL | the same URL |
| Invoice PDFs, expense receipts | private storage, chosen by `PRIVATE_STORAGE_PROVIDER` | `r2://<key>` or `neon://<key>` | a signed link valid for 1 hour, fresh on every read |

- `PRIVATE_STORAGE_PROVIDER=r2` (default) keeps everything on Cloudflare, in `R2_PRIVATE_BUCKET_NAME`. Give that bucket no public access or custom domain. If it is unset, private files fall back to `R2_BUCKET_NAME`, where anyone with the key could read them through the public domain.
- `PRIVATE_STORAGE_PROVIDER=neon` uses Neon object storage (`AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `NEON_STORAGE_BUCKET`).
- Stored references name their provider, so switching only affects new files. Old files still resolve while the old provider's credentials stay configured.
- Upload a receipt with `POST /v1/uploads/image?visibility=private` and save the returned `ref` as the expense's `receiptUrl`.
- Object keys start with the tenant schema name, and a reference is only signed for its own tenant.

### Monetary Values

All monetary values are stored and returned as **integer kobo** (₦1 = 100 kobo).

| Field Example | Value | Naira Equivalent |
|---------------|-------|------------------|
| `priceKobo` | `350000` | ₦3,500.00 |
| `costKobo` | `150000` | ₦1,500.00 |
| `totalValueKobo` | `1250000` | ₦12,500.00 |

### Multi-Tenancy

Every authenticated request is scoped to the tenant embedded in the JWT. No `X-Tenant-ID` header is needed. Each tenant's data lives in its own PostgreSQL schema, so one business can never read another's records.

### Feature Gating

Some endpoints require specific subscription tier features. A `402` response with `FEATURE_GATED` code means the merchant's plan does not include the feature.
