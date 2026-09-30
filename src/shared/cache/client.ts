import { Redis } from 'ioredis';
import { env } from '../../config/env.js';

let _cache: Redis | null = null;
let _redisAvailable = false;

function getCache(): Redis {
  if (!_cache) {
    _cache = new Redis(env.REDIS_URL, {
      db: 0,
      maxRetriesPerRequest: 3,
      // Stop retrying after ~30 s so the process doesn't spin forever on a
      // permanently unreachable host (e.g. deleted Upstash instance).
      retryStrategy: (times: number) => (times > 10 ? null : Math.min(times * 200, 3000)),
      enableOfflineQueue: false,
      lazyConnect: true,
    });

    _cache.on('ready', () => {
      _redisAvailable = true;
    });

    _cache.on('error', (err: Error) => {
      _redisAvailable = false;
      // Log once per error type, not on every retry tick
      console.error('Redis cache error:', err.message);
    });

    _cache.on('close', () => {
      _redisAvailable = false;
    });

    // Kick off the connection attempt in the background — never await this so
    // a DNS failure doesn't block the server from starting.
    void _cache.connect().catch(() => undefined);
  }
  return _cache;
}

// Exported for health checks and graceful shutdown
export const cache = new Proxy({} as Redis, {
  get(_target, prop) {
    return (getCache() as unknown as Record<string, unknown>)[prop as string];
  },
});

export function isRedisAvailable(): boolean {
  // The connection is lazy — make sure an attempt has been started, otherwise
  // callers that gate on this flag would never trigger it.
  getCache();
  return _redisAvailable;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!isRedisAvailable()) return null;
  try {
    const value = await getCache().get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
  if (!isRedisAvailable()) return;
  try {
    await getCache().set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Cache write failure is non-fatal
  }
}

export async function cacheDel(key: string): Promise<void> {
  if (!isRedisAvailable()) return;
  try {
    await getCache().del(key);
  } catch {
    // Cache delete failure is non-fatal
  }
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  if (!isRedisAvailable()) return;
  try {
    const stream = getCache().scanStream({ match: pattern, count: 100 }) as AsyncIterable<string[]>;
    for await (const keys of stream) {
      if (keys.length > 0) {
        await getCache().del(...keys);
      }
    }
  } catch {
    // Cache pattern delete failure is non-fatal
  }
}
