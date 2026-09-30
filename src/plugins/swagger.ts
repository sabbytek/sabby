import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform } from '@fastify/type-provider-zod';
import { env } from '../config/env.js';

// Rendered as Markdown at the top of /docs. Keep in step with response.ts,
// errors/handler.ts and the auth module.
const API_OVERVIEW = `Multi-tenant commerce and operations platform for Nigerian SMEs.

## Authentication
Each business is a tenant, identified by its handle (\`slug\`). A user account belongs to one tenant.

1. \`POST /v1/auth/login\` with \`{ tenantSlug, email, password }\` returns \`accessToken\`, \`refreshToken\` and \`user\`.
2. Send \`Authorization: Bearer <accessToken>\` on every protected request. The token carries the tenant, so no tenant header is needed.
3. When a request returns \`401\`, call \`POST /v1/auth/refresh\` with \`{ tenantSlug, refreshToken }\`. It returns a new \`accessToken\` only; the refresh token is reused until it expires (7 days) or is revoked.
4. \`POST /v1/auth/logout\` with \`{ refreshToken }\` revokes it.

Access tokens last 15 minutes by default (\`JWT_ACCESS_EXPIRY\`). Request bodies reject unknown keys and use camelCase.

## Responses
Success: \`{ "success": true, "data": ... }\`

Failure: \`{ "success": false, "error": { "code", "message", "details"? } }\`. Common codes: \`VALIDATION_ERROR\` (400, \`details\` lists the fields), \`UNAUTHORIZED\` (401), \`FORBIDDEN\` (403), \`FEATURE_GATED\` (402), \`NOT_FOUND\` (404), \`CONFLICT\` (409), \`RATE_LIMIT_EXCEEDED\` (429), \`INTERNAL_ERROR\` (500), \`EXTERNAL_SERVICE_ERROR\` (502, a payment or logistics provider failed).

A path that does not exist returns Fastify's own shape instead: \`{ "message", "error", "statusCode" }\`.

## Pagination
Merchant list endpoints (orders, products, customers, inventory, expenses, ledger) take \`page\` and \`limit\` query parameters and return
\`data: { items, total, page, limit, totalPages }\`.
Platform (admin) list endpoints nest the counts instead: \`data: { items, pagination: { page, limit, total, totalPages } }\`.

## Money
Amounts are integers in kobo (₦1 = 100 kobo).`;

async function swaggerPlugin(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'BPOS API',
        description: API_OVERVIEW,
        version: '1.0.0',
        contact: {
          name: 'BPOS Engineering',
        },
      },
      servers: [
        {
          url: env.PLATFORM_BASE_URL,
          description:
            env.NODE_ENV === 'production'
              ? 'Production'
              : env.NODE_ENV === 'staging'
                ? 'Staging'
                : 'Development',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
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
      ],
    },
    transform: jsonSchemaTransform,
  });

  if (env.SWAGGER_ENABLED) {
    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
        persistAuthorization: true,
      },
      staticCSP: true,
    });
  }
}

export default fp(swaggerPlugin, { name: 'swagger' });
