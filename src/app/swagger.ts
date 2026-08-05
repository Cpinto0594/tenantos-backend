import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { AppConfigService } from '@infrastructure/config/app-config.service';

/**
 * OpenAPI document.
 *
 * Gated behind `SWAGGER_ENABLED`, which defaults to off in test and should be
 * off in production unless the API is genuinely public: the schema enumerates
 * every route, parameter and error code, which is a map for anyone probing the
 * service. When it is needed in production, put it behind the same ingress
 * restrictions as `/metrics`.
 */
export function setupSwagger(app: INestApplication, config: AppConfigService): void {
  if (!config.observability.swaggerEnabled) return;

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('TenantOS API')
      .setDescription(
        [
          'Multi-tenant backend for TenantOS.',
          '',
          '**Responses** are enveloped: `{ success, data, traceId, timestamp }` on success and',
          '`{ success, message, errorCode, traceId, timestamp }` on failure. Branch on `errorCode`,',
          'never on `message` — the codes are part of the contract, the prose is not.',
          '',
          '**Authentication** is a Bearer access token, or an HttpOnly cookie pair when the client is',
          'a browser. Access tokens are short-lived; refresh tokens rotate on every use and reuse',
          'revokes the whole session. See docs/AUTH.md.',
          '',
          '**Pagination** is offset-based by default and keyset-based when you pass `cursor`. Use the',
          'cursor form for anything that iterates a whole collection.',
          '',
          '**Idempotency**: POST endpoints are not idempotent unless documented as such. Retrying a',
          'failed POST may create a second resource; the client-side ids the API accepts are the',
          'intended way to make retries safe.',
        ].join('\n'),
      )
      .setVersion(config.app.apiVersion)
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Access token from /auth/login' },
        'bearer',
      )
      .addCookieAuth('tos_at', { type: 'apiKey', in: 'cookie' }, 'cookie')
      .addServer(config.apiBasePath, 'Current version')
      .addTag('auth', 'Sign in, refresh, sessions')
      .addTag('users', 'User management')
      .addTag('tenants', 'Workspaces and membership')
      .addTag('health', 'Liveness and readiness probes')
      .build(),
    {
      // Stable operation ids, so a generated client does not rename every
      // method when a controller is refactored.
      operationIdFactory: (controllerKey: string, methodKey: string) =>
        `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
    },
  );

  SwaggerModule.setup(config.observability.swaggerPath, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      docExpansion: 'none',
    },
    customSiteTitle: 'TenantOS API',
  });
}
