# Deployment

What ships, in what order, and what to check when it misbehaves.

---

## The image

Multi-stage build, ordered by how often each layer changes: base image, then dependencies, then
source. Editing a source file rebuilds one layer, not an `npm install`.

| Stage | Contains |
|---|---|
| `base` | `node:20.19-alpine3.20` + `openssl` and `libc6-compat` — Prisma's query engine links against OpenSSL, and Alpine ships without it. The failure mode is a runtime error on the first query, not a build error. |
| `deps` | production `node_modules` from `npm ci --omit=dev --ignore-scripts`, then an explicit `prisma generate` (ignoring scripts skipped Prisma's postinstall). |
| `build` | full toolchain, `npm run build` → `dist/`. |
| `runner` | `dist/`, production `node_modules`, `package.json`, `prisma/`. No compiler, no dev dependencies, no source. |

```bash
docker build -t tenantos-backend:$(git rev-parse --short HEAD) .
```

Runtime properties worth not regressing:

- **`tini` as PID 1.** A process started directly by Docker gets no default signal handlers, so
  SIGTERM would be ignored and every deploy would end in SIGKILL, dropping in-flight requests.
- **Non-root.** Runs as the image's `node` user (uid 1000), with files owned by it.
- **`NODE_OPTIONS=--max-old-space-size=384`.** Container memory is not the same as heap size.
  Without this, V8 sizes the heap from the *host's* memory and the OOM killer takes the container
  long before the GC feels any pressure. Raise it alongside the container memory limit — a useful
  rule is roughly 75% of the limit.
- **`HEALTHCHECK`** hits `/health/live`. Kubernetes ignores it in favour of the manifest probes; a
  single `HEALTHCHECK` cannot express the liveness/readiness split.

The Prisma client is generated against the schema and the `linux-musl-openssl-3.0.x` binary target,
so a client generated on a glibc CI runner still works in the Alpine image.

---

## Release contract

Three steps, in this order. A pipeline that reorders them will drop requests or break the running
version.

```
1. build & test      npm ci && npm run lint && npm run typecheck && npm run build
2. migrate           npx prisma migrate deploy        # separate step, runs once
3. deploy            roll the new image
```

**Migrations run as their own step, not at container start.** `docker-compose.yml` does run
`migrate deploy` in its command, which is fine for a single local container and wrong for a
deployment: N replicas starting simultaneously would each try to migrate, and the application user
would need DDL rights at all times. Run it as a Kubernetes Job, an init container on a single
replica, or a pipeline stage against a migration role.

**Migrations must be backward compatible with the currently running version**, because during a
rolling deploy both versions serve traffic against the same schema. Use expand/contract:

| Change | Safe sequence |
|---|---|
| Add a column | add nullable (or with a default) → deploy code that writes it → backfill → add `NOT NULL` in a later release |
| Rename a column | add the new one → dual-write → backfill → switch reads → drop the old one next release |
| Drop a column | stop reading it → deploy → drop in a later release |
| Add an index | `CREATE INDEX CONCURRENTLY` in a manual migration — a plain `CREATE INDEX` takes an `ACCESS EXCLUSIVE` lock and blocks writes for the duration |

`prisma migrate deploy` only applies committed migration files; it never generates or resets. Check
state with `npm run prisma:migrate:status`.

There is one migration in the repository (`prisma/migrations/20250101000000_init`).

### Rollback

Rolling the image back is safe. Rolling a *migration* back generally is not — Prisma has no `down`
migrations, and a schema change that has already been written to by the new version cannot be
reversed without data loss. The expand/contract discipline above is what makes an image rollback
sufficient: the previous version keeps working against the newer schema.

For an emergency, write a forward migration that restores the old shape.

---

## Configuration

Full reference in [ENVIRONMENT.md](ENVIRONMENT.md). Production checklist — every item is enforced by
the env schema, and the process refuses to boot if one is wrong:

- [ ] `NODE_ENV=production`
- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` — distinct, ≥32 chars, no placeholder markers
- [ ] `AUTH_COOKIE_SECURE=true`
- [ ] `CORS_ORIGINS` — explicit `https://` origins, no wildcard
- [ ] `LOG_PRETTY=false`
- [ ] `DATABASE_LOG_QUERIES=false`
- [ ] `TRUST_PROXY` set to the real number of proxy hops
- [ ] `SWAGGER_ENABLED=false` unless the API is genuinely public

Secrets come from the orchestrator's secret store, not from a file. No `.env*` file ships in the
image — `.dockerignore` excludes them.

---

## Probes

```yaml
livenessProbe:
  httpGet: { path: /health/live, port: 3000 }
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 3
readinessProbe:
  httpGet: { path: /health/ready, port: 3000 }
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 2
startupProbe:
  httpGet: { path: /health/live, port: 3000 }
  periodSeconds: 5
  failureThreshold: 12          # 60s to boot before liveness takes over
```

The split is the part people get wrong, and getting it wrong takes down a healthy service:

- **`/health/live` checks nothing external.** If it checked the database, a database blip would fail
  liveness, Kubernetes would kill every pod, and the restarts would add load to an already
  struggling database — turning a partial outage into a total one.
- **`/health/ready` checks Postgres and Redis.** A failing readiness probe removes the pod from the
  load balancer without killing it, so it can recover and come back on its own. Redis counts
  because the token denylist [fails closed](AUTH.md#revocation): an instance that cannot reach it
  rejects every authenticated request, and taking it out of rotation beats serving 401s.

Both are `@Public()` — a probe that needs a token is a probe that fails during an auth outage — and
excluded from both the API prefix and URI versioning, so probe URLs do not move when the API version
changes.

`/health` (unprefixed) returns the full Terminus report for humans.

---

## Graceful shutdown

On SIGTERM the process stops accepting connections, finishes in-flight requests, and closes the
Prisma pool and Redis connections in dependency order. `SHUTDOWN_TIMEOUT_MS` (default 10s) is the
backstop: if something never finishes, the process exits anyway rather than hanging until SIGKILL,
which would drop the in-flight work *and* skip cleanup.

```yaml
terminationGracePeriodSeconds: 30      # must exceed SHUTDOWN_TIMEOUT_MS
lifecycle:
  preStop:
    exec: { command: ["sleep", "5"] }  # let the LB notice before we stop accepting
```

The `preStop` sleep matters: endpoint removal and SIGTERM race, and without it a load balancer can
send requests to a pod that has already stopped listening. That is the usual source of a burst of
502s on every release.

An unhandled rejection or uncaught exception triggers the same shutdown path and exits non-zero. A
process in an undefined state should be restarted, not left serving traffic on invariants that may
no longer hold.

---

## Scaling

### Connection math

```
replicas × DATABASE_POOL_SIZE  ≤  Postgres max_connections − (admin + migrations + other services)
```

Prisma pools per process, so this is the number that constrains replica count — not CPU. With the
default `DATABASE_POOL_SIZE=10` and a Postgres at `max_connections=100`, you are out of connections
at nine replicas.

Beyond a handful of replicas, put **PgBouncer in transaction mode** in front and drop
`DATABASE_POOL_SIZE` to a small number per instance. Prisma requires `?pgbouncer=true` on the URL in
that setup.

`pool_timeout=10` and `statement_timeout` are already encoded into the connection string by
`AppConfigService`: a query waits at most 10s for a free connection, and a runaway query dies in
Postgres rather than holding a connection hostage.

### WebSockets

Multi-replica Socket.IO **requires** the Redis adapter, which is wired in `main.ts` when
`WS_ENABLED=true`. Without it, `server.to(room).emit(...)` reaches only the clients connected to
that replica, and the bug is invisible in single-instance development.

The long-polling fallback additionally needs session affinity, because its handshake spans several
HTTP requests that must reach the same process:

```yaml
# nginx ingress
nginx.ingress.kubernetes.io/affinity: "cookie"
nginx.ingress.kubernetes.io/session-cookie-name: "io"
```

Or force `transports: ['websocket']` client-side and skip affinity entirely — cleaner, at the cost
of clients on networks that block WebSocket upgrades.

Idle sockets are dropped after 20s of silence (`pingTimeout`), with a 25s ping interval. Any proxy
in front must have an idle timeout comfortably above that, or it will cut connections mid-session.

### Redis

One instance backs the cache, denylist, rate-limit counters and WS pub/sub. Size `maxmemory` for
the cache and set `allkeys-lru` — a runaway key pattern should degrade the cache rather than
OOM-kill Redis and take the fail-closed denylist down with it.

The pub/sub adapter uses dedicated publisher and subscriber connections: a subscribed Redis client
cannot issue ordinary commands, so they cannot be the cache client.

---

## Observability

**Metrics.** `/metrics` in Prometheus text format, version-neutral so a scrape config need not
change with the API version.

| Metric | Use |
|---|---|
| `http_request_duration_seconds` | latency histogram, labelled by templated route |
| `http_requests_total` | throughput and error rate |
| `http_requests_in_flight` | saturation — the leading indicator |
| `auth_attempts_total{result}` | `success` / `invalid_credentials` / `inactive` / `reuse_detected` |
| `cache_operations_total{operation,result}` | hit rate |
| `websocket_connections` | open sockets **on this instance** — sum across replicas |
| `nodejs_*` | event loop lag, heap, GC. When a Node service is slow and the database is not, the answer is almost always here. |

Routes are labelled with the *templated* path (`/users/:id`), never the actual one. Labelling by raw
URL means one time series per user id, which is how you take down a monitoring system.

**This endpoint must not be reachable from the internet.** Its output enumerates every route, error
rate and internal timing. Bind it to an internal network or restrict it at the ingress. The same
applies to Swagger when it is enabled.

Alerts worth having on day one:

- `auth_attempts_total{result="reuse_detected"}` — any sustained non-zero rate is a stolen refresh
  token, not a false positive.
- A rising `invalid_credentials` rate against a flat request rate — credential stuffing.
- `http_requests_in_flight` climbing while throughput is flat — saturation, usually the database
  pool.
- 503s with `errorCode: DATABASE_UNAVAILABLE` or `CACHE_UNAVAILABLE`.

**Logs.** Newline-delimited JSON. Every line carries `requestId`, `correlationId`, `userId` and
`tenantId`, propagated through AsyncLocalStorage. Pino redacts `authorization`, `cookie`,
`set-cookie` and any `password*`/`token*` field.

Every response carries `traceId` matching `x-request-id` — the join key between a user's bug report
and the logs.

---

## Runbook

| Symptom | First checks |
|---|---|
| Burst of 502s on every deploy | `preStop` hook present? `terminationGracePeriodSeconds` > `SHUTDOWN_TIMEOUT_MS`? |
| Pods restarting under database load | Is liveness pointed at `/health/ready` by mistake? Liveness must not touch dependencies. |
| Every request 401 | Redis reachable? The denylist fails closed, so a Redis outage rejects all authenticated traffic. Readiness should already have pulled the pod. |
| 503 `DATABASE_UNAVAILABLE`, `in_flight` climbing | Pool exhaustion. Check `replicas × DATABASE_POOL_SIZE` against `max_connections`; look for long transactions holding connections. |
| Slow requests, database quiet | Event loop lag, from the default Node metrics. Usually Argon2 under a login flood — check `auth_attempts_total` and lower `AUTH_THROTTLE_LIMIT`. |
| `reuse_detected` spiking | Stolen refresh tokens, or a client racing two refreshes. The family is already revoked; identify the users from the log and confirm with them. |
| Rate limits far looser than configured | Throttler counters not in Redis — every replica counting separately. |
| WS events reach only some clients | Redis adapter not connected (`WS_ENABLED`, Redis reachability), or the LB lost affinity for long-polling clients. |
| 429s from health checks | Probes should be exempt via `skipIf`; confirm the probe path starts with `/health`. |
| Client IPs all identical | `TRUST_PROXY` too low for the real hop count — rate limiting is then per-proxy, not per-client. |
| Boot loop with a config error | Read the message: the schema lists every problem at once. |

---

## Local stack

```bash
docker compose up -d                  # Postgres :54322, Redis :63792
docker compose --profile app up -d    # …plus the API in a container
```

Ports are deliberately non-default so this stack cannot collide with a locally installed
Postgres/Redis or with the sibling `tenantos-registrar` stack on :54321. Compose also creates a
separate `tenantos_test` database, so a test run can never truncate development data.

The compose `api` service uses development-only secrets that the production env schema would reject
outright — which is the point: they cannot be promoted by accident.
