/**
 * Every cache key in the system is built here.
 *
 * Keys built inline at call sites are how you end up with `user:123` written by
 * the writer and `users:123` by the invalidator — a bug that presents as
 * "stale data, sometimes, for five minutes".
 *
 * Structure: `<schema-version>:<entity>:<discriminator>`. The ioredis client
 * prepends the environment prefix, so the full key is
 * `tenantos:dev:v1:user:<uuid>`.
 */

/**
 * Bump when a cached value's *shape* changes in a backwards-incompatible way.
 * A deploy then reads no stale entries at all, and the old ones expire on their
 * own TTL — which beats a flush, and beats deserialising last version's JSON
 * into this version's type.
 */
const SCHEMA_VERSION = 'v1';

const key = (...parts: (string | number)[]) => [SCHEMA_VERSION, ...parts].join(':');

export const CacheKey = {
  /** A single user projection, invalidated on every write to that user. */
  user: (userId: string) => key('user', userId),

  /** Role lookup on the authorization hot path. */
  membership: (userId: string, tenantId: string) => key('membership', userId, tenantId),

  /** A user's workspace list — read on login and by the workspace picker. */
  userTenants: (userId: string) => key('user-tenants', userId),

  tenant: (tenantId: string) => key('tenant', tenantId),
  tenantBySlug: (slug: string) => key('tenant-slug', slug),

  /** Revoked access tokens, keyed by jti. TTL matches the token's own expiry. */
  denylist: (jti: string) => key('denylist', jti),

  /** Namespace prefix for wildcard invalidation — see CacheService.deleteByPrefix. */
  tenantScope: (tenantId: string) => key('t', tenantId),
} as const;

/** Sensible TTLs per class of data. Seconds. */
export const CacheTtl = {
  /** Authorization data: short, because a revoked role must not linger. */
  authorization: 60,
  /** Entity projections: a stale profile for a minute is harmless. */
  entity: 300,
  /** Rarely-changing reference data. */
  reference: 3_600,
} as const;
