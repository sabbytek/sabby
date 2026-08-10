import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform } from '@fastify/type-provider-zod';
import { env } from '../config/env.js';

async function swaggerPlugin(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'BPOS API',
        description: 'Multi-tenant commerce and operations platform for Nigerian SMEs',
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
