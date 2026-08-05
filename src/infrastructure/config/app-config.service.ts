import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Env } from './env.schema';

type Frozen<T> = Readonly<T>;

/**
 * Strongly typed façade over the validated environment.
 *
 * Consumers ask for a *concern* (`config.jwt`, `config.redis`) rather than a
 * variable name. That indirection is what "no magic strings" buys you: renaming
 * `JWT_ACCESS_TTL_S` touches this file and nothing else, and no service can
 * accidentally read a variable that was never validated.
 *
 * Every group is assembled once in the constructor and frozen. Config is read on
 * hot paths (every request logs, every login signs a token), so rebuilding
 * object literals per access would be pure garbage generation — and freezing
 * makes "someone mutated config at runtime" impossible rather than merely
 * unlikely.
 */
@Injectable()
export class AppConfigService {
  readonly nodeEnv: Env['NODE_ENV'];

  readonly app: Frozen<{
    name: string;
    port: number;
    host: string;
    apiPrefix: string;
    apiVersion: string;
    shutdownTimeoutMs: number;
    trustProxy: number;
  }>;

  readonly database: Frozen<{
    url: string;
    poolSize: number;
    connectTimeoutS: number;
    statementTimeoutMs: number;
    logQueries: boolean;
  }>;

  readonly redis: Frozen<{
    url: string;
    keyPrefix: string;
    tls: boolean;
    defaultTtlS: number;
  }>;

  readonly jwt: Frozen<{
    accessSecret: string;
    refreshSecret: string;
    accessTtlS: number;
    refreshTtlS: number;
    issuer: string;
    audience: string;
  }>;

  readonly argon2: Frozen<{ memoryCost: number; timeCost: number; parallelism: number }>;

  readonly cookies: Frozen<{
    enabled: boolean;
    domain: string | undefined;
    secure: boolean;
    sameSite: 'lax' | 'strict' | 'none';
  }>;

  readonly cors: Frozen<{ origins: string[]; credentials: boolean }>;

  readonly throttle: Frozen<{ ttlS: number; limit: number; authLimit: number }>;

  readonly logging: Frozen<{ level: Env['LOG_LEVEL']; pretty: boolean }>;

  readonly observability: Frozen<{
    metricsEnabled: boolean;
    metricsPath: string;
    swaggerEnabled: boolean;
    swaggerPath: string;
  }>;

  readonly websocket: Frozen<{ enabled: boolean; path: string; corsOrigins: string[] }>;

  constructor(private readonly configService: ConfigService<Env, true>) {
    const get = <K extends keyof Env>(key: K): Env[K] => this.configService.get(key, { infer: true });

    this.nodeEnv = get('NODE_ENV');

    this.app = Object.freeze({
      name: get('APP_NAME'),
      port: get('APP_PORT'),
      host: get('APP_HOST'),
      apiPrefix: get('API_PREFIX'),
      apiVersion: get('API_VERSION'),
      shutdownTimeoutMs: get('SHUTDOWN_TIMEOUT_MS'),
      trustProxy: get('TRUST_PROXY'),
    });

    this.database = Object.freeze({
      url: AppConfigService.buildDatabaseUrl(
        get('DATABASE_URL'),
        get('DATABASE_POOL_SIZE'),
        get('DATABASE_CONNECT_TIMEOUT_S'),
        get('DATABASE_STATEMENT_TIMEOUT_MS'),
      ),
      poolSize: get('DATABASE_POOL_SIZE'),
      connectTimeoutS: get('DATABASE_CONNECT_TIMEOUT_S'),
      statementTimeoutMs: get('DATABASE_STATEMENT_TIMEOUT_MS'),
      logQueries: get('DATABASE_LOG_QUERIES'),
    });

    this.redis = Object.freeze({
      url: get('REDIS_URL'),
      keyPrefix: get('REDIS_KEY_PREFIX'),
      tls: get('REDIS_TLS'),
      defaultTtlS: get('CACHE_DEFAULT_TTL_S'),
    });

    this.jwt = Object.freeze({
      accessSecret: get('JWT_ACCESS_SECRET'),
      refreshSecret: get('JWT_REFRESH_SECRET'),
      accessTtlS: get('JWT_ACCESS_TTL_S'),
      refreshTtlS: get('JWT_REFRESH_TTL_S'),
      issuer: get('JWT_ISSUER'),
      audience: get('JWT_AUDIENCE'),
    });

    this.argon2 = Object.freeze({
      memoryCost: get('ARGON2_MEMORY_COST_KIB'),
      timeCost: get('ARGON2_TIME_COST'),
      parallelism: get('ARGON2_PARALLELISM'),
    });

    this.cookies = Object.freeze({
      enabled: get('AUTH_COOKIE_ENABLED'),
      domain: get('AUTH_COOKIE_DOMAIN'),
      secure: get('AUTH_COOKIE_SECURE'),
      sameSite: get('AUTH_COOKIE_SAME_SITE'),
    });

    this.cors = Object.freeze({
      origins: Object.freeze([...get('CORS_ORIGINS')]) as string[],
      credentials: get('CORS_CREDENTIALS'),
    });

    this.throttle = Object.freeze({
      ttlS: get('THROTTLE_TTL_S'),
      limit: get('THROTTLE_LIMIT'),
      authLimit: get('AUTH_THROTTLE_LIMIT'),
    });

    this.logging = Object.freeze({
      level: get('LOG_LEVEL'),
      pretty: get('LOG_PRETTY'),
    });

    this.observability = Object.freeze({
      metricsEnabled: get('METRICS_ENABLED'),
      metricsPath: get('METRICS_PATH'),
      swaggerEnabled: get('SWAGGER_ENABLED'),
      swaggerPath: get('SWAGGER_PATH'),
    });

    const wsOrigins = get('WS_CORS_ORIGINS');
    this.websocket = Object.freeze({
      enabled: get('WS_ENABLED'),
      path: get('WS_PATH'),
      // WS origins fall back to the HTTP CORS list so there is one place to
      // configure "who may talk to us" in the common case.
      corsOrigins: Object.freeze(wsOrigins.length > 0 ? [...wsOrigins] : [...this.cors.origins]) as string[],
    });
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  }

  get isTest(): boolean {
    return this.nodeEnv === 'test';
  }

  /** `/api/v1` — the prefix every controller route is mounted behind. */
  get apiBasePath(): string {
    return `/${this.app.apiPrefix}/v${this.app.apiVersion}`;
  }

  /**
   * Prisma exposes no API for pool size or statement timeout — both are
   * connection-string parameters. Rather than making operators hand-encode
   * `?connection_limit=10&options=-c%20statement_timeout%3D15000`, we accept
   * plain variables and assemble the URL here.
   *
   * Anything already present in DATABASE_URL wins, so an operator can still
   * override any of it without a code change.
   */
  private static buildDatabaseUrl(
    rawUrl: string,
    poolSize: number,
    connectTimeoutS: number,
    statementTimeoutMs: number,
  ): string {
    const url = new URL(rawUrl);
    const params = url.searchParams;

    if (!params.has('connection_limit')) params.set('connection_limit', String(poolSize));
    if (!params.has('connect_timeout')) params.set('connect_timeout', String(connectTimeoutS));
    // How long a query waits for a free connection before failing. Failing fast
    // beats queueing forever behind a saturated pool and blowing the request
    // timeout instead.
    if (!params.has('pool_timeout')) params.set('pool_timeout', '10');
    // Server-side kill switch: a runaway query dies in Postgres rather than
    // holding a pooled connection hostage.
    if (!params.has('options')) params.set('options', `-c statement_timeout=${statementTimeoutMs}`);

    url.search = params.toString();
    return url.toString();
  }
}
