import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { AppConfigService } from '@infrastructure/config/app-config.service';
import { REDIS_CLIENT } from './redis.provider';

/**
 * Application cache.
 *
 * **Failure policy: fail open.** Every method swallows Redis errors and behaves
 * as a miss. A cache is an optimisation; if Redis is down the site should be
 * slow, not offline. The one place this is wrong is the token denylist, which
 * is a security control and therefore fails *closed* — it does not use this
 * class. See TokenDenylistService.
 *
 * **What not to cache**, since the temptation is to cache everything:
 *   - Anything used to make an authorization decision, beyond a few seconds.
 *     A revoked admin who keeps their powers for an hour is a security
 *     incident. Membership lookups here use a 60s TTL *and* are explicitly
 *     invalidated on role change.
 *   - Anything the caller just wrote. Read-after-write through a cache is how
 *     "I saved it and it reverted" bugs happen; write paths invalidate rather
 *     than repopulate.
 *   - Data that is cheap to fetch. A cached single-row primary-key lookup adds
 *     a network hop and an invalidation bug to save a sub-millisecond query.
 *   - Anything per-request-unique (search results with a free-text term,
 *     paginated listings past page 1) — the hit rate approaches zero and the
 *     entries evict things that would have been hits.
 */
@Injectable()
export class CacheService {
  private readonly defaultTtl: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.defaultTtl = config.redis.defaultTtlS;
    this.logger.setContext(CacheService.name);
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch (error) {
      // Covers both "Redis is unreachable" and "the cached value is not the
      // shape this version of the code expects". Both mean: go to the source.
      this.logger.warn({ key, err: error }, 'Cache read failed; treating as a miss');
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds = this.defaultTtl): Promise<void> {
    try {
      // Always with an expiry. A cache entry without a TTL is a memory leak
      // that also outlives the invalidation bug that stranded it.
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn({ key, err: error }, 'Cache write failed');
    }
  }

  async delete(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.redis.del(...keys);
    } catch (error) {
      // Worth a louder log than a failed read: a missed invalidation serves
      // stale data until the TTL expires.
      this.logger.warn(
        { keys, err: error },
        'Cache invalidation failed — entries will serve stale until TTL',
      );
    }
  }

  /**
   * Read-through with single-flight per process.
   *
   * The in-flight map collapses concurrent misses for the same key in *this*
   * process into one call to `loader`. Across processes, a popular key expiring
   * still lets one request per replica through — acceptable at this scale.
   * Proper cross-process stampede protection needs a distributed lock, which
   * costs a round trip on every miss and is only worth it when `loader` is
   * genuinely expensive.
   */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  async getOrSet<T>(key: string, loader: () => Promise<T>, ttlSeconds = this.defaultTtl): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = loader()
      .then(async (value) => {
        // `undefined` is not cacheable — JSON.stringify turns it into the
        // literal `undefined`, which JSON.parse then rejects on read.
        if (value !== undefined && value !== null) await this.set(key, value, ttlSeconds);
        return value;
      })
      .finally(() => this.inFlight.delete(key));

    this.inFlight.set(key, promise);
    return promise;
  }

  /**
   * Deletes every key under a prefix, using SCAN + UNLINK.
   *
   * SCAN, never KEYS: `KEYS *` is O(n) over the entire keyspace and blocks the
   * single-threaded server for the duration — on a large instance that is a
   * multi-second, site-wide stall. UNLINK rather than DEL so the actual
   * reclaim happens on a background thread.
   *
   * Still not free. Use it for coarse invalidation (a tenant's entire scope),
   * not on a hot path.
   */
  async deleteByPrefix(prefix: string): Promise<number> {
    // ioredis applies keyPrefix to commands but not to SCAN's MATCH pattern,
    // so it has to be prepended by hand.
    const fullPattern = `${this.config.redis.keyPrefix}:${prefix}*`;
    let deleted = 0;

    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.redis.scan(cursor, 'MATCH', fullPattern, 'COUNT', 500);
        cursor = next;

        if (keys.length > 0) {
          // Strip the prefix again: the client re-adds it on UNLINK.
          const unprefixed = keys.map((k) => k.slice(this.config.redis.keyPrefix.length + 1));
          await this.redis.unlink(...unprefixed);
          deleted += keys.length;
        }
      } while (cursor !== '0');
    } catch (error) {
      this.logger.warn({ prefix, err: error }, 'Prefix invalidation failed');
    }

    return deleted;
  }

  /** Liveness check for the health module. Throws if Redis is unreachable. */
  async ping(): Promise<void> {
    await this.redis.ping();
  }
}
