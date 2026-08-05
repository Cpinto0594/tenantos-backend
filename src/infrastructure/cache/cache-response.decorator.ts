import { SetMetadata } from '@nestjs/common';
import { METADATA } from '@shared/constants/http.constants';

export interface CacheResponseOptions {
  /** Seconds. Keep it short — see the "what not to cache" note in CacheService. */
  ttlSeconds: number;
  /**
   * Who may share a cache entry:
   *   `user`   — keyed by the authenticated user. The safe default.
   *   `tenant` — shared by everyone in one workspace. Only for data that is
   *              identical for every member regardless of role.
   *   `public` — shared by everyone. Only for genuinely public, unauthenticated
   *              responses; getting this wrong leaks one user's data to another.
   */
  scope: 'user' | 'tenant' | 'public';
}

/**
 * Caches a GET handler's response in Redis.
 *
 * Applies only to GET — caching a mutation's response would serve a stale
 * result to a caller whose write did land, and the interceptor enforces this
 * regardless of what the decorator says.
 */
export const CacheResponse = (options: CacheResponseOptions) => SetMetadata(METADATA.CACHE, options);
