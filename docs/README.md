# BPOS API Documentation

## Overview

This directory contains API documentation for the BPOS Multi-Tenant Commerce Platform.

### Files

| File | Description |
|------|-------------|
| `BPOS-API.postman_collection.json` | Postman collection with all 78 endpoints |
| `SWAGGER-IMPROVEMENTS.md` | Swagger/OpenAPI documentation gaps and fixes |
| `openapi.json` | Generated OpenAPI 3.0.3 spec (run `npm run docs:export`) |

### Quick Start

**Postman:**
1. Import `BPOS-API.postman_collection.json` into Postman
2. Set the `baseUrl` variable (default: `http://localhost:3000`)
3. Run the "Login" request to auto-populate `accessToken` and `refreshToken`

**Swagger UI:**
1. Start the dev server: `npm run dev`
2. Open `http://localhost:3000/docs`

**Export OpenAPI Spec:**
```bash
npm run docs:export
# Outputs docs/openapi.json
```

### API Base URL

| Environment | URL |
|-------------|-----|
| Development | `http://localhost:3000` |
| Staging | `https://staging-api.bpos.ng` |
| Production | `https://api.bpos.ng` |

### Authentication

All protected endpoints require a Bearer token:

```
Authorization: Bearer <accessToken>
```

Obtain tokens via `POST /v1/auth/login`. Use `POST /v1/auth/refresh` when the access token expires.

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

### Monetary Values

All monetary values are stored and returned as **integer kobo** (₦1 = 100 kobo).

| Field Example | Value | Naira Equivalent |
|---------------|-------|------------------|
| `priceKobo` | `350000` | ₦3,500.00 |
| `costKobo` | `150000` | ₦1,500.00 |
| `totalValueKobo` | `1250000` | ₦12,500.00 |

### Multi-Tenancy

Every authenticated request is scoped to the tenant embedded in the JWT. No `X-Tenant-ID` header is needed.

### Feature Gating

Some endpoints require specific subscription tier features. A `402` response with `FEATURE_GATED` code means the merchant's plan does not include the feature.
