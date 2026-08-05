import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  REFRESH_TOKEN_REPOSITORY,
  TOKEN_DENYLIST,
  TOKEN_SERVICE,
  type RefreshTokenRepositoryPort,
  type TokenDenylistPort,
  type TokenServicePort,
} from '@domain/auth/auth.ports';
import { USER_REPOSITORY, type UserRepositoryPort } from '@domain/user/user.repository.port';

export interface LogoutCommand {
  readonly userId: string;
  /** The refresh token being surrendered. Absent if the client only holds an access token. */
  readonly refreshToken?: string;
  /** jti and expiry of the access token used to make this call. */
  readonly accessTokenJti?: string;
  readonly accessTokenExpiresAt?: Date;
}

/**
 * Ends a session.
 *
 * Both halves matter, and each alone is a bug:
 *
 *  - Revoking the refresh token stops the session being extended, but the
 *    access token stays valid until it expires — up to 15 minutes of access
 *    after the user pressed "sign out".
 *  - Denylisting the access token closes that window but leaves the refresh
 *    token able to mint a new one.
 *
 * Best effort by design: a logout that fails leaves the user *signed in*, which
 * is the worse outcome. Errors are logged, not propagated.
 */
@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepositoryPort,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenServicePort,
    @Inject(TOKEN_DENYLIST) private readonly denylist: TokenDenylistPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LogoutUseCase.name);
  }

  /** Signs out this one device, leaving the user's other sessions alone. */
  async execute(command: LogoutCommand): Promise<void> {
    const now = new Date();

    if (command.refreshToken) {
      const stored = await this.refreshTokens.findByHash(this.tokens.hashRefreshToken(command.refreshToken));

      // Revoking the family, not just the row: the presented token may be an
      // older link in the chain, and leaving its successors alive would leave
      // the session usable.
      if (stored && stored.userId === command.userId) {
        await this.refreshTokens.revokeFamily(stored.familyId, 'logout', now);
      }
    }

    await this.denylistAccessToken(command);
    this.logger.info({ userId: command.userId }, 'Logged out');
  }

  /**
   * Signs out everywhere. Used for "sign out all devices" and after a password
   * reset from a compromised account.
   *
   * Bumping `tokenVersion` is what makes this instantaneous: every access token
   * in existence carries the old value and is rejected on its next use, with no
   * per-token bookkeeping.
   */
  async executeAll(command: LogoutCommand): Promise<void> {
    const now = new Date();
    const revoked = await this.refreshTokens.revokeAllForUser(command.userId, 'logout-all', now);

    const user = await this.users.findById(command.userId);
    if (user) {
      user.invalidateSessions();
      await this.users.save(user);
    }

    await this.denylistAccessToken(command);
    this.logger.info({ userId: command.userId, revokedSessions: revoked }, 'Logged out of all devices');
  }

  private async denylistAccessToken(command: LogoutCommand): Promise<void> {
    if (!command.accessTokenJti || !command.accessTokenExpiresAt) return;

    try {
      await this.denylist.add(command.accessTokenJti, command.accessTokenExpiresAt);
    } catch (error) {
      // Redis is down. The refresh token is already revoked, so the blast
      // radius is one access-token lifetime rather than an open session.
      this.logger.error({ err: error, userId: command.userId }, 'Could not denylist the access token');
    }
  }
}
