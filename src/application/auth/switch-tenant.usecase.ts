import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, type TokenServicePort } from '@domain/auth/auth.ports';
import { UserNotFoundError } from '@domain/user/user.errors';
import { USER_REPOSITORY, type UserRepositoryPort } from '@domain/user/user.repository.port';
import { AppConfigService } from '@infrastructure/config/app-config.service';
import type { AuthenticatedPrincipal } from './auth.types';
import { buildAuthenticationResult } from './build-auth-result';

export interface SwitchTenantCommand {
  readonly userId: string;
  readonly tenantId: string;
}

export interface SwitchTenantResult {
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly principal: AuthenticatedPrincipal;
}

/**
 * Re-scopes the session to another workspace the user already belongs to.
 *
 * Issues a new *access* token only; the refresh token is untouched. The
 * workspace a session is looking at is not a new authentication, so it should
 * not open a new token family or reset the session's absolute lifetime.
 *
 * Membership and tenant status are re-read from the database rather than
 * trusted from the caller's current token — the token was minted before this
 * request and says nothing about whether the user still has access.
 */
@Injectable()
export class SwitchTenantUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenServicePort,
    private readonly config: AppConfigService,
  ) {}

  async execute(command: SwitchTenantCommand): Promise<SwitchTenantResult> {
    const user = await this.users.findById(command.userId);
    if (!user) throw new UserNotFoundError(command.userId);
    user.assertCanAuthenticate();

    // Throws if the user is not a member or the workspace is not active.
    const result = await buildAuthenticationResult({
      user,
      tokens: this.tokens,
      config: this.config,
    });

    return {
      accessToken: result.tokens.accessToken,
      expiresIn: result.tokens.expiresIn,
      principal: result.principal,
    };
  }
}
