import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import type { TokenDenylistPort } from '@domain/auth/auth.ports';
import { InfrastructureError } from '@shared/errors/infrastructure-error';
import { CacheKey } from '@infrastructure/cache/cache-keys';
import { REDIS_CLIENT } from '@infrastructure/cache/redis.provider';

/**
 * Immediate revocation for individual access tokens.
 *
 * This is the narrow complement to `tokenVersion`. Bumping the user's version
 * kills *all* their tokens with no extra I/O and covers password changes,
 * suspension and privilege edits. This covers the case it cannot: "sign this
 * one device out" and "that specific token leaked", without disturbing the
 * user's other sessions.
 *
 * **Fails closed**, unlike CacheService. If Redis is unreachable we cannot tell
 * whether a token was revoked, and the only safe answer to "is this revoked?"
 * is yes. That means a Redis outage logs everyone out rather than silently
 * honouring revoked tokens — the correct trade for a security control, and the
 * reason this does not go through the fail-open cache.
 *
 * Entries expire with the token itself, so the denylist can never hold more
 * than one access-token lifetime of logouts.
 */
@Injectable()
export class TokenDenylistService implements TokenDenylistPort {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TokenDenylistService.name);
  }

  async add(jti: string, expiresAt: Date): Promise<void> {
    const ttlSeconds = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);
    // Already expired: the signature check will reject it anyway.
    if (ttlSeconds <= 0) return;

    try {
      await this.redis.set(CacheKey.denylist(jti), '1', 'EX', ttlSeconds);
    } catch (error) {
      // A failed logout must not report success — the client would show
      // "signed out" while the token stays valid until it expires.
      throw InfrastructureError.cache('Could not revoke the token', error, { jti });
    }
  }

  async has(jti: string): Promise<boolean> {
    try {
      return (await this.redis.exists(CacheKey.denylist(jti))) === 1;
    } catch (error) {
      this.logger.error({ jti, err: error }, 'Denylist unavailable — rejecting the token (fail closed)');
      return true;
    }
  }
}
