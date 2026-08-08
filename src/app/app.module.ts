import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from '@infrastructure/config/config.module';
import { AppConfigService } from '@infrastructure/config/app-config.service';
import { CacheModule } from '@infrastructure/cache/cache.module';
import { DatabaseModule } from '@infrastructure/database/database.module';
import { LoggingModule } from '@infrastructure/logging/logging.module';
import { MetricsModule } from '@infrastructure/observability/metrics.module';
import { MetricsInterceptor } from '@infrastructure/observability/metrics.interceptor';
import { RedisThrottlerStorage } from '@infrastructure/security/redis-throttler.storage';
import { SecurityModule } from '@infrastructure/security/security.module';
import { ThrottlerStorageModule } from '@infrastructure/security/throttler-storage.module';
import { AuthModule } from '@modules/auth/auth.module';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { ConnectionModule } from '@modules/connection/connection.module';
import { ExecutionModule } from '@modules/execution/execution.module';
import { FolderModule } from '@modules/folder/folder.module';
import { HealthModule } from '@modules/health/health.module';
import { NamespaceModule } from '@modules/namespace/namespace.module';
import { ScheduleModule } from '@modules/schedule/schedule.module';
import { VariableModule } from '@modules/variable/variable.module';
import { WebhookModule } from '@modules/webhook/webhook.module';
import { WebsocketModule } from '@modules/websocket/websocket.module';
import { WorkflowModule } from '@modules/workflow/workflow.module';
import { WorkspaceModule } from '@modules/workspace/workspace.module';
import { RequestContextMiddleware } from '@shared/context/request-context.middleware';
import { GlobalExceptionFilter } from '@shared/filters/global-exception.filter';
import { ThrottlerBehindProxyGuard } from '@shared/guards/throttler-proxy.guard';
import { ResponseEnvelopeInterceptor } from '@shared/interceptors/response-envelope.interceptor';
import { TimeoutInterceptor } from '@shared/interceptors/timeout.interceptor';
import { AppController } from './app.controller';

/**
 * Composition root.
 *
 * Everything cross-cutting is registered here exactly once, so no controller
 * has to remember to opt in. The ordering below is not cosmetic — see the notes
 * on each block.
 */
@Module({
  imports: [
    // Config first: every other module's factory reads from it.
    AppConfigModule,
    LoggingModule,
    DatabaseModule,
    CacheModule,
    SecurityModule,
    MetricsModule,

    ThrottlerModule.forRootAsync({
      imports: [ThrottlerStorageModule],
      inject: [AppConfigService, RedisThrottlerStorage],
      useFactory: (config: AppConfigService, storage: RedisThrottlerStorage) => ({
        // Shared counters across replicas — see RedisThrottlerStorage for why
        // the in-memory default silently multiplies every limit by the replica
        // count.
        storage,
        throttlers: [
          { name: 'default', ttl: config.throttle.ttlS * 1000, limit: config.throttle.limit },
          // A second, tighter bucket that auth routes opt into with
          // `@Throttle({ auth: ... })`.
          { name: 'auth', ttl: config.throttle.ttlS * 1000, limit: config.throttle.authLimit },
        ],
        // Probes are polled every few seconds by the orchestrator; throttling
        // them would flap the pod out of rotation.
        skipIf: (context) => {
          const request = context.switchToHttp().getRequest<{ url?: string }>();
          return request.url?.startsWith('/health') ?? false;
        },
      }),
    }),

    AuthModule,
    HealthModule,
    WebsocketModule,

    // Workflow resources. Read-only for now — one list endpoint each.
    WorkspaceModule,
    FolderModule,
    WorkflowModule,
    VariableModule,
    ConnectionModule,
    WebhookModule,
    ScheduleModule,
    ExecutionModule,

    // Reads across the three above, scoped to the signed-in user.
    NamespaceModule,
  ],
  controllers: [AppController],
  providers: [
    // --- Guards, in execution order -----------------------------------------
    // Rate limiting first: a request that will be rejected anyway should not
    // cost a token verification and a database read.
    { provide: APP_GUARD, useClass: ThrottlerBehindProxyGuard },
    // Then authentication (who are you), then authorization (may you).
    { provide: APP_GUARD, useClass: JwtAuthGuard },

    // --- Interceptors -------------------------------------------------------
    // Outermost first. Metrics wraps everything so it observes the true
    // end-to-end latency, including time spent in the interceptors below it.
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    {
      provide: APP_INTERCEPTOR,
      // Innermost: the timeout should measure the handler, not the queueing in
      // front of it.
      useFactory: () => new TimeoutInterceptor(30_000),
    },

    // --- Filters ------------------------------------------------------------
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Must run before everything else: it opens the AsyncLocalStorage scope
    // that request ids, correlation ids and the authenticated principal live
    // in. Anything executing earlier logs without them.
    consumer.apply(RequestContextMiddleware).forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
