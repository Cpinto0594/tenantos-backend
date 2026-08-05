import { Injectable } from '@nestjs/common';
import { JwtService, TokenExpiredError as NestTokenExpiredError } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AppConfigService } from '@infrastructure/config/app-config.service';
import { InvalidTokenError, TokenExpiredError } from '@domain/auth/auth.errors';
import type {
  AccessTokenClaims,
  GeneratedRefreshToken,
  IssuedAccessToken,
  TokenServicePort,
} from '@domain/auth/auth.ports';
import type { MembershipRole } from '@domain/shared/enums';

@Injectable()
export class JwtTokenService implements TokenServicePort {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async issueAccessToken(input: {
    userId: string;
    tokenVersion: number;
    isPlatformAdmin: boolean;
    tenantId?: string;
    role?: MembershipRole;
  }): Promise<IssuedAccessToken> {
    const jti = randomUUID();
    const ttl = this.config.jwt.accessTtlS;

    const payload: Omit<AccessTokenClaims, 'iat' | 'exp' | 'iss' | 'aud'> = {
      sub: input.userId,
      tv: input.tokenVersion,
      adm: input.isPlatformAdmin,
      jti,
      ...(input.tenantId ? { tid: input.tenantId } : {}),
      ...(input.role ? { role: input.role } : {}),
    };

    const token = await this.jwt.signAsync(payload, {
      secret: this.config.jwt.accessSecret,
      expiresIn: ttl,
      issuer: this.config.jwt.issuer,
      audience: this.config.jwt.audience,
      // Pinned explicitly. Leaving the algorithm to the library's default is
      // how `alg: none` and RS256/HS256 confusion attacks get in.
      algorithm: 'HS256',
    });

    return {
      token,
      jti,
      expiresAt: new Date(Date.now() + ttl * 1000),
      expiresInSeconds: ttl,
    };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      return await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        secret: this.config.jwt.accessSecret,
        issuer: this.config.jwt.issuer,
        audience: this.config.jwt.audience,
        // Accepting only HS256 is the actual defence against algorithm
        // confusion: without it, a token signed with `alg: none` or with the
        // public key as an HMAC secret can verify.
        algorithms: ['HS256'],
        // No clock tolerance. Every host here runs NTP; accepting expired
        // tokens "a little" extends the revocation window for no benefit.
        clockTolerance: 0,
      });
    } catch (error) {
      // Expiry gets its own error so the client knows to refresh rather than
      // send the user back to the login screen.
      if (error instanceof NestTokenExpiredError) throw new TokenExpiredError();
      throw new InvalidTokenError();
    }
  }

  /**
   * Refresh tokens are opaque random strings, **not** JWTs. This is deliberate.
   *
   * A JWT refresh token is self-validating, which is exactly wrong for
   * something that must be revocable: you cannot un-issue a signature. An
   * opaque token is meaningless without the database row backing it, so
   * revocation is a single UPDATE and rotation is enforceable.
   *
   * 32 bytes of CSPRNG output = 256 bits. Guessing one is not a threat model.
   */
  generateRefreshToken(): GeneratedRefreshToken {
    const raw = randomBytes(32).toString('base64url');
    return { raw, hash: this.hashRefreshToken(raw) };
  }

  /**
   * SHA-256, not Argon2, and that is not a mistake: the input is already 256
   * bits of uniform randomness, so there is nothing to brute-force and no
   * dictionary to run. A slow KDF here would add ~50ms to every token refresh
   * and buy nothing. What matters is that the plaintext is never stored, so a
   * database dump cannot be replayed.
   */
  hashRefreshToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
