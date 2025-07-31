import { createClient } from 'redis';

let redis: ReturnType<typeof createClient> | null = null;

export async function getRedis() {
  if (!redis) {
    redis = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    
    redis.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });
    
    await redis.connect();
  }
  
  return redis;
}

export async function closeRedis() {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

// Cache utilities
export async function setCache(key: string, value: any, ttlSeconds: number) {
  const client = await getRedis();
  await client.setEx(key, ttlSeconds, JSON.stringify(value));
}

export async function getCache<T = any>(key: string): Promise<T | null> {
  const client = await getRedis();
  const value = await client.get(key);
  return value ? JSON.parse(value) : null;
}

export async function deleteCache(key: string) {
  const client = await getRedis();
  await client.del(key);
}

export async function existsCache(key: string): Promise<boolean> {
  const client = await getRedis();
  return (await client.exists(key)) === 1;
}