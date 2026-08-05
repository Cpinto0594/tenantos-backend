import { AuthenticationError } from '@domain/shared/domain-error';
import { ErrorCode } from '@shared/errors/error-code';

export class InvalidTokenError extends AuthenticationError {
  readonly code = ErrorCode.TOKEN_INVALID;

  constructor(reason = 'The token is malformed or its signature does not verify') {
    super(reason);
  }
}

export class TokenExpiredError extends AuthenticationError {
  readonly code = ErrorCode.TOKEN_EXPIRED;

  constructor() {
    // A distinct code from TOKEN_INVALID so clients know to hit /auth/refresh
    // rather than bouncing the user to the login screen.
    super('The token has expired');
  }
}

export class TokenRevokedError extends AuthenticationError {
  readonly code = ErrorCode.TOKEN_REVOKED;

  constructor(reason = 'This session has been revoked. Sign in again.') {
    super(reason);
  }
}

/**
 * A refresh token was presented twice. Either it leaked, or a client raced its
 * own refresh. Both are treated as compromise: the family is revoked and every
 * descendant session dies.
 *
 * The false positive (a client with two tabs refreshing simultaneously) is a
 * forced re-login. The false negative is an attacker holding a valid session
 * indefinitely. The trade is not close.
 */
export class RefreshTokenReusedError extends AuthenticationError {
  readonly code = ErrorCode.REFRESH_TOKEN_REUSED;

  constructor() {
    super('This session has been terminated for security reasons. Sign in again.');
  }
}
