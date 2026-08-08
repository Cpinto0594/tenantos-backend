import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, type StrategyOptionsWithoutRequest } from 'passport-jwt';
import type { Request } from 'express';
import { InvalidTokenError, TokenRevokedError } from '@domain/auth/auth.errors';
import { TOKEN_DENYLIST, type AccessTokenClaims, type TokenDenylistPort } from '@domain/auth/auth.ports';
import { UserStatus } from '@domain/shared/enums';
import { AccountNotActiveError } from '@domain/user/user.errors';
import { USER_REPOSITORY, type UserRepositoryPort } from '@domain/user/user.repository.port';
import { AppConfigService } from '@infrastructure/config/app-config.service';
import { COOKIE } from '@shared/constants/http.constants';
import { RequestContextStore } from '@shared/context/request-context';
import type { AuthenticatedUser } from '../authenticated-user';

/**
 * Validates the access token on every authenticated request.
 *
 * Passport verifies the signature, issuer, audience and expiry before
 * `validate` runs. What is left is the part a signature cannot answer: has this
 * token been revoked since it was issued?
 *
 * Two mechanisms, in cost order:
 *
 *  1. `tokenVersion` — one indexed read of four columns, covering every bulk
 *     revocation (password change, suspension, privilege edit, sign-out-all).
 *  2. The Redis denylist — one `EXISTS`, covering revocation of a single token.
 *
 * Both are per-request I/O, which is the price of revocable stateless tokens.
 * The alternative (trust the signature alone) means a compromised token stays
 * valid for its full lifetime with no way to stop it.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: AppConfigService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(TOKEN_DENYLIST) private readonly denylist: TokenDenylistPort,
  ) {
    const options: StrategyOptionsWithoutRequest = {
      // Two accepted transports. The cookie is checked first so that a browser
      // client with an HttpOnly cookie works without any JS token handling,
      // while service-to-service callers keep using the header.
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => (request.cookies?.[COOKIE.ACCESS_TOKEN] as string | undefined) ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      secretOrKey: config.jwt.accessSecret,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      // Pinned: without this, a token with `alg: none` can pass verification.
      algorithms: ['HS256'],
      ignoreExpiration: false,
    };

    super(options);
  }

  async validate(claims: AccessTokenClaims): Promise<AuthenticatedUser> {
    console.log(`Print `, claims);
    if (!claims.sub || !claims.jti) throw new InvalidTokenError('Token is missing required claims');

    // Cheap and local — do it before spending a database round trip.
    if (await this.denylist.has(claims.jti)) {
      throw new TokenRevokedError('This token has been revoked');
    }

    const snapshot = await this.users.findAuthSnapshot(claims.sub);
    if (!snapshot || snapshot.deletedAt !== null) {
      // The user was deleted after the token was issued. Reported as an invalid
      // token rather than "user not found" — an unauthenticated caller learns
      // nothing about which ids exist.
      throw new InvalidTokenError();
    }

    // The revocation check. A stale `tv` means something invalidated this
    // user's sessions after the token was minted.
    if (snapshot.tokenVersion !== claims.tv) {
      throw new TokenRevokedError('Your session has ended. Sign in again.');
    }

    if (snapshot.status !== UserStatus.ACTIVE) {
      throw new AccountNotActiveError(snapshot.status);
    }

    // Read from the database, not the token: a platform-admin grant revoked a
    // minute ago must not survive in a token issued before it.
    const principal: AuthenticatedUser = {
      userId: snapshot.id,
      isPlatformAdmin: snapshot.isPlatformAdmin,
      ...(claims.tid ? { tenantId: claims.tid } : {}),
      ...(claims.role ? { role: claims.role } : {}),
      jti: claims.jti,
      tokenExpiresAt: new Date(claims.exp * 1000),
    };

    // Makes the identity available to every log line for the rest of the
    // request, including from code with no access to the request object.
    RequestContextStore.setPrincipal({
      userId: principal.userId,
      ...(principal.tenantId ? { tenantId: principal.tenantId } : {}),
    });

    return principal;
  }
}
