# tenantos-backend

The core API for **TenantOS**, a multi-tenant SaaS platform. NestJS 11, TypeScript in strict
mode, PostgreSQL via Prisma, Redis, and Socket.IO.

This is one service in the wider `multi-tenant` project — the sibling
[`tenantos-registrar`](../tenantos-registrar) (Spring Boot) handles tenant onboarding. This
repository owns identity, workspaces, membership, and the real-time channel.

---

## Quick start

```bash
# 1. Configuration. Every variable is validated at boot; see docs/ENVIRONMENT.md.
cp .env.example .env

# 2. Postgres (:54322) and Redis (:63792). Non-default ports so this stack cannot
#    collide with a local install or with tenantos-registrar's stack on :54321.
docker compose up -d

# 3. Dependencies and the generated Prisma client
npm ci
npm run prisma:generate

# 4. Schema and sample data
npm run prisma:migrate:deploy
npm run db:seed

# 5. Run it
npm run start:dev
```

Then:

| | |
|---|---|
| API | <http://localhost:3000/api/v1> |
| OpenAPI / Swagger UI | <http://localhost:3000/docs> |
| Health (full) | <http://localhost:3000/health> |
| Liveness / readiness | `/health/live`, `/health/ready` |
| Prometheus metrics | <http://localhost:3000/metrics> |
| WebSocket | `ws://localhost:3000/ws` namespace `/events` |

The seed creates three accounts, all with the password `Password123!`:

| Email | Role |
|---|---|
| `admin@tenantos.local` | platform administrator |
| `owner@acme.local` | `OWNER` of *acme* |
| `member@acme.local` | `MEMBER` of *acme*, `ADMIN` of *globex* |

`member@acme.local` belongs to two workspaces on purpose — it is the account to use when
exercising the workspace switcher and the many-to-many model.

### Try it

```bash
# Sign in. With cookie transport enabled the refresh token is set as an HttpOnly
# cookie and deliberately omitted from the response body — see docs/AUTH.md.
curl -s -X POST localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@acme.local","password":"Password123!"}'

# Use the access token
curl -s localhost:3000/api/v1/users/me -H "Authorization: Bearer $ACCESS_TOKEN"

# Keyset pagination: send an empty cursor to start the walk, then pass
# meta.nextCursor back each time.
curl -s "localhost:3000/api/v1/users?limit=1&cursor=" -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## Commands

| Command | Purpose |
|---|---|
| `npm run start:dev` | Watch mode |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run the compiled build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `lint:fix` | ESLint, zero warnings tolerated |
| `npm run format` / `format:check` | Prettier |
| `npm test` / `test:cov` | Jest (see [Testing](#testing)) |
| `npm run prisma:migrate:dev -- --name x` | Create and apply a migration |
| `npm run prisma:migrate:deploy` | Apply committed migrations (production-safe) |
| `npm run prisma:studio` | Browse the database |
| `npm run db:seed` | Seed development data (refuses to run in production) |
| `docker compose up -d` | Postgres + Redis |
| `docker compose --profile app up -d` | …plus the API in a container |

---

## Architecture

Four layers, with dependencies pointing strictly inward. Full rationale in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
src/
├── main.ts              Bootstrap: helmet, CORS, compression, validation, shutdown
├── app/                 Composition root — global guards, interceptors, filters, Swagger
│
├── domain/              Business rules. No NestJS, no Prisma, no HTTP.
│   ├── user/            User aggregate, Email and Password value objects, repository port
│   ├── tenant/          Tenant + Membership aggregates, TenantSlug, ports
│   ├── auth/            RefreshToken aggregate, hasher/token/denylist ports
│   └── shared/          DomainError hierarchy, enums, role ranking
│
├── application/         Use cases. Orchestrate the domain through ports.
│   ├── auth/            login, register, refresh (rotation + reuse detection), logout, switch-tenant
│   ├── users/           create, query, update, change password, delete
│   └── tenants/         workspace and membership operations
│
├── infrastructure/      Adapters implementing the domain's ports.
│   ├── config/          Zod-validated environment, typed AppConfigService
│   ├── database/        PrismaService, Prisma repositories, row↔entity mappers
│   ├── cache/           Redis connections, CacheService, response-cache interceptor
│   ├── security/        Argon2 hasher, JWT service, token denylist, throttler storage
│   ├── logging/         Pino with redaction and request correlation
│   └── observability/   Prometheus registry, metrics interceptor and endpoint
│
├── modules/             NestJS wiring and the HTTP/WS surface.
│   ├── auth/            Controller, DTOs, Passport strategy, guards, cookie service
│   ├── users/           The reference module — see below
│   ├── tenants/         Workspaces and membership
│   ├── health/          Liveness / readiness / full check
│   └── websocket/       Socket.IO gateway, Redis adapter, publisher
│
└── shared/              Cross-cutting, feature-agnostic
    ├── http/            Response envelope, pagination primitives
    ├── dto/             Shared query and response DTOs
    ├── filters/         Global exception filter
    ├── interceptors/    Response envelope, timeout
    ├── context/         AsyncLocalStorage request context
    ├── guards/          Proxy-aware throttler guard
    ├── errors/          Error-code catalogue, InfrastructureError
    └── constants/       Headers, cookie names, metadata keys
```

**Why `domain` and `application` rather than putting logic in services:** the domain layer
imports nothing from NestJS or Prisma, so business rules can be exercised with `new` and
plain objects. `User.suspend()` cannot forget to invalidate outstanding tokens, whereas
`prisma.user.update({ status: 'SUSPENDED' })` forgets every time.

**Why `modules` is separate from `application`:** controllers translate HTTP into a command
and a result into a DTO — nothing else. The same use cases are driven from the WebSocket
gateway with no duplicated rules.

### The reference module

`src/modules/users/` is the worked example: controller → use case → repository → database,
with authentication, role-based authorization, response caching, offset *and* keyset
pagination, validation, structured logging, and OpenAPI. Start there.

---

## Key decisions

| Decision | Why |
|---|---|
| **Prisma** over TypeORM | Generated types are checked against the schema, so a renamed column is a compile error rather than a runtime one. Its migration story is explicit files, not `synchronize: true`. |
| **Opaque refresh tokens**, not JWTs | A JWT refresh token is self-validating, which is exactly wrong for something that must be revocable. Opaque tokens are meaningless without their database row. |
| **class-validator for DTOs, Zod for config** | DTOs feed Swagger, and `@nestjs/swagger` reads class-validator decorators to generate an accurate schema with no duplication. Config is parsed once at boot with cross-field rules and coercion — Zod's `superRefine` fits better. |
| **Argon2id** over bcrypt | Memory-hard, so a GPU attacker pays for RAM per guess. Parameters are configurable and floored at OWASP minimums by the env schema. |
| **Pino** over Winston | JSON serialisation an order of magnitude faster. At thousands of requests per second, logging is a real slice of the CPU budget. |
| **AsyncLocalStorage** over request-scoped providers | Request scope makes NestJS rebuild the provider tree per request and still cannot reach code outside the DI graph, like Pino serialisers. |
| **Redis-backed rate limiting** | The in-memory default multiplies every limit by the replica count — a "5 per minute" login limit becomes 25 across five pods. |
| **Soft delete with email anonymisation** | Hard deletes cascade and destroy audit trails. Rewriting the address to `<id>@deleted.invalid` frees it for re-registration *and* satisfies erasure requests. |

---

## Security

- **Authentication** — short-lived JWT access tokens; opaque refresh tokens that rotate on
  every use, with reuse detection that revokes the whole session family. Two independent
  revocation mechanisms: a `tokenVersion` column (bulk) and a Redis denylist (single token).
  Full lifecycle in [docs/AUTH.md](docs/AUTH.md).
- **Authorization** — global `JwtAuthGuard`, so every route requires a token unless it opts
  out with `@Public()`. Roles are ranked, so `@RequireRole('ADMIN')` also admits owners.
- **Tenant isolation** — scoping is derived from the caller's token, never from a request
  parameter. A `?tenantId=` from a non-admin is ignored, not honoured.
- **Account enumeration** — unknown email, wrong password, and suspended account are
  indistinguishable in code, message, *and* response time; the "no such user" path performs
  a dummy Argon2 verification to equalise latency.
- **Transport** — helmet, a strict CORS allow-list (wildcards and plaintext origins are
  rejected outright in production), HSTS, and a 1 MB body cap.
- **Input** — global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted`, so
  undeclared properties are rejected rather than silently ignored.
- **SQL injection** — all access goes through Prisma's parameterised query builder. Sort
  fields are checked against an allow-list before reaching `ORDER BY`.
- **Secrets** — never logged: Pino removes `authorization`, `cookie`, `set-cookie`, and any
  `password*`/`token*` field. The `Password` value object stringifies to `[REDACTED]`.

---

## Observability

- **Logs** — newline-delimited JSON in production, `pino-pretty` in development. Every line
  carries `requestId`, `correlationId`, `userId`, and `tenantId`, propagated through
  AsyncLocalStorage so services with no access to the request object still emit them.
- **Traceability** — every response includes a `traceId` matching `x-request-id`. A user
  reporting "it broke" hands you the exact log line.
- **Metrics** — `/metrics` exposes request latency histograms, throughput, in-flight count,
  auth outcomes, cache hit rate, WebSocket connections, and Node runtime internals. Routes
  are labelled with the *templated* path (`/users/:id`) to keep cardinality bounded.
- **Health** — `/health/live` checks nothing external; `/health/ready` checks Postgres and
  Redis. Conflating the two turns a database blip into a full outage — see the note in
  `health.controller.ts`.

---

## Testing

**The test suite is currently empty.** Jest is configured and `passWithNoTests` is on, so
`npm test` passes trivially — treat a green result as "the harness works", not as evidence
the code does.

Adding a spec needs no configuration: drop a `*.spec.ts` beside the file it covers. The
layering is designed to make that cheap — the domain has no framework imports, and use cases
depend on repository *interfaces*, so they can be exercised with in-memory doubles, no
Postgres and no NestJS container. Coverage thresholds are present but commented out in
`jest.config.ts`; enable them once specs exist and ratchet upward.

What has been verified manually against real Postgres and Redis, and is worth pinning first:

- Login, refresh rotation, reuse detection revoking the whole family, logout denylisting the
  access token.
- Role-based access, tenant scoping of listings, the last-owner rule.
- Offset and keyset pagination, search, filtering, sorting.
- WebSocket handshake authentication and room-based tenant isolation.
- Uniform failure latency across wrong-password and unknown-account logins.

---

## Documentation

| | |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layering, data model, caching, large datasets, scaling |
| [docs/AUTH.md](docs/AUTH.md) | Token lifecycles, rotation, revocation, cookie vs localStorage |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Containers, migrations, probes, scaling, runbook |
| [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) | Every environment variable |

---

## Known gaps

Stated plainly, because a foundation with undocumented holes is worse than one with known
ones:

- **No tests.** See above.
- **No CI/CD pipeline.** There is no `.github/workflows`; lint, typecheck, build, and
  migrations must be run by hand (`npm run lint && npm run typecheck && npm run build`).
  The commands are all pipeline-ready — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the
  release contract a pipeline would need to honour.
- **No email delivery.** Invitations create an `INVITED` user but nothing sends the mail;
  wire an adapter behind a port in `application/users`.
- **No password reset flow.** The building blocks exist (`setPasswordHash` bumps
  `tokenVersion`, revoking every session) but the token-issuing endpoint is not written.
- **No breached-password check.** `Password` enforces length and a small blocklist; a
  production deployment should add a k-anonymity check against Have I Been Pwned.
- **Refresh tokens have no absolute lifetime.** Each rotation extends the window, so an
  active session never forces re-authentication. Add a `familyExpiresAt` if your threat
  model needs a hard cap.
- **Search uses `ILIKE '%term%'`**, which cannot use a B-tree index. Fine to a few hundred
  thousand rows; past that add the `pg_trgm` GIN indexes described in
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#large-datasets).
- **No audit log.** Membership changes are hard-deleted; who-did-what needs a separate
  append-only table.
