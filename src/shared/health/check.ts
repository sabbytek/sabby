import { sql } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { cache, isRedisAvailable } from '../cache/client.js';
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

const CHECK_TIMEOUT_MS = 4000;

async function withTimeout<T>(label: string, promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} check timed out after ${CHECK_TIMEOUT_MS}ms`)),
      CHECK_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function checkDatabase(): Promise<ComponentCheck> {
  const start = Date.now();
  try {
    const db = getDb();
    await withTimeout('database', db.execute(sql`SELECT 1`));
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'Unknown database error',
    };
  }
}

async function checkRedis(): Promise<ComponentCheck> {
  const start = Date.now();
  if (!isRedisAvailable()) {
    return { status: 'error', message: 'Redis unavailable — check REDIS_URL env var' };
  }
  try {
    const pong = await withTimeout('redis', cache.ping());
    const latencyMs = Date.now() - start;
    return pong === 'PONG'
      ? { status: 'ok', latencyMs }
      : { status: 'error', latencyMs, message: `Unexpected response: ${String(pong)}` };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'Unknown Redis error',
    };
  }
}

async function checkQueues(): Promise<ComponentCheck> {
  if (!isRedisAvailable()) {
    return { status: 'error', message: 'Queues unavailable — Redis unreachable' };
  }
  const start = Date.now();
  try {
    const { notificationsQueue, documentsQueue, paymentsQueue, subscriptionsQueue, logisticsQueue } =
      await import('../queue/client.js');

    const queues = [notificationsQueue, documentsQueue, paymentsQueue, subscriptionsQueue, logisticsQueue];
    const results = await Promise.allSettled(
      queues.map((q) => q.getJobCounts('waiting', 'active', 'completed', 'failed')),
    );

    const hasErrors = results.some((r) => r.status === 'rejected');
    let failed = 0;
    let waiting = 0;
    for (const r of results) {
      if (r.status === 'fulfilled') {
        failed += r.value['failed'] ?? 0;
        waiting += r.value['waiting'] ?? 0;
      }
    }

    return {
      status: hasErrors ? 'error' : 'ok',
      latencyMs: Date.now() - start,
      message: hasErrors
        ? 'Some queues unreachable'
        : `${String(queues.length)} queues, ${String(waiting)} waiting, ${String(failed)} failed`,
    };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'Unknown queue error',
    };
  }
}

export async function runHealthChecks(): Promise<HealthCheckResult> {
  const [database, redis, queues] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkQueues(),
  ]);

  const checks = { database, redis, queues };
  const errorCount = Object.values(checks).filter((c) => c.status === 'error').length;
  const overallStatus: HealthCheckResult['status'] =
    errorCount === 0 ? 'ok' : errorCount >= 2 ? 'error' : 'degraded';

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    uptime: process.uptime(),
    checks,
  };
}
