import { Inject, Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '@infrastructure/cache/redis.provider';

/**
 * Redis-backed rate-limit counters.
 *
 * The default storage is a per-process `Map`, which means the effective limit
 * is `configured limit × replica count` and drifts every time you scale. With
 * five replicas behind a round-robin balancer, a "5 attempts per minute" login
 * limit really allows 25 — enough to make online password guessing viable
 * again, which is the one thing the limit exists to prevent.
 *
 * Implemented directly rather than pulling in a package: it is one Lua script,
 * and the script matters. Doing INCR and PEXPIRE as separate commands leaves a
 * window where a crash between them strands a key with no expiry — a counter
 * that never resets, permanently locking out whoever owns it. In a single
 * script the two are atomic.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  /**
   * KEYS[1] hit counter, KEYS[2] block marker.
   * ARGV[1] window TTL (ms), ARGV[2] limit, ARGV[3] block duration (ms).
   *
   * Returns { totalHits, timeToExpire, isBlocked, timeToBlockExpire }.
   */
  private static readonly SCRIPT = `
    local blockTtl = redis.call('PTTL', KEYS[2])
    if blockTtl > 0 then
      return { tonumber(redis.call('GET', KEYS[1]) or ARGV[2]), 0, 1, blockTtl }
    end

    local hits = redis.call('INCR', KEYS[1])
    if hits == 1 then
      redis.call('PEXPIRE', KEYS[1], ARGV[1])
    end

    local ttl = redis.call('PTTL', KEYS[1])

    if hits > tonumber(ARGV[2]) then
      redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
      return { hits, ttl, 1, tonumber(ARGV[3]) }
    end

    return { hits, ttl, 0, 0 }
  `;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `throttle:block:${throttlerName}:${key}`;

    try {
      const [totalHits, timeToExpire, isBlocked, timeToBlockExpire] = (await this.redis.eval(
        RedisThrottlerStorage.SCRIPT,
        2,
        hitKey,
        blockKey,
        ttl,
        limit,
        blockDuration || ttl,
      )) as [number, number, number, number];

      return {
        totalHits,
        // The guard expects seconds; Redis reports milliseconds.
        timeToExpire: Math.ceil(timeToExpire / 1000),
        isBlocked: isBlocked === 1,
        timeToBlockExpire: Math.ceil(timeToBlockExpire / 1000),
      };
    } catch {
      // Fail *open*. A Redis outage should not lock every user out of the API;
      // the denylist is the security control that fails closed, and it is
      // independent of this. Rate limiting is availability protection, and
      // trading a full outage for a window of unthrottled traffic is the right
      // way round.
      return { totalHits: 1, timeToExpire: Math.ceil(ttl / 1000), isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}
