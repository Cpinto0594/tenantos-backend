import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  PASSWORD_HASHER,
  REFRESH_TOKEN_REPOSITORY,
  TOKEN_SERVICE,
  type PasswordHasherPort,
  type RefreshTokenRepositoryPort,
  type TokenServicePort,
} from '@domain/auth/auth.ports';
import { RefreshToken } from '@domain/auth/refresh-token.entity';
import { Email } from '@domain/user/email.vo';
import { InvalidCredentialsError } from '@domain/user/user.errors';
import { USER_REPOSITORY, type UserRepositoryPort } from '@domain/user/user.repository.port';
import { AppConfigService } from '@infrastructure/config/app-config.service';
import { MetricsService } from '@infrastructure/observability/metrics.service';
import type { AuthenticationResult, ClientFingerprint } from './auth.types';
import { buildAuthenticationResult } from './build-auth-result';

export interface LoginCommand {
  readonly email: string;
  readonly password: string;
  /** Optional: sign straight into a specific workspace. */
  readonly tenantId?: string;
  readonly fingerprint: ClientFingerprint;
}

/**
 * Email + password authentication.
 *
 * The security properties worth preserving when editing this:
 *
 *  1. **Uniform failure.** Unknown email, wrong password and inactive account
 *     must be indistinguishable to an unauthenticated caller — same error code,
 *     same message, same latency. The `simulateVerification` call on the
 *     no-such-user path exists solely to equalise timing.
 *  2. **Uniform latency.** Argon2 verification dominates the response time, so
 *     skipping it when no user matched would leak account existence through a
 *     stopwatch.
 *  3. **Fresh session per login.** Each login opens its own refresh-token
 *     family, so revoking one device leaves the others signed in.
 */
@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenServicePort,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepositoryPort,
    private readonly config: AppConfigService,
    private readonly metrics: MetricsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LoginUseCase.name);
  }

  async execute(command: LoginCommand): Promise<AuthenticationResult> {
    const email = Email.create(command.email);
    const user = await this.users.findByEmail(email);

    if (!user || user.passwordHash === null) {
      // Burn the same CPU a real verification would, then fail identically.
      await this.hasher.simulateVerification();
      this.metrics.authAttemptsTotal.inc({ result: 'invalid_credentials' });
      throw new InvalidCredentialsError();
    }

    const passwordMatches = await this.hasher.verify(user.passwordHash, command.password);
    if (!passwordMatches) {
      this.metrics.authAttemptsTotal.inc({ result: 'invalid_credentials' });
      // Log the masked address: enough to investigate a credential-stuffing
      // run, not enough to turn the log into a list of registered accounts.
      this.logger.warn({ email: email.toMasked() }, 'Failed login: wrong password');
      throw new InvalidCredentialsError();
    }

    // Status checks come *after* the password check, so a suspended account
    // cannot be distinguished from a nonexistent one without the password.
    try {
      user.assertCanAuthenticate();
    } catch (error) {
      this.metrics.authAttemptsTotal.inc({ result: 'inactive' });
      throw error;
    }

    // The one moment the plaintext exists and the hash can be upgraded to
    // current parameters. Deliberately does not bump `tokenVersion`.
    if (this.hasher.needsRehash(user.passwordHash)) {
      user.upgradePasswordHash(await this.hasher.hash(command.password));
      await this.users.save(user);
      this.logger.info({ userId: user.id }, 'Upgraded password hash to current parameters');
    }

    const result = await buildAuthenticationResult({
      user,
      tokens: this.tokens,
      config: this.config,
    });

    // A brand-new family: this login is a new session, independent of any other
    // device the user is signed in on.
    await this.refreshTokens.create(
      RefreshToken.issue({
        userId: user.id,
        tokenHash: this.tokens.hashRefreshToken(result.tokens.refreshToken),
        ttlSeconds: this.config.jwt.refreshTtlS,
        userAgent: command.fingerprint.userAgent,
        ipAddress: command.fingerprint.ipAddress,
      }),
    );

    await this.users.touchLastLogin(user.id, new Date());
    this.metrics.authAttemptsTotal.inc({ result: 'success' });
    this.logger.info({ userId: user.id }, 'Login succeeded');

    return result;
  }
}
