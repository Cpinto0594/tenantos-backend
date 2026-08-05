import { Injectable } from '@nestjs/common';
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus';
import { CacheService } from '@infrastructure/cache/cache.service';

const TIMEOUT_MS = 1_000;

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly cache: CacheService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async check(key = 'redis'): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    const startedAt = Date.now();

    try {
      await withTimeout(this.cache.ping(), TIMEOUT_MS);
      return indicator.up({ responseTimeMs: Date.now() - startedAt });
    } catch (error) {
      return indicator.down({
        responseTimeMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message.slice(0, 200) : 'unknown error',
      });
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`Health check timed out after ${ms}ms`)), ms);
      timer.unref();
    }),
  ]);
}
