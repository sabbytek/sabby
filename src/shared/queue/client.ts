import { Queue, Worker, type Processor, type ConnectionOptions } from 'bullmq';
import { env } from '../../config/env.js';

// Parse Redis URL for BullMQ connection options
// BullMQ uses Redis DB 1 to keep queue data separate from cache
function getRedisConnection(): ConnectionOptions {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: parseInt(url.port || '6379'),
    password: url.password || undefined,
    db: 1,
    maxRetriesPerRequest: null, // Required for BullMQ
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
  return new Queue<T>(name, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });
}

// Typed worker factory
export function createWorker<T>(name: string, processor: Processor<T>) {
  return new Worker<T>(name, processor, {
    connection: redisConnection,
    concurrency: 5,
  });
}

// Singleton queues
export const notificationsQueue = createQueue<unknown>(QUEUES.NOTIFICATIONS);
export const documentsQueue = createQueue<unknown>(QUEUES.DOCUMENTS);
export const paymentsQueue = createQueue<unknown>(QUEUES.PAYMENTS);
export const subscriptionsQueue = createQueue<unknown>(QUEUES.SUBSCRIPTIONS);
export const logisticsQueue = createQueue<unknown>(QUEUES.LOGISTICS);
