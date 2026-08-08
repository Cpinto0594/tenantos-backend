import 'reflect-metadata';
import {
  HttpStatus,
  RequestMethod,
  UnprocessableEntityException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger, PinoLogger } from 'nestjs-pino';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from '@app/app.module';
import { setupSwagger } from '@app/swagger';
import { AppConfigService } from '@infrastructure/config/app-config.service';
import { RedisIoAdapter } from '@modules/websocket/redis-io.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Hold startup logs until Pino is available, so boot output is structured
    // like everything else instead of Nest's default format.
    bufferLogs: true,
    // The global filter handles every error; Nest's own body-parser errors
    // still need to reach it, which they do through the same pipeline.
    abortOnError: false,
  });

  const config = app.get(AppConfigService);
  app.useLogger(app.get(Logger));

  // --- Behind a proxy --------------------------------------------------------
  // A specific hop count, never `true`. Trusting the entire X-Forwarded-For
  // chain lets a client prepend a forged address and defeat both rate limiting
  // and audit logging.
  app.set('trust proxy', config.app.trustProxy);
  // Advertising the framework and version is free reconnaissance.
  app.disable('x-powered-by');

  // --- Security headers ------------------------------------------------------
  app.use(
    helmet({
      // A JSON API serves no HTML, so the CSP only has to be restrictive
      // enough that a browser rendering an error page cannot be made to
      // execute anything.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      // Tells browsers to use HTTPS for a year. Only meaningful over TLS, and
      // enabling it in development would poison localhost in the developer's
      // browser for a year.
      hsts: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  // --- CORS ------------------------------------------------------------------
  app.enableCors({
    // An explicit allow-list from config. The env schema rejects `*` and
    // plaintext origins in production — `*` with credentials is refused by
    // browsers anyway, and silently breaks auth for everyone.
    origin: config.cors.origins,
    credentials: config.cors.credentials,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Correlation-Id', 'Idempotency-Key'],
    exposedHeaders: ['X-Request-Id', 'X-Correlation-Id', 'X-Response-Time', 'Retry-After'],
    maxAge: 86_400,
  });

  // --- Body parsing ----------------------------------------------------------
  // A cap on request size: without one, a single request can pin a worker's
  // memory. 1 MB is generous for a JSON API; file uploads should go to object
  // storage directly, not through this process.
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: true });

  app.use(cookieParser());
  app.use(
    compression({
      // Below ~1 KB, compression costs more CPU and latency than the bytes it
      // saves.
      threshold: 1024,
      // Lets a client opt out — useful for streaming endpoints where buffering
      // for compression defeats the point.
      filter: (req, res) => (req.headers['x-no-compression'] ? false : compression.filter(req, res)),
    }),
  );

  // --- Routing ---------------------------------------------------------------
  app.setGlobalPrefix(config.app.apiPrefix, {
    // Probes and metrics live outside the versioned API: an orchestrator should
    // not have to be reconfigured when the API version changes.
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
      { path: 'metrics', method: RequestMethod.GET },
    ],
  });
  // URI versioning: the version is in the path (`/api/v1/users`). Chosen over
  // header versioning because it is visible in logs, browsable, and cacheable
  // by URL — a proxy cannot accidentally serve a v1 response to a v2 client.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: config.app.apiVersion });

  // --- Validation ------------------------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      // Strips properties with no decorator. Without it, a client can set any
      // field it likes on a DTO and hope something downstream reads it.
      whitelist: true,
      // And rejects them loudly rather than silently, so a client sending
      // `isAdmin: true` gets told no instead of wondering why it did nothing.
      forbidNonWhitelisted: true,
      // Runs @Type/@Transform, turning query strings into numbers and enums.
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      // 422 rather than 400: the request was syntactically valid JSON that
      // failed semantic validation, and the distinction lets clients tell a
      // malformed body from an invalid one.
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      // In production, the message is a code, not a description of the schema —
      // detailed validation errors enumerate internal field names.
      disableErrorMessages: false,
      exceptionFactory: (errors) =>
        new UnprocessableEntityException(errors.flatMap((error) => Object.values(error.constraints ?? {}))),
    }),
  );

  // --- WebSockets ------------------------------------------------------------
  if (config.websocket.enabled) {
    const adapter = new RedisIoAdapter(app);
    adapter.connect();
    app.useWebSocketAdapter(adapter);
  }

  setupSwagger(app, config);

  // --- Shutdown --------------------------------------------------------------
  // Runs onModuleDestroy/onApplicationShutdown across the graph, closing the
  // Prisma pool and the Redis connections in dependency order.
  app.enableShutdownHooks();
  await installGracefulShutdown(app, config);

  await app.listen(config.app.port, config.app.host);

  const logger = app.get(Logger);
  logger.log(
    `${config.app.name} listening on ${config.app.host}:${config.app.port}${config.apiBasePath} ` +
      `[${config.nodeEnv}]`,
  );
}

/**
 * Graceful shutdown.
 *
 * On SIGTERM (what an orchestrator sends before killing a pod) the process must
 * stop accepting new connections, finish the requests already in flight, and
 * close its pools. Exiting immediately drops those requests — which, during a
 * rolling deploy, means a burst of 502s on every release.
 *
 * The timeout is the backstop: if something never finishes, we exit anyway
 * rather than hanging until the orchestrator sends SIGKILL, which would drop
 * the in-flight work *and* skip cleanup.
 */
async function installGracefulShutdown(app: NestExpressApplication, config: AppConfigService): Promise<void> {
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    // A second Ctrl-C should exit now, not queue another shutdown.
    if (shuttingDown) {
      process.exit(1);
    }
    shuttingDown = true;

    const logger = app.get(Logger);
    logger.log(`${signal} received — draining (timeout ${config.app.shutdownTimeoutMs}ms)`);

    const timer = setTimeout(() => {
      logger.error('Shutdown timed out with work still in flight — exiting anyway');
      process.exit(1);
    }, config.app.shutdownTimeoutMs);
    timer.unref();

    void app
      .close()
      .then(() => {
        logger.log('Shutdown complete');
        process.exit(0);
      })
      .catch((error: unknown) => {
        logger.error(`Error during shutdown: ${String(error)}`);
        process.exit(1);
      });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // The crash handlers below log through Pino rather than console.error, which
  // bypasses the framing and redaction every other line goes through and prints
  // its own multi-line dump.
  //
  // PinoLogger rather than the Nest `Logger` used above: only its native
  // `(mergingObject, message)` signature carries both a message and the error —
  // `Logger.error(obj, msg)` reads that second argument as the context name, so
  // the message would silently land in the wrong field. It is transient, hence
  // resolved once up front: the handlers themselves are synchronous, and a
  // crashing process is the worst possible moment to await anything.
  const crashLogger = await app.resolve(PinoLogger);
  crashLogger.setContext('bootstrap');

  // A process with an unhandled rejection is in an undefined state. Crashing is
  // honest: the orchestrator restarts it, and the alternative is serving
  // traffic from a process whose invariants may no longer hold.
  process.on('unhandledRejection', (reason) => {
    crashLogger.error({ err: reason }, 'Unhandled promise rejection');
    shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (error) => {
    crashLogger.error({ err: error }, 'Uncaught exception');
    shutdown('uncaughtException');
  });
}

void bootstrap();
