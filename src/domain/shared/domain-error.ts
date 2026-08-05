import { ErrorCode } from '@shared/errors/error-code';

/**
 * Base class for every error the *business* can produce.
 *
 * Deliberately not a Nest `HttpException`: the domain layer must not know that
 * HTTP exists. Mapping to a status code happens once, in
 * GlobalExceptionFilter — which means the same use case can be driven from a
 * controller, a WebSocket handler, or a background job and produce a sensible
 * error in each.
 *
 * `details` is structured data safe to return to the caller (which field, which
 * id). Anything sensitive belongs in the log, not here.
 */
export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode;

  /**
   * Whether this error indicates a bug (`true`) or an expected outcome of a
   * valid request (`false`). Drives log level: expected errors log at `warn`
   * without a stack, unexpected ones at `error` with one. Without this
   * distinction, "user typed the wrong password" pollutes the error budget.
   */
  readonly isExpected: boolean = true;

  readonly details?: Readonly<Record<string, unknown>>;

  protected constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    if (details) this.details = Object.freeze({ ...details });
    Error.captureStackTrace?.(this, new.target);
  }
}

/** The requested aggregate does not exist (or the caller may not see it). */
export abstract class NotFoundError extends DomainError {}

/** The request conflicts with existing state — duplicate key, already a member. */
export abstract class ConflictError extends DomainError {}

/** The request is well-formed but violates a business rule. */
export abstract class BusinessRuleError extends DomainError {}

/** The caller is not permitted to perform this action on this resource. */
export abstract class AuthorizationError extends DomainError {}

/** The caller's identity could not be established. */
export abstract class AuthenticationError extends DomainError {}

/**
 * An optimistic-locking failure: the row changed between read and write.
 *
 * Surfaces as 409 so clients can re-read and retry. Retrying automatically in
 * the repository would be wrong — the caller's decision was based on the stale
 * value it read, so it needs to make that decision again.
 */
export class ConcurrentModificationError extends ConflictError {
  readonly code = ErrorCode.CONCURRENT_MODIFICATION;

  constructor(entity: string, id: string) {
    super(`${entity} was modified by another request; re-read it and retry`, { entity, id });
  }
}

/**
 * A keyset cursor that did not survive `Cursor.decode`.
 *
 * Rejected rather than ignored: silently falling back to the first page turns a
 * client bug — or a tampered cursor — into an infinite loop that re-reads page
 * one forever, and the caller never finds out why.
 */
export class InvalidCursorError extends BusinessRuleError {
  readonly code = ErrorCode.VALIDATION_FAILED;

  constructor() {
    super('The pagination cursor is malformed', { field: 'cursor' });
  }
}
