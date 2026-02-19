export type RedisConnectionOptions =
  | { url: string }
  | { host: string; port: number; password?: string };

/** Ensure Redis URL has a scheme so ioredis/BullMQ don't treat it as a path (ENOENT). */
function normalizeRedisUrl(url: string): string {
  const u = url.trim();
  if (u.startsWith("redis://") || u.startsWith("rediss://")) return u;
  if (u.startsWith("//")) return `rediss:${u}`;
  return `rediss://${u}`;
}

export function getRedisConnectionOptions(): RedisConnectionOptions {
  const redisUrlRaw = process.env.REDIS_URL;
  const redisHost = process.env.REDIS_HOST ?? "localhost";
  const redisPort = parseInt(process.env.REDIS_PORT ?? "6379", 10);
  const redisPassword = process.env.REDIS_PASSWORD;

  if (redisUrlRaw) {
    return { url: normalizeRedisUrl(redisUrlRaw) };
  }

  const config: { host: string; port: number; password?: string } = {
    host: redisHost,
    port: redisPort,
  };
  if (redisPassword) {
    config.password = redisPassword;
  }
  return config;
}
