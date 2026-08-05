import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { HealthCheck, HealthCheckService, type HealthCheckResult } from '@nestjs/terminus';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@modules/auth/decorators/public.decorator';
import { SkipEnvelope } from '@shared/decorators/skip-envelope.decorator';
import { PrismaHealthIndicator } from './indicators/prisma.indicator';
import { RedisHealthIndicator } from './indicators/redis.indicator';

/**
 * Probe endpoints.
 *
 * The liveness/readiness split is the part people get wrong, and getting it
 * wrong takes down a healthy service:
 *
 *  - **Liveness** answers "is this process wedged?" and must depend on nothing
 *    external. If it checked the database, a database blip would fail liveness,
 *    Kubernetes would kill every pod, and the restarts would add load to an
 *    already-struggling database — turning a partial outage into a total one.
 *
 *  - **Readiness** answers "can this instance serve traffic right now?" and
 *    therefore *does* check dependencies. A failing readiness probe removes the
 *    pod from the load balancer without killing it, so it can recover and come
 *    back on its own.
 *
 * All three are `@Public()` — a probe that needs a token is a probe that fails
 * during an auth outage — and `@SkipEnvelope()`, because Kubernetes and uptime
 * checkers expect Terminus's schema, not our wrapper.
 */
@ApiTags('health')
// VERSION_NEUTRAL as well as being excluded from the global prefix in main.ts.
// Excluding the prefix alone is not enough: URI versioning still prepends `/v1`,
// so the probes would move every time the API version changes — and an
// orchestrator's probe URLs are configured far away from this code.
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Public()
  @SkipEnvelope()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Full health check — every dependency' })
  async check(): Promise<HealthCheckResult> {
    return this.health.check([() => this.prisma.check(), () => this.redis.check()]);
  }

  @Public()
  @SkipEnvelope()
  @Get('live')
  @ApiExcludeEndpoint()
  liveness(): { status: string; uptime: number } {
    // No I/O by design. If the event loop can run this handler, the process is
    // alive; anything else belongs in readiness.
    return { status: 'ok', uptime: Math.floor(process.uptime()) };
  }

  @Public()
  @SkipEnvelope()
  @Get('ready')
  @HealthCheck()
  @ApiExcludeEndpoint()
  async readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.prisma.check(),
      // Redis counts: the token denylist fails closed, so an instance that
      // cannot reach Redis would reject every authenticated request. Better to
      // take it out of rotation than to serve 401s.
      () => this.redis.check(),
    ]);
  }
}
