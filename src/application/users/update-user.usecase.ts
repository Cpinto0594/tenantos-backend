import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  PASSWORD_HASHER,
  REFRESH_TOKEN_REPOSITORY,
  type PasswordHasherPort,
  type RefreshTokenRepositoryPort,
} from '@domain/auth/auth.ports';
import { Password } from '@domain/user/password.vo';
import {
  CurrentPasswordIncorrectError,
  PasswordNotSetError,
  PasswordReusedError,
  UserNotFoundError,
} from '@domain/user/user.errors';
import { USER_REPOSITORY, type UserRepositoryPort } from '@domain/user/user.repository.port';

export interface ChangePasswordCommand {
  readonly userId: string;
  readonly currentPassword: string;
  readonly newPassword: string;
}

/**
 * Mutations a user performs on their own account.
 *
 * Scoped to the *self-service* paths: every method here takes the acting user's
 * own id and needs no authorization check beyond the guard that produced it.
 * Administrative edits (suspending someone, granting platform admin) are a
 * different use case with a different threat model — they need an actor, a
 * target, and CannotModifySelfError.
 */
@Injectable()
export class UpdateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasherPort,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepositoryPort,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UpdateUserUseCase.name);
  }

  /**
   * Changes the caller's own password and signs every session out, including
   * the one making the call.
   *
   * The current password is required even though the caller is already
   * authenticated: without it, a stolen access token — or an unattended
   * session — is enough to take the account permanently.
   *
   * Both halves of the revocation matter, for the same reason logout does both:
   * `setPasswordHash` bumps `tokenVersion`, which kills the outstanding access
   * tokens on their next use, and `revokeAllForUser` kills the refresh tokens
   * that would otherwise mint replacements. A password change is what a user
   * does when they believe someone else is in their account, so leaving the
   * attacker's session alive would defeat the point of the feature.
   *
   * Unlike login, this path does not need to be timing-uniform: the caller is
   * already authenticated as this user, so "does this account exist" is not a
   * question the response can leak an answer to.
   */
  async changePassword(command: ChangePasswordCommand): Promise<void> {
    const user = await this.users.findById(command.userId);
    // The token authenticated against a row that has since been deleted.
    if (!user) throw new UserNotFoundError(command.userId);

    // An invited-but-never-activated account has nothing to verify against, and
    // must not be able to set a password through this route — that is the
    // invitation flow's job, and it proves control of the mailbox.
    if (user.passwordHash === null) throw new PasswordNotSetError();

    const currentMatches = await this.hasher.verify(user.passwordHash, command.currentPassword);
    if (!currentMatches) {
      this.logger.warn({ userId: user.id }, 'Password change refused: current password incorrect');
      throw new CurrentPasswordIncorrectError();
    }

    // Policy is applied to the new value only after the caller has proved they
    // hold the old one, so a stolen token cannot be used to probe the policy.
    const newPassword = Password.create(command.newPassword);

    // Compared against the stored hash rather than the plaintexts: it is the
    // only comparison that is still correct once the hash has been upgraded to
    // newer Argon2 parameters.
    const isReuse = await this.hasher.verify(user.passwordHash, newPassword.value);
    if (isReuse) throw new PasswordReusedError();

    // Bumps tokenVersion — see the entity.
    user.setPasswordHash(await this.hasher.hash(newPassword.value));
    await this.users.save(user);

    // Ordered after the save on purpose. Revoking first and then failing the
    // write would sign the user out while leaving the old password working.
    const revoked = await this.refreshTokens.revokeAllForUser(user.id, 'password-changed', new Date());

    this.logger.info({ userId: user.id, revokedSessions: revoked }, 'Password changed');
  }
}
