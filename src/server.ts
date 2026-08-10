import { buildApp } from './app.js';
import { env } from './config/env.js';
import { cache } from './shared/cache/client.js';
import {
  notificationsQueue,
  documentsQueue,
  paymentsQueue,
  subscriptionsQueue,
  logisticsQueue,
} from './shared/queue/client.js';

const app = buildApp();

const SHUTDOWN_TIMEOUT_MS = 30_000; // 30 seconds max for graceful shutdown

async function start() {
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`Server listening on ${env.HOST}:${String(env.PORT)}`);
    app.log.info(`Environment: ${env.NODE_ENV}`);
    if (env.SWAGGER_ENABLED) {
      app.log.info(`API docs available at ${env.PLATFORM_BASE_URL}/docs`);
    }
  } catch (err) {
    app.log.error(err, 'Failed to start server');
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  app.log.info(`Received ${signal}, starting graceful shutdown`);

  // Set a hard timeout to force exit if drain takes too long
  const forceExitTimer = setTimeout(() => {
    app.log.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref(); // Don't keep process alive just for the timer

  try {
    // 1. Stop accepting new connections (Fastify)
    await app.close();
    app.log.info('Fastify server closed');

    // 2. Close BullMQ queues (stops scheduling new jobs)
    const queues = [
      notificationsQueue,
      documentsQueue,
      paymentsQueue,
      subscriptionsQueue,
      logisticsQueue,
    ];

    await Promise.allSettled(queues.map((q) => q.close()));
    app.log.info('BullMQ queues closed');

    // 3. Close Redis connections
    await cache.quit();
    app.log.info('Redis connections closed');

    clearTimeout(forceExitTimer);
    app.log.info('Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    app.log.error(err, 'Error during graceful shutdown');
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

void start();
