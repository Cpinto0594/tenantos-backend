import { Injectable } from '@nestjs/common';
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '@infrastructure/database/prisma.service';

/** A probe that hangs is worse than one that fails — it makes the pod look alive. */
const TIMEOUT_MS = 2_000;

@Injectable()
export class PrismaHealthIndicator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async check(key = 'database'): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    const startedAt = Date.now();

    try {
      // `SELECT 1` through the pool: proves the process can get a connection and
      // the server answers. Deliberately not a table read — a probe that
      // depends on application data fails for reasons that are not the
      // database's fault.
      await withTimeout(this.prisma.ping(), TIMEOUT_MS);
      return indicator.up({ responseTimeMs: Date.now() - startedAt });
    } catch (error) {
      return indicator.down({
        responseTimeMs: Date.now() - startedAt,
        // The probe response is not public, but it can end up in a dashboard,
        // so it carries a reason rather than the driver's full message.
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
      // Do not hold the event loop open on shutdown.
      timer.unref();
    }),
  ]);
}
