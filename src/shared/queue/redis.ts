import { Redis } from 'ioredis';
import { env } from '../../config/env.js';

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(env.UPSTASH_REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      tls: {},
    });
  }
  return _redis;
}

export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    return Reflect.get(getRedis(), prop);
  },
}) as Redis;

export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}
