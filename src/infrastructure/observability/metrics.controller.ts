import { Controller, ForbiddenException, Get, Header, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { AppConfigService } from '@infrastructure/config/app-config.service';
import { Public } from '@modules/auth/decorators/public.decorator';
import { SkipEnvelope } from '@shared/decorators/skip-envelope.decorator';
import { MetricsService } from './metrics.service';

/**
 * Prometheus scrape endpoint.
 *
 * Public because Prometheus does not authenticate, and excluded from Swagger
 * because its consumer is a scraper, not a developer.
 *
 * **This must not be reachable from the internet.** The output enumerates every
 * route, error rate and internal timing in the service — a free map for anyone
 * probing it. Bind it to an internal network, or restrict it at the ingress.
 * See docs/DEPLOYMENT.md.
 */
@ApiExcludeController()
// Version-neutral, like the health probes: a Prometheus scrape config should
// not have to be updated when the API version changes.
@Controller({ version: VERSION_NEUTRAL })
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @SkipEnvelope()
  @Get('metrics')
  @Header('Cache-Control', 'no-store')
  async scrape(@Res({ passthrough: true }) response: Response): Promise<string> {
    if (!this.config.observability.metricsEnabled) {
      throw new ForbiddenException('Metrics are disabled');
    }

    // Prometheus text exposition format — not JSON, hence @SkipEnvelope.
    response.setHeader('Content-Type', this.metrics.contentType);
    return this.metrics.scrape();
  }
}
