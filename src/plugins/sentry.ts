/**
 * Sentry plugin — exception tracking with request context.
 * Only active when SENTRY_DSN is configured.
 */

import type { FastifyInstance } from 'fastify';
import * as Sentry from '@sentry/node';
import { env } from '../config/env.js';

export async function sentryPlugin(app: FastifyInstance) {
  if (!env.SENTRY_DSN) {
    app.log.info('Sentry DSN not configured, skipping');
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
    enabled: env.NODE_ENV !== 'test',
  });

  app.addHook('onError', (request, _reply, error, done) => {
    // Only capture 5xx errors — 4xx are expected client errors
    if (error.statusCode && error.statusCode >= 500) {
      Sentry.withScope((scope) => {
        scope.setTag('request_id', request.id);
        scope.setTag('method', request.method);
        scope.setTag('url', request.url);

        if (request.user) {
          scope.setUser({
            id: request.user.userId,
            tenant_id: request.user.tenantId,
          });
        }

        Sentry.captureException(error);
      });
    }
    done();
  });

  app.log.info('Sentry initialized');
}
