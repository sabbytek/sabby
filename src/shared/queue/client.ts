import { Queue, Worker, type Processor, type ConnectionOptions } from 'bullmq';
import { env } from '../../config/env.js';

function getRedisConnection(): ConnectionOptions {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: parseInt(url.port || '6379'),
    password: url.password || undefined,
    username: url.username || undefined,
    db: 1,
    maxRetriesPerRequest: null, // Required for BullMQ
    // Mirror the cache client's retry cap so a dead Redis host doesn't keep
    // the process alive with infinite reconnect attempts.
    retryStrategy: (times: number) => (times > 10 ? null : Math.min(times * 200, 3000)),
    enableOfflineQueue: false,
    lazyConnect: true,
    // Managed Redis (e.g. Upstash) only accepts TLS; the scheme is lost when
    // the URL is split into host/port, so carry it over explicitly.
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

export const redisConnection = getRedisConnection();

export const QUEUES = {
  NOTIFICATIONS: 'notifications',
  DOCUMENTS: 'documents',
  PAYMENTS: 'payments',
  SUBSCRIPTIONS: 'subscriptions',
  LOGISTICS: 'logistics',
} as const;

// Typed queue factory
export function createQueue<T>(name: string) {
  const queue = new Queue<T>(name, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });
  // Without a listener BullMQ dumps raw connection errors to stderr
  queue.on('error', (err: Error) => {
    console.error(`Queue ${name} error:`, err.message);
  });
  return queue;
}

// Typed worker factory
export function createWorker<T>(name: string, processor: Processor<T>) {
  const worker = new Worker<T>(name, processor, {
    connection: redisConnection,
    concurrency: 5,
  });
  worker.on('error', (err: Error) => {
    console.error(`Worker ${name} error:`, err.message);
  });
  return worker;
}

// Singleton queues
export const notificationsQueue = createQueue<unknown>(QUEUES.NOTIFICATIONS);
export const documentsQueue = createQueue<unknown>(QUEUES.DOCUMENTS);
export const paymentsQueue = createQueue<unknown>(QUEUES.PAYMENTS);
export const subscriptionsQueue = createQueue<unknown>(QUEUES.SUBSCRIPTIONS);
export const logisticsQueue = createQueue<unknown>(QUEUES.LOGISTICS);
