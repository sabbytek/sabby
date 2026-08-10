import Fastify from 'fastify';
import fp from 'fastify-plugin';
import jwtPlugin from '@fastify/jwt';
import { validatorCompiler, serializerCompiler } from '@fastify/type-provider-zod';
import { env } from './config/env.js';
import { errorHandler } from './shared/errors/handler.js';
import { registerRequestId } from './shared/middleware/request-id.js';
import { runHealthChecks } from './shared/health/check.js';

// Plugins
import helmetPlugin from './plugins/helmet.js';
import corsPlugin from './plugins/cors.js';
import swaggerPlugin from './plugins/swagger.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import metricsPlugin from './plugins/metrics.js';
import multipartPlugin from './plugins/multipart.js';
import { sentryPlugin } from './plugins/sentry.js';
import { createAxiomLogger } from './plugins/axiom.js';

// Module routes
import authRoutes from './modules/auth/routes.js';
import tenantRoutes from './modules/tenants/routes.js';
import productsRoutes from './modules/products/routes.js';
import inventoryRoutes from './modules/inventory/routes.js';
import customersRoutes from './modules/customers/routes.js';
import ordersRoutes from './modules/orders/routes.js';
import paymentsRoutes from './modules/payments/routes.js';
import ledgerRoutes from './modules/ledger/routes.js';
import subscriptionsRoutes from './modules/subscriptions/routes.js';
import locationsRoutes from './modules/locations/routes.js';
import staffRoutes from './modules/staff/routes.js';
import expensesRoutes from './modules/expenses/routes.js';
import reportingRoutes from './modules/reporting/routes.js';
import invoicingRoutes from './modules/invoicing/routes.js';
import whatsappRoutes from './modules/whatsapp/routes.js';
import onboardingRoutes from './modules/onboarding/routes.js';
import dispatchRoutes from './modules/dispatch/routes.js';
import uploadsRoutes from './modules/uploads/routes.js';
import shippingRoutes from './modules/shipping/routes.js';

export function buildApp() {
  const axiomTransport = createAxiomLogger();

  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'test' ? 'silent' : 'info',
      ...(axiomTransport ? { transport: axiomTransport } : {}),
      ...(env.NODE_ENV === 'development' && !axiomTransport
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
            },
          }
        : {}),
    },
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    trustProxy: true,
    ajv: {
      customOptions: {
        removeAdditional: true,
        coerceTypes: false,
        allErrors: false,
      },
    },
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler(errorHandler as Parameters<typeof app.setErrorHandler>[0]);

  // Core plugins (order matters)
  void app.register(fp(sentryPlugin));
  void app.register(fp(helmetPlugin));
  void app.register(fp(corsPlugin));
  void app.register(fp(rateLimitPlugin));
  void app.register(fp(swaggerPlugin));
  void app.register(fp(metricsPlugin));
  void app.register(fp(multipartPlugin));
  void app.register(jwtPlugin, {
    secret: env.JWT_ACCESS_SECRET,
    sign: { expiresIn: env.JWT_ACCESS_EXPIRY },
  });

  registerRequestId(app);

  // Health check (unauthenticated, not in swagger)
  // Returns DB + Redis + queue status with appropriate HTTP status code
  app.get('/health', { schema: { hide: true } }, async (_request, reply) => {
    const health = await runHealthChecks();
    const statusCode = health.status === 'ok' ? 200 : health.status === 'degraded' ? 200 : 503;
    return reply.status(statusCode).send(health);
  });

  // Module routes
  void app.register(authRoutes, { prefix: '/v1/auth' });
  void app.register(tenantRoutes, { prefix: '/v1/tenants' });
  void app.register(productsRoutes, { prefix: '/v1/products' });
  void app.register(inventoryRoutes, { prefix: '/v1/inventory' });
  void app.register(customersRoutes, { prefix: '/v1/customers' });
  void app.register(ordersRoutes, { prefix: '/v1/orders' });
  void app.register(paymentsRoutes, { prefix: '/v1/payments' });
  void app.register(ledgerRoutes, { prefix: '/v1/ledger' });
  void app.register(subscriptionsRoutes, { prefix: '/v1/subscriptions' });
  void app.register(locationsRoutes,    { prefix: '/v1/locations' });
  void app.register(staffRoutes,        { prefix: '/v1/staff' });
  void app.register(expensesRoutes,     { prefix: '/v1/expenses' });
  void app.register(reportingRoutes,    { prefix: '/v1/reports' });
  void app.register(invoicingRoutes,    { prefix: '/v1/invoices' });
  void app.register(whatsappRoutes,    { prefix: '/v1/whatsapp' });
  void app.register(onboardingRoutes,  { prefix: '/v1/onboarding' });
  void app.register(dispatchRoutes,    { prefix: '/v1/dispatch' });
  void app.register(uploadsRoutes,     { prefix: '/v1/uploads' });
  void app.register(shippingRoutes,   { prefix: '/v1/shipping' });

  return app;
}
