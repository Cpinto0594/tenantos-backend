import { Logger, type Provider } from '@nestjs/common';
import Redis, { type RedisOptions } from 'ioredis';
import { AppConfigService } from '@infrastructure/config/app-config.service';

export const REDIS_CLIENT = Symbol('RedisClient');
/** Dedicated connections for the Socket.IO adapter — see the note below. */
export const REDIS_PUBLISHER = Symbol('RedisPublisher');
export const REDIS_SUBSCRIBER = Symbol('RedisSubscriber');

const logger = new Logger('Redis');

function buildOptions(config: AppConfigService, role: string): RedisOptions {
  return {
    // Namespaced so several environments can share one Redis without one
    // flushing the other's keys.
    keyPrefix: `${config.redis.keyPrefix}:`,
    ...(config.redis.tls ? { tls: {} } : {}),

    // The offline queue stays on. Turning it off looks appealing ("fail fast
    // instead of queueing behind a dead server") but it also rejects the
    // commands issued in the few milliseconds between process start and the
    // TCP handshake completing — which at boot means the throttler and the
    // Socket.IO adapter blow up before Redis is even reachable.
    //
    // `commandTimeout` provides the fail-fast property instead, without the
    // startup race: a queued command rejects after 2s rather than waiting
    // indefinitely, and the cache layer treats that as a miss.
    enableOfflineQueue: true,
    maxRetriesPerRequest: 2,
    connectTimeout: 5_000,
    commandTimeout: 2_000,

    // Exponential backoff, capped. Reconnecting in a tight loop against a
    // recovering Redis is how you keep it down.
    retryStrategy: (times) => Math.min(times * 200, 5_000),

    // A failover leaves the old primary read-only; reconnecting is the only
    // way to reach the new one.
    reconnectOnError: (error) => error.message.includes('READONLY'),

    lazyConnect: false,
    connectionName: `${config.app.name}:${role}`,
  };
}

function createClient(config: AppConfigService, role: string): Redis {
  const client = new Redis(config.redis.url, buildOptions(config, role));

  client.on('error', (error: Error) => {
    // Every reconnect attempt fires this. Logged at warn, not error, because
    // Redis being briefly unreachable is survivable — the app degrades rather
    // than fails.
    logger.warn(`Redis (${role}) error: ${error.message}`);
  });
  client.on('connect', () => logger.log(`Redis (${role}) connected`));
  client.on('reconnecting', () => logger.warn(`Redis (${role}) reconnecting`));

  return client;
}

/**
 * Three connections, not one, and the split is required rather than an
 * optimisation:
 *
 *  - `REDIS_CLIENT` handles normal commands (cache, denylist, throttling).
 *  - `REDIS_SUBSCRIBER` is in subscriber mode. Redis forbids ordinary commands
 *    on a subscribed connection, so it cannot be shared.
 *  - `REDIS_PUBLISHER` is separate from the command client so that a burst of
 *    WebSocket fan-out cannot sit in front of a cache GET in the same pipeline.
 */
export const redisProviders: Provider[] = [
  {
    provide: REDIS_CLIENT,
    inject: [AppConfigService],
    useFactory: (config: AppConfigService) => createClient(config, 'commands'),
  },
  {
    provide: REDIS_PUBLISHER,
    inject: [AppConfigService],
    useFactory: (config: AppConfigService) => createClient(config, 'pub'),
  },
  {
    provide: REDIS_SUBSCRIBER,
    inject: [AppConfigService],
    useFactory: (config: AppConfigService) => createClient(config, 'sub'),
  },
];
