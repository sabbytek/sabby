import { Redis } from 'ioredis';
import { env } from '../../config/env.js';

// Redis DB 0 — application cache
export const cache = new Redis(env.REDIS_URL, {
  db: 0,
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => Math.min(times * 100, 3000),
  enableOfflineQueue: false,
  lazyConnect: true,
});

cache.on('error', (err: Error) => {
  console.error('Redis cache error:', err.message);
});

export async function cacheGet<T>(key: string): Promise<T | null> {
  const value = await cache.get(key);
  if (!value) return null;
  return JSON.parse(value) as T;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
  await cache.set(key, JSON.stringify(value), 'EX', ttlSeconds);
}

export async function cacheDel(key: string): Promise<void> {
  await cache.del(key);
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  const keys = await cache.keys(pattern);
  if (keys.length > 0) {
    await cache.del(...keys);
  }
}
