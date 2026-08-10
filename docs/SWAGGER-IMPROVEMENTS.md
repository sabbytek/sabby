# Swagger/OpenAPI Documentation Improvements

## Current State

The BPOS API uses `@fastify/swagger` (v8.14.0) to generate OpenAPI 3.0.3 specs automatically from route schemas. The Swagger UI is available at `/docs` when `SWAGGER_ENABLED=true`.

**What's working:**
- OpenAPI 3.0.3 spec auto-generated
- Swagger UI with deep linking and persistent authorization
- Tags defined for all 11 module groups
- Bearer JWT security scheme configured
- Server URL dynamically set per environment

**What's missing:**

---

## 1. Missing Response Schemas

Most routes return `{ success: true, data: ... }` but don't define response schemas in OpenAPI. Only a few routes (auth login) have explicit `response` definitions.

### Fix: Add response schemas to all routes

Example for P&L report:

```typescript
schema: {
  tags: ['Reporting'],
  summary: 'Profit & Loss report (derived from ledger)',
  security: [{ bearerAuth: [] }],
  querystring: { ... },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            revenueKobo: { type: 'integer' },
            cogsKobo: { type: 'integer' },
            grossProfitKobo: { type: 'integer' },
            operatingExpensesKobo: { type: 'integer' },
            paymentFeesKobo: { type: 'integer' },
            refundsKobo: { type: 'integer' },
            netProfitKobo: { type: 'integer' },
          },
        },
      },
    },
  },
},
```

---

## 2. Missing Error Response Schemas

No routes document error responses (400, 401, 403, 404, 402, 500, 502).

### Fix: Add shared error schema component

```typescript
// In swagger.ts components.schemas
components: {
  schemas: {
    ErrorResponse: {
      type: 'object',
      properties: {
        success: { type: 'boolean', enum: [false] },
        error: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            details: { oneOf: [{ type: 'array' }, { type: 'object' }] },
          },
        },
      },
    },
  },
},
```

Then reference in routes:

```typescript
response: {
  400: { $ref: 'ErrorResponse' },
  401: { $ref: 'ErrorResponse' },
  403: { $ref: 'ErrorResponse' },
  404: { $ref: 'ErrorResponse' },
},
```

---

## 3. Missing Tags

Some module groups aren't in the swagger.ts tags array:

| Missing Tag | Module |
|-------------|--------|
| `Locations` | Location management |
| `Staff` | Staff management |
| `Expenses` | Expense tracking |
| `Invoicing` | Invoice generation |
| `WhatsApp` | WhatsApp commerce |
| `Onboarding` | Guided setup |
| `Dispatch` | Logistics dispatch |
| `Shipping` | Shipping configuration |

### Fix: Add tags to `src/plugins/swagger.ts`

```typescript
tags: [
  { name: 'Auth', description: 'Authentication and session management' },
  { name: 'Tenants', description: 'Tenant provisioning and management' },
  { name: 'Products', description: 'Product catalogue and variants' },
  { name: 'Inventory', description: 'Stock tracking and movement' },
  { name: 'Customers', description: 'Customer records' },
  { name: 'Orders', description: 'Order pipeline' },
  { name: 'Payments', description: 'Payment processing and webhooks' },
  { name: 'Ledger', description: 'Double-entry financial ledger' },
  { name: 'Subscriptions', description: 'Plan subscriptions and feature gating' },
  { name: 'Reporting', description: 'P&L and operational reports' },
  { name: 'Uploads', description: 'Image upload and compression' },
  { name: 'Locations', description: 'Multi-location management' },
  { name: 'Staff', description: 'Staff and role management' },
  { name: 'Expenses', description: 'Expense tracking and ledger posting' },
  { name: 'Invoicing', description: 'Invoice generation and PDF export' },
  { name: 'WhatsApp', description: 'WhatsApp commerce channel' },
  { name: 'Onboarding', description: 'Guided merchant setup' },
  { name: 'Dispatch', description: 'Logistics and order dispatch' },
  { name: 'Shipping', description: 'Shipping zones, rates, and methods' },
],
```

---

## 4. Missing Description Fields

Most routes lack `description` fields. Add descriptions to clarify:

| Route | Description Needed |
|-------|-------------------|
| `POST /v1/orders/:id/confirm` | "Validates order, deducts stock. Must be in 'draft' status." |
| `POST /v1/orders/:id/cancel` | "Cancels order and restores stock if previously confirmed." |
| `POST /v1/payments/initiate` | "Initiates payment via Paystack or Flutterwave. Returns authorization URL." |
| `POST /v1/invoices` | "Generates invoice for a confirmed order. PDF is async." |
| `GET /v1/shipping/available` | "Returns applicable shipping methods sorted cheapest first." |
| `POST /v1/dispatch/:orderId/dispatch` | "Merchant-triggered dispatch, not automatic." |

---

## 5. Missing Export Script

`package.json` references `scripts/export-openapi.ts` but the file didn't exist.

### Fix: ✅ Created

The script has been created at `scripts/export-openapi.ts`. Run:

```bash
npm run docs:export
```

---

## 6. Query String Constraints

Pagination params (`page`, `limit`) are typed as strings without constraints.

### Fix: Add integer constraints

```typescript
querystring: {
  type: 'object',
  properties: {
    page: { type: 'string', pattern: '^[1-9]\\d*$', default: '1' },
    limit: { type: 'string', pattern: '^[1-9]\\d*$', default: '20' },
  },
},
```

---

## 7. Rate Limiting Documentation

Rate limiting is configured on auth routes but not documented in OpenAPI.

### Fix: Document rate limits in route descriptions

```typescript
schema: {
  summary: 'Authenticate a user and receive tokens',
  description: 'Rate limited: 10 requests per minute.',
  ...
},
```

---

## 8. Webhook Signature Verification

Webhook endpoints (Paystack, Flutterwave, WhatsApp, Dispatch) don't document signature verification.

### Fix: Add header documentation

```typescript
schema: {
  summary: 'Paystack webhook receiver',
  description: 'Receives Paystack webhook events. Verified via HMAC-SHA512 signature in x-paystack-signature header.',
  headers: {
    'x-paystack-signature': {
      type: 'string',
      description: 'HMAC-SHA512 signature of the request body',
    },
  },
},
```

---

## Implementation Priority

1. **High**: Add missing tags to swagger.ts (5 min)
2. **High**: Create export script (done)
3. **Medium**: Add response schemas to reporting routes (30 min)
4. **Medium**: Add error response schemas globally (1 hour)
5. **Low**: Add descriptions to all routes (2 hours)
6. **Low**: Add query string constraints (30 min)
