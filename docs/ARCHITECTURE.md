# Architecture

Four layers, with dependencies pointing strictly inward. This document explains why, what it costs,
and where the current build stops short.

---

## The dependency rule

```
modules ─────► application ─────► domain ◄───── infrastructure
(HTTP/WS)       (use cases)     (business)      (adapters)
```

`domain` imports nothing from NestJS, Prisma, Express or Redis. `application` imports `domain` and
the *interfaces* it declares. `infrastructure` implements those interfaces. `modules` wires the
whole thing to a transport.

The arrow from `infrastructure` points **inward** and that is the entire trick: the domain declares
`UserRepositoryPort`, infrastructure implements it, and the composition root binds them. The domain
never learns that Prisma exists.

| Layer | May import | Must never import |
|---|---|---|
| `domain` | `shared` (pure types only) | NestJS, Prisma, Express, Redis, `application`, `modules` |
| `application` | `domain`, `shared`, `@nestjs/common` for DI decorators | Prisma, Express, controllers |
| `infrastructure` | `domain`, `shared`, anything external | `application`, `modules` |
| `modules` | everything | — |

**Why not just put the logic in services.** Because `User.suspend()` cannot forget to invalidate
outstanding tokens, whereas `prisma.user.update({ status: 'SUSPENDED' })` forgets every time. Every
state change that must also bump `tokenVersion` is a method on the aggregate, and the property is
enforced by the type system rather than by reviewer attention.

**Why `modules` is separate from `application`.** Controllers translate HTTP into a command and a
result into a DTO — nothing else. The same use cases are driven from the WebSocket gateway with no
duplicated rules, and a use case can be unit-tested with `new` and plain objects.

**What it costs.** More files, and an extra hop for genuinely trivial operations. The break-even is
around the point where a second transport or a second persistence concern shows up; below that, the
layering is overhead you are paying forward.

---

## Ports and adapters

Ports are declared in `domain`, keyed by `Symbol` injection tokens — symbols cannot collide the way
string tokens can — and bound to adapters in exactly one place per concern.

| Port | Token | Adapter | Bound in |
|---|---|---|---|
| `UserRepositoryPort` | `USER_REPOSITORY` | `PrismaUserRepository` | `DatabaseModule` |
| `RefreshTokenRepositoryPort` | `REFRESH_TOKEN_REPOSITORY` | `PrismaRefreshTokenRepository` | `DatabaseModule` |
| `PasswordHasherPort` | `PASSWORD_HASHER` | `Argon2PasswordHasher` | `SecurityModule` |
| `TokenServicePort` | `TOKEN_SERVICE` | `JwtTokenService` | `SecurityModule` |
| `TokenDenylistPort` | `TOKEN_DENYLIST` | `TokenDenylistService` | `SecurityModule` |

A use case injects `USER_REPOSITORY` and receives something satisfying `UserRepositoryPort`; it
cannot reach `PrismaUserRepository` even by accident, because that class is not exported from the
module that binds it.

`DatabaseModule` and `AppConfigModule` are `@Global()`. Everything else is imported explicitly, so
the dependency graph stays readable.

---

## Request lifecycle

```
  request
    │
    ├─ RequestContextMiddleware      opens the AsyncLocalStorage scope (requestId, correlationId)
    ├─ ThrottlerBehindProxyGuard     rate limit — before any expensive work
    ├─ JwtAuthGuard → JwtStrategy    denylist EXISTS, then findAuthSnapshot; sets the principal
    ├─ MetricsInterceptor            outermost, so it observes true end-to-end latency
    ├─ ResponseEnvelopeInterceptor   wraps the payload
    ├─ TimeoutInterceptor (30s)      innermost, so it measures the handler not the queueing
    ├─ ValidationPipe                whitelist + forbidNonWhitelisted, 422 on failure
    │
    ├─ Controller                    HTTP → command
    ├─ Use case                      orchestrates the domain through ports
    ├─ Repository                    Prisma, then row → entity via the mappers
    │
    └─ GlobalExceptionFilter         on any throw: one shape, no internals, right log level
```

Guard order is deliberate: a request that will be rejected by the rate limiter should not cost a
token verification and a database read.

`RequestContextMiddleware` must run first — it opens the AsyncLocalStorage scope that request ids,
correlation ids and the authenticated principal live in. Anything executing earlier logs without
them. This is also why the app uses ALS rather than request-scoped providers: request scope makes
Nest rebuild the provider tree per request and still cannot reach code outside the DI graph, such
as Pino serialisers.

### Response shape

Every response is enveloped, so clients write the unwrapping once:

```jsonc
{ "success": true,  "data": { … },        "traceId": "…", "timestamp": "…" }
{ "success": false, "message": "…", "errorCode": "EMAIL_ALREADY_EXISTS", "details": { … },
  "traceId": "…", "timestamp": "…" }
```

`traceId` matches `x-request-id`, so a user reporting "it broke" hands you the exact log line.
Branch on `errorCode` — it is part of the API contract. `message` is for humans and may change.

Health probes and `/metrics` opt out with `@SkipEnvelope()`: Kubernetes expects Terminus's schema
and Prometheus expects its text exposition format, not our wrapper.

### Error mapping

`GlobalExceptionFilter` is the single exit point. Domain errors carry their own `code` and map to a
status by base class:

| Domain base class | Status |
|---|---|
| `NotFoundError` | 404 |
| `ConflictError` | 409 |
| `AuthenticationError` | 401 |
| `AuthorizationError` | 403 |
| `BusinessRuleError` | 422 |
| *(unmatched `DomainError`)* | 400 |

`InfrastructureError` becomes a flat 503 with a generic message — the real text names hosts, ports
and sometimes credentials. Anything unrecognised becomes a 500 with `INTERNAL_ERROR`; the real
error goes to the log, keyed by the same `traceId` the client received.

`DomainError.isExpected` drives the log level: a wrong password logs at `warn` without a stack, a
dead database at `error` with one. Conflating them makes alerting useless — and a stack trace per
bad password is how log bills happen.

Prisma errors reaching the filter are logged as **unexpected even when the status is 4xx**.
Repositories are expected to translate them, because "unique constraint violated" is only
meaningful next to the code that knows *which* constraint; anything that gets this far is a gap.

---

## Data model

Conventions enforced across every model, in `prisma/schema.prisma`:

- **UUID v4 primary keys** (`@db.Uuid`, not text) — 16 bytes on disk, and the app can mint an id
  before the row exists, which keeps writes idempotent.
- **`timestamptz` everywhere.** A timestamp without a zone is a production incident waiting for the
  first deploy outside UTC.
- **`version Int` on aggregate roots** for optimistic locking.
- **Soft delete via `deletedAt`.** Every read path filters it.
- **snake_case tables and columns** via `@map` — the database is consumed by more than this service
  (analytics, the Spring registrar), so it keeps SQL conventions rather than JavaScript ones.

```
Tenant ──< Membership >── User ──< RefreshToken
             (role)
```

`User` is **global, not tenant-scoped**: one human with one login can belong to several tenants.
`Membership` is an explicit join model rather than an implicit Prisma m:n because the relationship
carries data — a role, who invited whom, and when.

### Aggregates and invariants

`User` is the worked example. State changes go through methods, never field assignment, because
each one decides whether it also has to bump `tokenVersion` — and that decision is the whole
revocation story:

| Method | Bumps `tokenVersion`? | Why |
|---|---|---|
| `setPasswordHash` | yes | A password change is the standard response to a suspected compromise; it must sign the other party out. |
| `upgradePasswordHash` | **no** | The credential has not changed. Signing users out whenever the hashing cost is raised would be a self-inflicted outage. |
| `changeEmail` | yes | The address is the login identifier. |
| `suspend` | yes | Otherwise a suspended user keeps working until their access token expires — the one window an administrator is trying to close. |
| `grantPlatformAdmin` / `revokePlatformAdmin` | yes | Privilege is carried in the token, so the old one must go on the grant as well as the revoke. |
| `softDelete` | yes | — |
| `recordSuccessfulLogin` | **no** | Telemetry. Bumping the version would make concurrent logins collide with each other. |

`version` is immutable on the entity: the repository increments it in the `UPDATE`'s `WHERE`
clause, so an entity that mutated it locally would fail its own write.

### Soft delete and email uniqueness

Uniqueness on `users.email` is unconditional rather than "unique among non-deleted rows", because
Postgres partial unique indexes are not expressible in the Prisma schema. Soft-deleting therefore
rewrites the address to `<id>@deleted.invalid`, which frees the address for re-registration *and*
doubles as GDPR erasure of the identifier.

The consequence for the repository: `existsByEmail` deliberately counts soft-deleted rows, because
the index does. In practice a real address never collides with a rewritten one.

### Optimistic locking

Aggregate writes run as:

```sql
UPDATE users SET …, version = version + 1 WHERE id = $1 AND version = $2
```

A row count of 0 means someone else wrote first. The repository then distinguishes the two causes —
no row at all is `UserNotFoundError` (404), a version mismatch is `ConcurrentModificationError`
(409) — and re-reads inside the same transaction so the returned aggregate carries the incremented
version.

**The repository never retries.** The caller's decision was based on the stale value it read, so it
has to make that decision again. A silent retry would re-apply an intent formed against data that
no longer exists.

`lastLoginAt` is deliberately outside the lock, written by `touchLastLogin` with a plain
`updateMany`. Two sessions signing in at once would otherwise collide on `version` and turn a
successful login into a 409.

### Transactions

`PrismaService.runInTransaction` carries the active transaction client down the call stack in
AsyncLocalStorage, so repositories enlist automatically. The alternative — threading a `tx`
parameter through every repository method — pollutes every signature in the app and is forgotten
exactly once before it causes a partial write.

It is re-entrant: calling it inside a transaction joins the outer one rather than opening a second,
independently committable one.

Keep callbacks short. A transaction holds a pooled connection for its whole duration, so an HTTP
call or a password hash inside one will exhaust the pool under load.

Not everything belongs in a transaction. [Refresh rotation deliberately avoids one](AUTH.md#why-this-is-not-wrapped-in-a-transaction):
the reuse path revokes a token family and then throws, and a transaction would roll the revocation
back while the error response still looked correct.

---

## Large datasets

Two pagination strategies, both supported on purpose.

| | Offset (`?page=`) | Keyset (`?cursor=`) |
|---|---|---|
| Cost at depth | Postgres walks and discards `offset` rows | constant — seeks straight into the index |
| Stability under writes | a concurrent insert shifts rows between pages | stable |
| Page numbers | yes | no |
| Total count | yes | no |
| Use for | admin tables of bounded size | iterating a whole collection; anything unbounded |

Offset is what users expect from a numbered admin table and is fine to a few thousand pages. Keyset
is what any client walking the entire collection should use.

**Cursors** are base64url of `<iso timestamp>|<uuid>` — the full sort key, so the seek is
unambiguous even when many rows share a timestamp. They are not encrypted, and that is fine: they
encode only data the client just received. They *are* validated on the way back in, because an
opaque-looking string is exactly what someone will try to inject through; a cursor that fails to
decode raises `InvalidCursorError` (422) rather than silently returning page one, which would loop
a paginating client forever.

The seek predicate needs both halves:

```sql
WHERE (created_at < $1) OR (created_at = $1 AND id < $2)
ORDER BY created_at DESC, id DESC
```

`users` carries a matching `@@index([createdAt(sort: Desc), id(sort: Desc)])`, so this is an index
seek. With `created_at` alone, rows sharing a timestamp across a page boundary are either skipped or
served twice.

Offset queries tie-break on `id` for the same reason.

### Sorting is an allow-list

`sortBy` reaches an `ORDER BY`, and Prisma accepts any key you hand it. Two failure modes follow
from an unvalidated value: sorting by an unindexed column takes the database down with a sequential
scan, and sorting by `passwordHash` lets a caller read the column one comparison at a time.

Both layers guard it: `PaginationQueryDto` subclasses declare an `@IsIn([...])`, and
`PrismaUserRepository` maps `sortBy` through a `SORTABLE_FIELDS` allow-list, falling back to
`createdAt`.

### Search

`?search=` compiles to `ILIKE '%term%'` across email, first and last name. `contains` cannot use a
B-tree index, so this is a scan — fine to a few hundred thousand rows.

Past that, the fix is an index, not a different `WHERE` clause:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX users_email_trgm ON users USING gin (email gin_trgm_ops);
CREATE INDEX users_name_trgm  ON users USING gin ((first_name || ' ' || last_name) gin_trgm_ops);
```

Beyond that, a `tsvector` column with a full-text index, or a dedicated search service.

### Other scale notes

- `findAuthSnapshot` exists because the JWT strategy runs on every authenticated request and needs
  five columns, not the aggregate — loading the whole user would drag the password hash across the
  wire thousands of times a minute.
- `findMany` issues its rows query and its `COUNT` in parallel rather than in one transaction. A
  concurrent insert can make `total` disagree with `items` by a row; holding a repeatable-read
  transaction open to fix a discrepancy no admin table notices is the worse trade.
- Keyset queries fetch `limit + 1` rows to answer "is there a next page" without a second `COUNT`.

---

## Caching

Redis, through `CacheService`, which **fails open**: every method swallows Redis errors and behaves
as a miss. A cache is an optimisation; if Redis is down the site should be slow, not offline.

The one exception is the [token denylist](AUTH.md#revocation), which is a security control and
therefore fails **closed** — which is exactly why it does not go through `CacheService`.

Keys are built in one place (`CacheKey`), structured `<schema-version>:<entity>:<discriminator>`.
Keys built inline at call sites are how you end up with `user:123` written by the writer and
`users:123` by the invalidator — a bug that presents as "stale data, sometimes, for five minutes".
Bumping `SCHEMA_VERSION` retires every cached shape at once without a flush.

**What not to cache**, since the temptation is to cache everything:

- Anything used for an authorization decision, beyond a few seconds. A revoked admin who keeps
  their powers for an hour is a security incident.
- Anything the caller just wrote. Read-after-write through a cache is how "I saved it and it
  reverted" bugs happen — write paths invalidate rather than repopulate.
- Data that is cheap to fetch. A cached primary-key lookup adds a network hop and an invalidation
  bug to save a sub-millisecond query.
- Anything per-request-unique (free-text search, listings past page 1) — the hit rate approaches
  zero and the entries evict things that would have been hits.

`getOrSet` collapses concurrent misses for the same key **within one process**. Across processes, a
popular key expiring still lets one request per replica through; proper cross-process stampede
protection needs a distributed lock, which costs a round trip on every miss and is only worth it
when the loader is genuinely expensive.

`deleteByPrefix` uses `SCAN` + `UNLINK`, never `KEYS`: `KEYS *` is O(n) over the whole keyspace and
blocks the single-threaded server for the duration.

---

## Horizontal scaling

The HTTP process is stateless — no session store, no in-memory rate-limit counters, no sticky
routing required. Three things make that true, and each is a bug if it regresses:

1. **Rate-limit counters live in Redis.** The in-memory default multiplies every limit by the
   replica count: "5 per minute" becomes 25 across five pods.
2. **Socket.IO uses the Redis pub/sub adapter.** Socket.IO keeps connections in the memory of
   whichever process accepted them, so with more than one replica `server.to(room).emit(...)`
   reaches only that replica's clients — a notification lands for a third of your users, and the
   bug is invisible in single-instance development. The adapter forwards every emit through
   pub/sub. It is not an optimisation.
3. **Auth state is in the token plus Redis**, not in process memory.

Socket.IO's long-polling fallback still needs session affinity, because its handshake spans several
HTTP requests that must reach the same process. Either enable sticky sessions at the load balancer
or force `transports: ['websocket']` — see [DEPLOYMENT.md](DEPLOYMENT.md#websockets).

The number that constrains replica count is the [connection math](DEPLOYMENT.md#connection-math):
`replicas × DATABASE_POOL_SIZE ≤ Postgres max_connections`.

---

## Implementation status

The layering above is fully in place for the auth path. Several modules named in the folder plan
are not built yet, and the docs are honest about it rather than aspirational:

| Area | Status |
|---|---|
| `domain/user`, `domain/auth`, `domain/shared` | complete |
| `application/auth` | login, refresh, logout, logout-all implemented; `switch-tenant` implemented but [unscoped and unrouted](AUTH.md#what-is-not-implemented) |
| `application/users` | `changePassword` only |
| `infrastructure/*` | complete — config, database, cache, security, logging, observability |
| `modules/auth`, `modules/health`, `modules/websocket` | built |
| `modules/users`, `modules/tenants` | **not built** — no controllers, no DTOs |
| `domain/tenant`, `application/tenants` | **not built** — the `tenants`/`memberships` tables and their indexes exist in the schema, but no aggregate, port or repository does |
| Tests | none — see the README |

The practical consequence: the only HTTP surface today is `/auth/*`, `/health*`, `/metrics` and the
root endpoint. Anything in the README describing user or tenant endpoints describes the intended
shape, not a running route.
