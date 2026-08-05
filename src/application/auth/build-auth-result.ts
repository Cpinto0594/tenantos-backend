import type { TokenServicePort } from '@domain/auth/auth.ports';
import type { AppConfigService } from '@infrastructure/config/app-config.service';
import type { AuthenticationResult } from './auth.types';
import { User } from '@domain/user/user.entity';

/**
 * Resolves which workspace a session is scoped to and mints the token pair.
 *
 * Shared by login, refresh and tenant-switch so the three cannot drift — a
 * refresh that forgot to re-check membership would let a removed member keep
 * their access indefinitely by refreshing.
 *
 * Scope resolution:
 *   - an explicitly requested tenant is honoured only if the user is still a
 *     member of it and it is still active;
 *   - otherwise, a user with exactly one workspace is scoped into it, because
 *     making a single-workspace user perform an extra "select workspace" round
 *     trip is friction with no security value;
 *   - a user with several workspaces gets an unscoped token and picks one.
 */
export async function buildAuthenticationResult(input: {
  user: User;
  tokens: TokenServicePort;
  config: AppConfigService;
}): Promise<AuthenticationResult> {
  const { user, tokens, config } = input;

  const access = await tokens.issueAccessToken({
    userId: user.id,
    tokenVersion: user.tokenVersion,
    isPlatformAdmin: user.isPlatformAdmin,
    //...(scoped ? { tenantId: scoped.id, role: scoped.role } : {}),
  });

  const refresh = tokens.generateRefreshToken();

  return {
    tokens: {
      accessToken: access.token,
      refreshToken: refresh.raw,
      tokenType: 'Bearer',
      expiresIn: access.expiresInSeconds,
      refreshExpiresIn: config.jwt.refreshTtlS,
    },
    principal: {
      userId: user.id,
      email: user.email.value,
      displayName: user.displayName,
      isPlatformAdmin: user.isPlatformAdmin,
    },
  };
}
