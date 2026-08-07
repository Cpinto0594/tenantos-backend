import { z } from 'zod';

/**
 * The single source of truth for every environment variable this service reads.
 *
 * Nothing else in the codebase may touch `process.env` — the ESLint config and
 * code review enforce that. The payoff is that a misconfigured deployment dies
 * at boot with a precise message instead of at 3am with a `undefined is not a
 * function` deep inside a request handler.
 *
 * Design notes:
 *  - Everything arrives as a string. Coercion lives here, so the rest of the app
 *    consumes real `number`/`boolean`/`string[]` values.
 *  - Defaults are development-shaped. Production-only invariants are enforced in
 *    the `superRefine` at the bottom rather than by making fields required,
 *    which keeps local setup to "copy .env.example".
 */

/** Accepts the spellings people actually write in a .env file. */
const booleanish = (defaultValue: boolean) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .default(String(defaultValue))
    .refine((v) => ['true', 'false', '1', '0', 'yes', 'no', 'on', 'off'].includes(v), {
      message: 'must be a boolean (true/false, 1/0, yes/no, on/off)',
    })
    .transform((v) => ['true', '1', 'yes', 'on'].includes(v));

/** Comma-separated list -> trimmed, de-duplicated, empty entries dropped. */
const csv = (defaultValue = '') =>
  z
    .string()
    .default(defaultValue)
    .transform((v) => [
      ...new Set(
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ]);

const port = z.coerce.number().int().min(1).max(65_535);
const positiveInt = z.coerce.number().int().positive();

/** Secrets must be long enough that a dictionary attack on the JWT is pointless. */
const secret = z.string().min(32, 'must be at least 32 characters — generate with `openssl rand -base64 48`');

const PLACEHOLDER_SECRET_MARKERS = ['change-me', 'dev-only', 'test-only', 'secret', 'password'];

export const envSchema = z
  .object({
    // --- Application ---------------------------------------------------------
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_NAME: z.string().min(1).default('tenantos-backend'),
    APP_PORT: port.default(3000),
    APP_HOST: z.string().min(1).default('0.0.0.0'),
    API_PREFIX: z
      .string()
      .default('api')
      .transform((v) => v.replace(/^\/+|\/+$/g, '')),
    API_VERSION: z.string().regex(/^\d+$/, 'must be a whole number').default('1'),
    SHUTDOWN_TIMEOUT_MS: positiveInt.max(120_000).default(10_000),

    // --- Database ------------------------------------------------------------
    DATABASE_URL: z
      .string()
      .url('must be a valid URL')
      .refine((v) => v.startsWith('postgres://') || v.startsWith('postgresql://'), {
        message: 'must be a postgres:// or postgresql:// connection string',
      }),
    DATABASE_POOL_SIZE: positiveInt.max(200).default(10),
    DATABASE_CONNECT_TIMEOUT_S: positiveInt.max(120).default(10),
    DATABASE_STATEMENT_TIMEOUT_MS: positiveInt.max(600_000).default(15_000),
    DATABASE_LOG_QUERIES: booleanish(false),

    // --- Redis ---------------------------------------------------------------
    REDIS_URL: z
      .string()
      .url('must be a valid URL')
      .refine((v) => v.startsWith('redis://') || v.startsWith('rediss://'), {
        message: 'must be a redis:// or rediss:// connection string',
      }),
    REDIS_KEY_PREFIX: z.string().min(1).default('tenantos'),
    REDIS_TLS: booleanish(false),
    CACHE_DEFAULT_TTL_S: positiveInt.max(86_400).default(60),

    // --- Auth ----------------------------------------------------------------
    JWT_ACCESS_SECRET: secret,
    JWT_REFRESH_SECRET: secret,
    JWT_ACCESS_TTL_S: positiveInt.max(3_600).default(900),
    JWT_REFRESH_TTL_S: positiveInt.max(31_536_000).default(2_592_000),
    JWT_ISSUER: z.string().min(1).default('tenantos'),
    JWT_AUDIENCE: z.string().min(1).default('tenantos-api'),

    // Which hashing adapter backs the PasswordHasher port. Argon2id is the
    // default and the recommendation; bcrypt exists for deployments that must
    // read hashes written by another system (Spring's BCryptPasswordEncoder,
    // typically). The two are not interoperable — see docs/AUTH.md.
    PASSWORD_HASHER_ALGORITHM: z.enum(['argon2', 'bcrypt']).default('argon2'),

    // OWASP minimums for Argon2id. Lower values are rejected outright rather
    // than silently accepted, because a weak KDF is invisible until a breach.
    ARGON2_MEMORY_COST_KIB: positiveInt.min(8_192).max(1_048_576).default(19_456),
    ARGON2_TIME_COST: positiveInt.min(1).max(10).default(2),
    ARGON2_PARALLELISM: positiveInt.min(1).max(16).default(1),

    // bcrypt work factor. Each increment doubles the cost; 12 is roughly 250ms
    // on current hardware. Floored for the same reason the Argon2 parameters
    // are floored.
    BCRYPT_COST_ROUNDS: positiveInt.min(10).max(15).default(12),

    // --- Cookies -------------------------------------------------------------
    AUTH_COOKIE_ENABLED: booleanish(true),
    AUTH_COOKIE_DOMAIN: z.string().optional(),
    AUTH_COOKIE_SECURE: booleanish(false),
    AUTH_COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),

    // --- HTTP ----------------------------------------------------------------
    CORS_ORIGINS: csv('http://localhost:3000'),
    CORS_CREDENTIALS: booleanish(true),
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(1),

    // --- Rate limiting -------------------------------------------------------
    THROTTLE_TTL_S: positiveInt.max(3_600).default(60),
    THROTTLE_LIMIT: positiveInt.default(120),
    AUTH_THROTTLE_LIMIT: positiveInt.default(10),

    // --- Observability -------------------------------------------------------
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    LOG_PRETTY: booleanish(false),
    METRICS_ENABLED: booleanish(true),
    METRICS_PATH: z
      .string()
      .default('/metrics')
      .transform((v) => (v.startsWith('/') ? v : `/${v}`)),
    SWAGGER_ENABLED: booleanish(true),
    SWAGGER_PATH: z
      .string()
      .default('docs')
      .transform((v) => v.replace(/^\/+|\/+$/g, '')),

    // --- WebSockets ----------------------------------------------------------
    WS_ENABLED: booleanish(true),
    WS_PATH: z
      .string()
      .default('/ws')
      .transform((v) => (v.startsWith('/') ? v : `/${v}`)),
    WS_CORS_ORIGINS: csv(''),
  })
  .superRefine((env, ctx) => {
    const fail = (path: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    // Reusing one secret for both token types means a leaked access token can be
    // replayed as a refresh token. Cheap check, catastrophic bug.
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      fail('JWT_REFRESH_SECRET', 'must differ from JWT_ACCESS_SECRET');
    }

    // A refresh token that outlives its access token by less than an order of
    // magnitude means users re-authenticate constantly; the reverse of the point.
    if (env.JWT_REFRESH_TTL_S <= env.JWT_ACCESS_TTL_S) {
      fail('JWT_REFRESH_TTL_S', 'must be greater than JWT_ACCESS_TTL_S');
    }

    // SameSite=None without Secure is dropped by every current browser.
    if (env.AUTH_COOKIE_SAME_SITE === 'none' && !env.AUTH_COOKIE_SECURE) {
      fail('AUTH_COOKIE_SECURE', 'must be true when AUTH_COOKIE_SAME_SITE=none');
    }

    if (env.NODE_ENV !== 'production') return;

    // ---- Production-only invariants ----------------------------------------
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      const value = env[key].toLowerCase();
      if (PLACEHOLDER_SECRET_MARKERS.some((marker) => value.includes(marker))) {
        fail(key, 'looks like a placeholder — refusing to boot production with a known secret');
      }
    }

    if (env.AUTH_COOKIE_ENABLED && !env.AUTH_COOKIE_SECURE) {
      fail('AUTH_COOKIE_SECURE', 'must be true in production (auth cookies over plaintext HTTP)');
    }

    if (env.CORS_ORIGINS.includes('*')) {
      fail('CORS_ORIGINS', 'wildcard origin is not allowed in production');
    }

    if (env.CORS_ORIGINS.some((origin) => origin.startsWith('http://'))) {
      fail('CORS_ORIGINS', 'plaintext http:// origins are not allowed in production');
    }

    if (env.LOG_PRETTY) {
      fail('LOG_PRETTY', 'must be false in production (log shippers expect newline-delimited JSON)');
    }

    if (env.DATABASE_LOG_QUERIES) {
      fail('DATABASE_LOG_QUERIES', 'must be false in production (leaks row data into logs)');
    }
  });

/** Fully parsed, coerced environment. This is the type the app programs against. */
export type Env = z.infer<typeof envSchema>;

/**
 * Parses `process.env` and throws a single readable error listing every problem
 * at once — one boot, one fix cycle, rather than fix-restart-fix-restart.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (result.success) return result.data;

  const details = result.error.issues
    .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');

  throw new Error(
    `Invalid environment configuration (${result.error.issues.length} problem(s)):\n${details}\n\n` +
      `See .env.example / docs/ENVIRONMENT.md for the expected values.`,
  );
}
