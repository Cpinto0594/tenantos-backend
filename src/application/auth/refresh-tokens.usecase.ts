import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  REFRESH_TOKEN_REPOSITORY,
  TOKEN_SERVICE,
  type RefreshTokenRepositoryPort,
  type TokenServicePort,
} from '@domain/auth/auth.ports';
import { InvalidTokenError, RefreshTokenReusedError, TokenExpiredError } from '@domain/auth/auth.errors';
import { RefreshToken } from '@domain/auth/refresh-token.entity';
import { UserNotFoundError } from '@domain/user/user.errors';
import { USER_REPOSITORY, type UserRepositoryPort } from '@domain/user/user.repository.port';
import { AppConfigService } from '@infrastructure/config/app-config.service';
import { MetricsService } from '@infrastructure/observability/metrics.service';
import type { AuthenticationResult, ClientFingerprint } from './auth.types';
import { buildAuthenticationResult } from './build-auth-result';

export interface RefreshTokensCommand {
  readonly refreshToken: string;
  /** Keeps the new access token scoped to the workspace the client is in. */
  readonly tenantId?: string;
  readonly fingerprint: ClientFingerprint;
}

/**
 * Refresh-token rotation with reuse detection.
 *
 * Every refresh consumes the presented token and issues a successor in the same
 * family, so a token can be used exactly once. If one is ever presented twice,
 * a copy exists that should not, and the whole family is destroyed.
 *
 * That detection is the entire reason rotation is worth its complexity: without
 * it, a stolen refresh token grants indefinite access and nothing ever notices.
 * With it, the theft is detected the moment either party refreshes after the
 * other, at the cost of a forced re-login.
 *
 * **Deliberately not wrapped in a transaction.** The obvious implementation
 * reads, checks, revokes and issues inside one — and it is wrong twice over:
 *
 *  1. The reuse path revokes the family and then *throws*, which rolls the
 *     revocation back. The attacker keeps their session and the log claims it
 *     was revoked. This is easy to miss because the error response looks right.
 *  2. Two concurrent refreshes with the same token can both read "not revoked"
 *     before either writes, so both succeed and detection never fires.
 *
 * Instead, `consume` is a single conditional UPDATE acting as a
 * compare-and-swap: exactly one caller wins, the loser is treated as reuse, and
 * every revocation is committed independently of what is thrown afterwards.
 */
@Injectable()
export class RefreshTokensUseCase {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenServicePort,
    private readonly config: AppConfigService,
    private readonly metrics: MetricsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RefreshTokensUseCase.name);
  }

  async execute(command: RefreshTokensCommand): Promise<AuthenticationResult> {
    const presentedHash = this.tokens.hashRefreshToken(command.refreshToken);
    const now = new Date();

    const stored = await this.refreshTokens.findByHash(presentedHash);

    // No such token: fabricated, or old enough to have been swept.
    if (!stored) throw new InvalidTokenError('Unknown refresh token');

    // Already revoked — whether by an earlier rotation, a logout, or a previous
    // reuse. Presenting it again means a copy is in circulation.
    if (stored.isRevoked) {
      await this.detectedReuse(stored.userId, stored.familyId, stored.revokedReason, command, now);
    }

    if (stored.isExpired(now)) throw new TokenExpiredError();

    // The compare-and-swap. Losing this race means the same token was consumed
    // concurrently, which is reuse by definition.
    const won = await this.refreshTokens.consume(stored.id, 'rotated', now);
    if (!won) {
      await this.detectedReuse(stored.userId, stored.familyId, 'concurrent-use', command, now);
    }

    const user = await this.users.findById(stored.userId);
    if (!user) throw new UserNotFoundError(stored.userId);

    // Re-checked on every refresh, not just at login: a user suspended five
    // minutes ago must not be able to extend their session.
    user.assertCanAuthenticate();

    const result = await buildAuthenticationResult({
      user,
      tokens: this.tokens,
      config: this.config,
    });

    // The successor joins the same family, so "sign this device out" remains
    // one revocation regardless of how many times the session has rotated.
    await this.refreshTokens.create(
      RefreshToken.issue(
        {
          userId: user.id,
          familyId: stored.familyId,
          tokenHash: this.tokens.hashRefreshToken(result.tokens.refreshToken),
          ttlSeconds: this.config.jwt.refreshTtlS,
          userAgent: command.fingerprint.userAgent,
          ipAddress: command.fingerprint.ipAddress,
        },
        now,
      ),
    );

    this.logger.debug({ userId: user.id, familyId: stored.familyId }, 'Rotated refresh token');
    return result;
  }

  /**
   * Revokes the compromised session and throws. Never returns — the `never`
   * return type lets callers treat a call as a terminating statement.
   */
  private async detectedReuse(
    userId: string,
    familyId: string,
    originalReason: string | null,
    command: RefreshTokensCommand,
    now: Date,
  ): Promise<never> {
    // Committed before the throw, and outside any transaction, so the
    // revocation survives the error that follows it.
    const revoked = await this.refreshTokens.revokeFamily(familyId, 'reuse-detected', now);

    this.metrics.authAttemptsTotal.inc({ result: 'reuse_detected' });
    this.logger.error(
      {
        userId,
        familyId,
        revokedCount: revoked,
        originalReason,
        ip: command.fingerprint.ipAddress,
        userAgent: command.fingerprint.userAgent,
      },
      'Refresh token reuse detected — revoked the entire token family',
    );

    throw new RefreshTokenReusedError();
  }
}
