import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Ambient per-request data: who is calling, which tenant they are acting in,
 * and the ids that stitch this request's logs together.
 */
export interface RequestContext {
  /** Unique per request. Echoed as `x-request-id` and on every error response. */
  readonly requestId: string;
  /**
   * Shared across every service touched by one user action. Taken from an
   * inbound `x-correlation-id` header if present, otherwise seeded from
   * `requestId`. This is what lets you follow a trace across the registrar and
   * this API in a log aggregator.
   */
  readonly correlationId: string;
  readonly ip?: string;
  readonly userAgent?: string;
  readonly method?: string;
  readonly path?: string;
  readonly startedAt: number;

  /** Populated by the JWT strategy once authentication succeeds. */
  userId?: string;
  tenantId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * AsyncLocalStorage rather than a request-scoped Nest provider. Request scope
 * forces Nest to instantiate a fresh provider tree per request — including
 * every transitive dependency — which is a measurable throughput loss on a hot
 * path, and it does not reach code that isn't in the DI graph at all (the Pino
 * serializers, the Prisma middleware).
 *
 * ALS costs a context switch and works everywhere, including inside
 * `setTimeout` and Prisma hooks.
 */
export const RequestContextStore = {
  /** Runs `fn` with `context` visible to everything it awaits, transitively. */
  run<T>(context: RequestContext, fn: () => T): T {
    return storage.run(context, fn);
  },

  /** `undefined` outside a request — background jobs and boot code, mostly. */
  get(): RequestContext | undefined {
    return storage.getStore();
  },

  get requestId(): string | undefined {
    return storage.getStore()?.requestId;
  },

  get correlationId(): string | undefined {
    return storage.getStore()?.correlationId;
  },

  get userId(): string | undefined {
    return storage.getStore()?.userId;
  },

  get tenantId(): string | undefined {
    return storage.getStore()?.tenantId;
  },

  /**
   * Attaches the authenticated principal after the guard has run. Mutating the
   * stored object is intentional: the context is created before we know who is
   * calling, and every later log line in this request should carry the identity.
   */
  setPrincipal(principal: { userId?: string; tenantId?: string }): void {
    const context = storage.getStore();
    if (!context) return;
    if (principal.userId !== undefined) context.userId = principal.userId;
    if (principal.tenantId !== undefined) context.tenantId = principal.tenantId;
  },
} as const;
