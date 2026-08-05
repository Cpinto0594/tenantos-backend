import {
  AuthenticationError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '@domain/shared/domain-error';
import { ErrorCode } from '@shared/errors/error-code';

export class UserNotFoundError extends NotFoundError {
  readonly code = ErrorCode.USER_NOT_FOUND;

  constructor(identifier: string) {
    // The identifier is echoed only when it is an id the caller already holds.
    // Never echo an email here: it turns 404-vs-200 into an account enumeration
    // oracle. Callers looking up by email pass a placeholder.
    super('User not found', { identifier });
  }
}

export class EmailAlreadyExistsError extends ConflictError {
  readonly code = ErrorCode.EMAIL_ALREADY_EXISTS;

  constructor() {
    super('That email address is already registered');
  }
}

/**
 * Deliberately says nothing about *which* half was wrong. "No such user" versus
 * "wrong password" hands an attacker a free account-enumeration endpoint.
 */
export class InvalidCredentialsError extends AuthenticationError {
  readonly code = ErrorCode.INVALID_CREDENTIALS;

  constructor() {
    super('Invalid email or password');
  }
}

export class AccountNotActiveError extends AuthenticationError {
  readonly code = ErrorCode.ACCOUNT_NOT_ACTIVE;

  constructor(status: string) {
    super('This account cannot sign in', { status });
  }
}

export class PasswordNotSetError extends AuthenticationError {
  readonly code = ErrorCode.PASSWORD_NOT_SET;

  constructor() {
    super('This account has no password set. Complete the invitation first.');
  }
}

export class CurrentPasswordIncorrectError extends AuthenticationError {
  readonly code = ErrorCode.CURRENT_PASSWORD_INCORRECT;

  constructor() {
    super('The current password is incorrect');
  }
}

export class PasswordReusedError extends BusinessRuleError {
  readonly code = ErrorCode.PASSWORD_REUSED;

  constructor() {
    super('The new password must differ from the current one');
  }
}

export class CannotModifySelfError extends BusinessRuleError {
  readonly code = ErrorCode.CANNOT_MODIFY_SELF;

  constructor(action: string) {
    super(`You cannot ${action} your own account`, { action });
  }
}
