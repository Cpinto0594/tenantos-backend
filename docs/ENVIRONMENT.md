# Environment

Every variable this service reads is declared, coerced and validated in
[`src/infrastructure/config/env.schema.ts`](../src/infrastructure/config/env.schema.ts). Nothing
else in the codebase touches `process.env`.

The payoff is that a misconfigured deployment dies at boot with a field-by-field report, instead
of at 3am with `undefined is not a function` inside a request handler:

```
Invalid environment configuration (2 problem(s)):
  • JWT_REFRESH_SECRET: must differ from JWT_ACCESS_SECRET
  • AUTH_COOKIE_SECURE: must be true in production (auth cookies over plaintext HTTP)

See .env.example / docs/ENVIRONMENT.md for the expected values.
```

Validation runs inside `AppConfigModule`, before any other provider is constructed. The process
exits non-zero, the container never reports healthy, and a bad config never takes traffic.

---

## Where values come from

`@nestjs/config` reads the first file that exists, then falls back to the real environment.
Actual `process.env` variables always win over file contents.

| Precedence | File | Committed? |
|---|---|---|
| 1 | `.env.${NODE_ENV}.local` | no — personal overrides |
| 2 | `.env.${NODE_ENV}` | yes — per-environment defaults |
| 3 | `.env` | no — local catch-all |

Real deployments set no files at all: variables come from the orchestrator. None of these files
ship in the image — `.dockerignore` excludes them.

Copy `.env.example` to `.env` to get started. Two variables have no default and the process will
not boot without them: **`DATABASE_URL`** and **`REDIS_URL`**, plus the two JWT secrets.

### Type coercion

Everything arrives as a string; the schema converts it.

- **Booleans** accept `true`/`false`, `1`/`0`, `yes`/`no`, `on`/`off` (case-insensitive). Anything
  else is a validation error rather than a silent `false`.
- **Lists** are comma-separated, trimmed, de-duplicated, with empty entries dropped.
- **Numbers** are coerced and range-checked. `APP_PORT=eighty` fails at boot.

---

## Application

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `test` \| `production`. Switches on the production invariants below. |
| `APP_NAME` | `tenantos-backend` | Appears in logs and as a default Prometheus label. |
| `APP_PORT` | `3000` | 1–65535. |
| `APP_HOST` | `0.0.0.0` | Use `127.0.0.1` to bind loopback only. |
| `API_PREFIX` | `api` | Leading/trailing slashes are stripped. |
| `API_VERSION` | `1` | Digits only. Combined into the base path `/api/v1`. |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Max 120000. Grace period for in-flight requests on SIGTERM — see [DEPLOYMENT.md](DEPLOYMENT.md#graceful-shutdown). |

## Database

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | **required** | Must start `postgres://` or `postgresql://`. |
| `DATABASE_POOL_SIZE` | `10` | Max 200. Appended to the URL as `connection_limit`. See the [connection math](DEPLOYMENT.md#connection-math) before raising it. |
| `DATABASE_CONNECT_TIMEOUT_S` | `10` | Max 120. Appended as `connect_timeout`. |
| `DATABASE_STATEMENT_TIMEOUT_MS` | `15000` | Max 600000. Applied server-side via `options=-c statement_timeout=…`, so a runaway query dies in Postgres rather than holding a pooled connection. |
| `DATABASE_LOG_QUERIES` | `false` | Logs every statement **with its parameters** at debug level. Rejected in production — parameters contain row data, including password hashes. |

`AppConfigService` assembles the final connection string from these. Anything already present in
`DATABASE_URL` wins, so an operator can override any of it without a code change. `pool_timeout=10`
is also added: a query waits at most 10s for a free connection before failing, which beats queueing
behind a saturated pool until the request timeout fires.

## Redis

| Variable | Default | Notes |
|---|---|---|
| `REDIS_URL` | **required** | Must start `redis://` or `rediss://`. |
| `REDIS_KEY_PREFIX` | `tenantos` | Prepended to every key. Two environments sharing one Redis need different prefixes. |
| `REDIS_TLS` | `false` | Prefer encoding TLS in the URL as `rediss://`. |
| `CACHE_DEFAULT_TTL_S` | `60` | Max 86400. Default expiry for `CacheService.set`. |

Redis is not optional: it backs the cache, the token denylist, rate-limit counters, and the
Socket.IO pub/sub backplane. The denylist [fails closed](AUTH.md#revocation), so an instance that
cannot reach Redis rejects authenticated requests — which is why readiness checks it.

## Auth and JWT

| Variable | Default | Notes |
|---|---|---|
| `JWT_ACCESS_SECRET` | **required** | Min 32 chars. `openssl rand -base64 48`. |
| `JWT_REFRESH_SECRET` | **required** | Min 32 chars, and must differ from the access secret. |
| `JWT_ACCESS_TTL_S` | `900` | Max 3600. The revocation window for a `tokenVersion` bump. |
| `JWT_REFRESH_TTL_S` | `2592000` | Max 31536000. Must exceed `JWT_ACCESS_TTL_S`. |
| `JWT_ISSUER` | `tenantos` | Verified on every request, not merely stamped. |
| `JWT_AUDIENCE` | `tenantos-api` | Same. |
| `ARGON2_MEMORY_COST_KIB` | `19456` | Min 8192 (OWASP floor), max 1048576. |
| `ARGON2_TIME_COST` | `2` | 1–10. |
| `ARGON2_PARALLELISM` | `1` | 1–16. |

Raising the Argon2 parameters is safe at any time: existing hashes keep verifying, and the login
path re-hashes them to the new parameters on next sign-in without invalidating sessions. Note the
CPU cost is paid per login attempt, including failed ones — see the throttle settings.

## Cookies

| Variable | Default | Notes |
|---|---|---|
| `AUTH_COOKIE_ENABLED` | `true` | `false` returns tokens in the JSON body only — for mobile and service-to-service clients. |
| `AUTH_COOKIE_DOMAIN` | *(unset)* | Set only to share cookies across subdomains. |
| `AUTH_COOKIE_SECURE` | `false` | Must be `true` in production, and whenever `SameSite=none`. |
| `AUTH_COOKIE_SAME_SITE` | `lax` | `lax` \| `strict` \| `none`. `none` needs a CSRF token — see [AUTH.md](AUTH.md#cookies-versus-localstorage). |

Cookie names are `tos_at` (access, path `/`) and `tos_rt` (refresh, path `/api/v1/auth`).

## HTTP

| Variable | Default | Notes |
|---|---|---|
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allow-list. No wildcards and no `http://` in production. |
| `CORS_CREDENTIALS` | `true` | Required for the cookie transport. |
| `TRUST_PROXY` | `1` | Number of proxy hops to trust for the client IP. **Never a boolean** — trusting the whole `X-Forwarded-For` chain lets a client forge its address and defeat both rate limiting and audit logging. Set it to the actual number of proxies in front of the app. |

## Rate limiting

| Variable | Default | Notes |
|---|---|---|
| `THROTTLE_TTL_S` | `60` | Max 3600. Window length for both buckets. |
| `THROTTLE_LIMIT` | `120` | Global bucket: requests per window per client. |
| `AUTH_THROTTLE_LIMIT` | `10` | Tighter bucket applied to every `/auth/*` route. Turn it down during a credential-stuffing run — no deploy needed. |

Counters live in Redis and are shared across replicas. The in-memory default would multiply every
limit by the replica count.

## Observability

| Variable | Default | Notes |
|---|---|---|
| `LOG_LEVEL` | `info` | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` \| `silent`. |
| `LOG_PRETTY` | `false` | Human-readable output via `pino-pretty`. Rejected in production — shippers expect newline-delimited JSON. |
| `METRICS_ENABLED` | `true` | `false` makes `/metrics` return 403 and skips Node runtime metric collection. |
| `METRICS_PATH` | `/metrics` | A leading slash is added if missing. |
| `SWAGGER_ENABLED` | `true` | Serves the OpenAPI UI. Turn it off in production unless the API is genuinely public. |
| `SWAGGER_PATH` | `docs` | Slashes stripped; mounted at the server root. |

`/metrics` and the Swagger schema both enumerate every route and internal timing. Neither should be
reachable from the internet — restrict them at the ingress.

## WebSockets

| Variable | Default | Notes |
|---|---|---|
| `WS_ENABLED` | `true` | `false` skips the Socket.IO adapter entirely. |
| `WS_PATH` | `/ws` | A leading slash is added if missing. The namespace is `/events`. |
| `WS_CORS_ORIGINS` | *(empty)* | Falls back to `CORS_ORIGINS` when unset, so the common case is configured in one place. |

---

## Cross-field rules

Enforced in every environment:

| Rule | Why |
|---|---|
| `JWT_ACCESS_SECRET ≠ JWT_REFRESH_SECRET` | One shared secret means a leaked access token can be replayed as a refresh token. |
| `JWT_REFRESH_TTL_S > JWT_ACCESS_TTL_S` | Otherwise the refresh token expires first and users re-authenticate constantly — the reverse of the point. |
| `AUTH_COOKIE_SAME_SITE=none` ⟹ `AUTH_COOKIE_SECURE=true` | Every current browser drops a `SameSite=None` cookie without `Secure`. |

## Production-only invariants

Applied when `NODE_ENV=production`. Each one is a mistake that is invisible until it is expensive:

| Rule | Failure it prevents |
|---|---|
| JWT secrets must not contain `change-me`, `dev-only`, `test-only`, `secret`, `password` | Shipping the example secrets. Anyone with the repo can then mint tokens. |
| `AUTH_COOKIE_SECURE=true` when cookies are enabled | Auth cookies travelling in plaintext on the first `http://` request. |
| `CORS_ORIGINS` may not contain `*` | A wildcard with credentials is refused by browsers anyway, and silently breaks auth for everyone. |
| `CORS_ORIGINS` may not contain `http://` origins | Downgrades the whole session to plaintext. |
| `LOG_PRETTY=false` | Log shippers cannot parse pretty output; you lose production logs precisely when you need them. |
| `DATABASE_LOG_QUERIES=false` | Query parameters include password hashes and personal data. |

## Generating secrets

```bash
openssl rand -base64 48   # once for JWT_ACCESS_SECRET, again for JWT_REFRESH_SECRET
```

Rotating `JWT_ACCESS_SECRET` invalidates every access token in circulation — clients refresh and
recover within one refresh cycle.

`JWT_REFRESH_SECRET` is required and validated but currently signs nothing: refresh tokens are
opaque random strings, not JWTs, so there is no signature to make. It is reserved so that the
distinction is enforced from day one — a deployment that set both to the same value and later
adopted signed refresh tokens would be replayable. Rotating it has no effect on existing sessions.
