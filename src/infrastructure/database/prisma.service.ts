import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PinoLogger } from 'nestjs-pino';
import { AppConfigService } from '@infrastructure/config/app-config.service';
import { InfrastructureError } from '@shared/errors/infrastructure-error';

/** Queries slower than this are logged with their SQL. Tune per workload. */
const SLOW_QUERY_MS = 200;

type LogEvents = 'query' | 'warn' | 'error';

/**
 * Owns the Prisma client: connection lifecycle, transaction propagation, and
 * query observability in one place.
 *
 * **Composition, not inheritance.** The obvious implementation is
 * `class PrismaService extends PrismaClient`, and it is subtly broken: Prisma
 * returns a Proxy from its constructor, and the model delegates (`user`,
 * `tenant`, …) live on that proxy rather than on the instance. Inside a
 * subclass method `this` is the underlying target, so `this.user` is
 * `undefined` — at runtime only, with types that compile perfectly. Holding the
 * client as a field sidesteps it entirely, and has the independent benefit of
 * not exposing all 40-odd `$`-methods as part of this service's API.
 *
 * Pooling: Prisma maintains its own pool, sized by `connection_limit` in the
 * URL (assembled by AppConfigService). The number that matters is
 * `replicas × connection_limit ≤ Postgres max_connections`, which is why the
 * limit is per-instance configuration rather than a constant. Beyond a handful
 * of replicas, put PgBouncer in transaction mode in front and drop the limit —
 * see docs/DEPLOYMENT.md.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly prisma: PrismaClient<Prisma.PrismaClientOptions, LogEvents>;

  /**
   * Carries the active transaction client down the call stack so repositories
   * enlist automatically. The alternative — threading a `tx` parameter through
   * every repository method — pollutes every signature in the app and is
   * forgotten exactly once before it causes a partial write.
   */
  private readonly transactionStore = new AsyncLocalStorage<Prisma.TransactionClient>();

  constructor(
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PrismaService.name);

    this.prisma = new PrismaClient<Prisma.PrismaClientOptions, LogEvents>({
      datasources: { db: { url: config.database.url } },
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
      // `minimal` keeps table structure and row values out of error messages,
      // which matters because those messages reach logs and, if anything is
      // mishandled upstream, clients.
      //
      // Every environment, not just production: `pretty` renders a code frame
      // with carets into the message *string*, so the message is already
      // several lines before Pino sees it and no log formatting can undo that.
      // The cost is losing that code frame in development; the message and the
      // Prisma error code survive, which is what triage actually reads.
      errorFormat: 'minimal',
    });

    this.registerLogHandlers();
  }

  /**
   * The client every repository should use. Returns the ambient transaction
   * when inside `runInTransaction`, otherwise the pooled client.
   */
  get client(): Prisma.TransactionClient {
    return this.transactionStore.getStore() ?? this.prisma;
  }

  async onModuleInit(): Promise<void> {
    // Connect eagerly rather than on first query: a bad DATABASE_URL should
    // fail at boot, before the readiness probe passes and traffic arrives.
    try {
      await this.prisma.$connect();
      this.logger.info('Database connection established');
    } catch (error) {
      throw InfrastructureError.database('Failed to connect to the database at startup', error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
    this.logger.info('Database connection closed');
  }

  /**
   * Runs `fn` inside a transaction, with every repository call it makes
   * enlisted automatically.
   *
   * Re-entrant: calling it while already inside a transaction joins the outer
   * one rather than opening a nested — and therefore independently committable
   * — second transaction.
   *
   * Keep the callback short. It holds a pooled connection for its whole
   * duration, so an HTTP call or a password hash inside a transaction will
   * exhaust the pool under load.
   */
  async runInTransaction<T>(
    fn: () => Promise<T>,
    options?: { timeoutMs?: number; maxWaitMs?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T> {
    if (this.transactionStore.getStore()) return fn();

    return this.prisma.$transaction(async (tx) => this.transactionStore.run(tx, fn), {
      timeout: options?.timeoutMs ?? 10_000,
      maxWait: options?.maxWaitMs ?? 5_000,
      ...(options?.isolationLevel ? { isolationLevel: options.isolationLevel } : {}),
    });
  }

  /** Cheap readiness probe: round-trips to Postgres through the pool. */
  async ping(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }

  private registerLogHandlers(): void {
    this.prisma.$on('error', (event) => {
      this.logger.error({ target: event.target }, event.message);
    });

    this.prisma.$on('warn', (event) => {
      this.logger.warn({ target: event.target }, event.message);
    });

    this.prisma.$on('query', (event) => {
      // Full query logging is opt-in and forbidden in production by the env
      // schema: `params` contains row data, including password hashes.
      if (this.config.database.logQueries) {
        this.logger.debug(
          { query: event.query, params: event.params, durationMs: event.duration },
          'prisma query',
        );
        return;
      }

      // Slow queries are always worth knowing about. Params are omitted so this
      // stays safe to leave on in production.
      if (event.duration >= SLOW_QUERY_MS) {
        this.logger.warn({ query: event.query, durationMs: event.duration }, 'Slow query');
      }
    });
  }
}
