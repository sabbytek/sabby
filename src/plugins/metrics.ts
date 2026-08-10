import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { collectDefaultMetrics, Registry, Counter, Histogram } from 'prom-client';
import { env } from '../config/env.js';

declare module 'fastify' {
  interface FastifyInstance {
    metrics: {
      registry: Registry;
      httpRequestDuration: Histogram;
      httpRequestTotal: Counter;
    };
  }
}

async function metricsPlugin(app: FastifyInstance) {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });

  const httpRequestTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [registry],
  });

  app.decorate('metrics', { registry, httpRequestDuration, httpRequestTotal });

  app.addHook('onRequest', async (request) => {
    (request as { _startTime?: number })._startTime = Date.now();
  });

  app.addHook('onResponse', async (request, reply) => {
    const startTime = (request as { _startTime?: number })._startTime;
    const duration = startTime ? (Date.now() - startTime) / 1000 : 0;
    const route = request.routeOptions?.url ?? 'unknown';
    const labels = {
      method: request.method,
      route,
      status_code: String(reply.statusCode),
    };
    httpRequestDuration.observe(labels, duration);
    httpRequestTotal.inc(labels);
  });

  app.get('/metrics', { schema: { hide: true } }, async (request, reply) => {
    // In production, restrict to loopback; in dev/test, open for scraping
    if (env.NODE_ENV === 'production') {
      const ip = request.ip;
      const isLoopback = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
      if (!isLoopback) {
        return reply.code(403).send({ error: 'Forbidden' });
      }
    }
    const metrics = await registry.metrics();
    return reply
      .header('Content-Type', registry.contentType)
      .send(metrics);
  });
}

export default fp(metricsPlugin, { name: 'metrics' });
