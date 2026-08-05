import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type Redis from 'ioredis';
import { CacheService } from './cache.service';
import { HttpCacheInterceptor } from './http-cache.interceptor';
import { REDIS_CLIENT, REDIS_PUBLISHER, REDIS_SUBSCRIBER, redisProviders } from './redis.provider';

/**
 * Owns the Redis connections and everything built on them.
 *
 * Global, like the database module: cache is cross-cutting, and the connections
 * are process-wide singletons.
 */
@Global()
@Module({
  providers: [...redisProviders, CacheService, HttpCacheInterceptor],
  exports: [CacheService, HttpCacheInterceptor, REDIS_CLIENT, REDIS_PUBLISHER, REDIS_SUBSCRIBER],
})
export class CacheModule implements OnApplicationShutdown {
  constructor(private readonly moduleRef: ModuleRef) {}

  /**
   * `quit()` rather than `disconnect()`: it drains commands already in flight
   * and closes the socket politely, so a rolling deploy does not leave the
   * server with half-written pipelines.
   */
  async onApplicationShutdown(): Promise<void> {
    const clients = [REDIS_CLIENT, REDIS_PUBLISHER, REDIS_SUBSCRIBER].map((token) =>
      this.moduleRef.get<Redis>(token, { strict: false }),
    );

    await Promise.allSettled(clients.map((client) => client.quit()));
  }
}
