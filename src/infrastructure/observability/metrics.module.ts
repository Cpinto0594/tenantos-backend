import { Global, Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsService } from './metrics.service';

/**
 * Global so any service can record a domain metric (`authAttemptsTotal`,
 * `cacheOperationsTotal`) without importing this module.
 *
 * The scrape path is configurable, but the controller is mounted at a fixed
 * `/metrics` outside the API prefix — see `main.ts`, which excludes it from the
 * global prefix so a scraper does not have to know the API version.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, MetricsInterceptor],
  exports: [MetricsService, MetricsInterceptor],
})
export class MetricsModule {}
