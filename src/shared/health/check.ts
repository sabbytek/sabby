/**
 * Health check utilities.
 * Checks database, Redis, and BullMQ queue status.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { cache } from '../cache/client.js';
import { env } from '../../config/env.js';

export interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  environment: string;
  uptime: number;
  checks: {
    database: ComponentCheck;
    redis: ComponentCheck;
    queues: ComponentCheck;
  };
}

export interface ComponentCheck {
  status: 'ok' | 'error';
  latencyMs?: number;
  message?: string;
}

/**
 * Check database connectivity by running a simple query.
 */
async function checkDatabase(): Promise<ComponentCheck> {
  const start = Date.now();
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    return {
      status: 'ok',
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'Unknown database error',
    };
  }
}

/**
 * Resolve once the lazy cache client is ready to accept commands, whatever
 * connection state it is currently in. `connect()` only accepts a fresh client
 * (status 'wait'/'end'); if it is already mid-connect we wait for the 'ready'
 * event instead of racing a command onto an unwritable socket.
 */
async function ensureCacheReady(): Promise<void> {
  if (cache.status === 'ready') return;
  if (cache.status === 'wait' || cache.status === 'end') {
    await cache.connect();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const onReady = (): void => {
      cleanup();
      resolve();
    };
    const onError = (err: Error): void => {
      cleanup();
      reject(err);
    };
    const cleanup = (): void => {
      cache.off('ready', onReady);
      cache.off('error', onError);
    };
    cache.once('ready', onReady);
    cache.once('error', onError);
  });
}

/**
 * Check Redis connectivity by pinging.
 */
async function checkRedis(): Promise<ComponentCheck> {
  const start = Date.now();
  try {
    // The cache client is lazyConnect with enableOfflineQueue disabled, so a
    // ping issued before the socket is ready is rejected outright ("Stream
    // isn't writeable"). Ensure the connection is ready first — this makes the
    // very first health probe after boot accurate instead of falsely degraded.
    await ensureCacheReady();
    const pong = await cache.ping();
    const latencyMs = Date.now() - start;
    const isHealthy = pong === 'PONG';
    if (isHealthy) {
      return { status: 'ok', latencyMs };
    }
    return { status: 'error', latencyMs, message: `Unexpected response: ${String(pong)}` };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'Unknown Redis error',
    };
  }
}

/**
 * Check queue status by fetching job counts from all queues.
 */
async function checkQueues(): Promise<ComponentCheck> {
  const start = Date.now();
  try {
    // Dynamic import to avoid circular dependencies
    const {
      notificationsQueue,
      documentsQueue,
      paymentsQueue,
      subscriptionsQueue,
      logisticsQueue,
    } = await import('../queue/client.js');

    const queues = [
      notificationsQueue,
      documentsQueue,
      paymentsQueue,
      subscriptionsQueue,
      logisticsQueue,
    ];
    const results = await Promise.allSettled(
      queues.map(async (q) => {
        const counts = await q.getJobCounts('waiting', 'active', 'completed', 'failed');
        return { name: q.name, counts };
      }),
    );

    let failed = 0;
    let totalWaiting = 0;

    for (const r of results) {
      if (r.status === 'fulfilled') {
        failed += r.value.counts['failed'] ?? 0;
        totalWaiting += r.value.counts['waiting'] ?? 0;
      }
    }

    const hasErrors = results.some((r) => r.status === 'rejected');

    return {
      status: hasErrors ? 'error' : 'ok',
      latencyMs: Date.now() - start,
      message: hasErrors
        ? 'Some queues unreachable'
        : `${String(queues.length)} queues, ${String(totalWaiting)} waiting, ${String(failed)} failed`,
    };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'Unknown queue error',
    };
  }
}

/**
 * Run all health checks and return aggregated status.
 */
export async function runHealthChecks(): Promise<HealthCheckResult> {
  const [database, redis, queues] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkQueues(),
  ]);

  const checks = { database, redis, queues };
  const statuses = Object.values(checks).map((c) => c.status);

  let overallStatus: HealthCheckResult['status'] = 'ok';
  if (statuses.includes('error')) {
    overallStatus = statuses.filter((s) => s === 'error').length >= 2 ? 'error' : 'degraded';
  }

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    uptime: process.uptime(),
    checks,
  };
}
