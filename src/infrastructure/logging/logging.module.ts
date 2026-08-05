import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppConfigModule } from '@infrastructure/config/config.module';
import { AppConfigService } from '@infrastructure/config/app-config.service';
import { RequestContextStore } from '@shared/context/request-context';
import { HEADER } from '@shared/constants/http.constants';

/**
 * Structured logging with Pino.
 *
 * Pino over Winston: it serialises to JSON in a worker-friendly way and is
 * roughly an order of magnitude faster per line. On a service doing thousands
 * of requests per second, logging is a real slice of the CPU budget, and Winston's
 * format pipeline shows up in profiles.
 *
 * Everything is JSON in production — one object per line, no multi-line stack
 * dumps that break log shippers. Development gets `pino-pretty`, which is
 * explicitly forbidden in production by the env schema.
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.logging.level,
          // `silent` in tests would still build the object; the level check
          // short-circuits before serialisation, so this is genuinely free.
          enabled: config.logging.level !== 'silent',

          // Correlates HTTP logs with the ALS context used everywhere else.
          genReqId: (req: IncomingMessage) =>
            RequestContextStore.requestId ?? req.headers[HEADER.REQUEST_ID]?.toString() ?? randomUUID(),

          /**
           * Injected into every line, so a query for one request id returns
           * everything that happened during it — including logs from services
           * that know nothing about HTTP.
           */
          customProps: () => {
            const context = RequestContextStore.get();
            if (!context) return {};
            return {
              correlationId: context.correlationId,
              userId: context.userId,
              tenantId: context.tenantId,
            };
          },

          // Health and metrics endpoints are polled constantly; at `info` they
          // would drown everything else. Errors on them still log.
          autoLogging: {
            ignore: (req: IncomingMessage) => {
              const url = req.url ?? '';
              return url.startsWith('/health') || url.startsWith(config.observability.metricsPath);
            },
          },

          customLogLevel: (_req, res: ServerResponse, error?: Error) => {
            if (error || res.statusCode >= 500) return 'error';
            if (res.statusCode >= 400) return 'warn';
            return 'info';
          },

          customSuccessMessage: (req: IncomingMessage, res: ServerResponse, responseTime: number) =>
            `${req.method} ${req.url} ${res.statusCode} ${responseTime}ms`,

          /**
           * Redaction is not optional. Authorization headers and cookies are
           * credentials: a log aggregator holding them is a credential store
           * with none of the controls of one.
           *
           * `remove: true` rather than `[Redacted]` so the keys do not even
           * hint at what was there.
           */
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-api-key"]',
              'req.headers["set-cookie"]',
              'res.headers["set-cookie"]',
              'req.body.password',
              'req.body.currentPassword',
              'req.body.newPassword',
              'req.body.refreshToken',
              'req.body.token',
              '*.passwordHash',
              '*.password',
              '*.refreshToken',
              '*.accessToken',
            ],
            remove: true,
          },

          serializers: {
            // The defaults log every header and the full body. That is both
            // noisy and a privacy problem; these keep what is useful for triage.
            req: (req: IncomingMessage & { id?: string; params?: unknown; query?: unknown }) => ({
              id: req.id,
              method: req.method,
              url: req.url,
              params: req.params,
              query: req.query,
              userAgent: req.headers['user-agent'],
              // Set by Express from X-Forwarded-For, honouring `trust proxy`.
              ip: (req as unknown as { ip?: string }).ip,
            }),
            res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
          },

          transport: config.logging.pretty
            ? {
                target: 'pino-pretty',
                options: { colorize: true, singleLine: false, translateTime: 'SYS:HH:MM:ss.l' },
              }
            : undefined,
        },
      }),
    }),
  ],
})
export class LoggingModule {}
