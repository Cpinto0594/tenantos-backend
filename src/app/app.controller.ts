import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppConfigService } from '@infrastructure/config/app-config.service';
import { Public } from '@modules/auth/decorators/public.decorator';

class ServiceInfoResponse {
  name!: string;
  version!: string;
  environment!: string;
  documentation!: string | null;
}

/**
 * Service root. Exists so that hitting the base URL returns something useful
 * instead of a 404 — mostly for humans checking that they have the right host
 * and version deployed.
 *
 * Note what it does *not* return: no dependency status, no build hashes, no
 * hostname. That is reconnaissance for anyone probing the service, and the
 * information belongs on the internal health and metrics endpoints.
 */
@ApiTags('meta')
@Controller()
@SkipThrottle({ auth: true })
export class AppController {
  constructor(private readonly config: AppConfigService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Service information' })
  @ApiOkResponse({ type: ServiceInfoResponse })
  info(): ServiceInfoResponse {
    return {
      name: this.config.app.name,
      version: this.config.app.apiVersion,
      environment: this.config.nodeEnv,
      documentation: this.config.observability.swaggerEnabled
        ? `/${this.config.observability.swaggerPath}`
        : null,
    };
  }
}
