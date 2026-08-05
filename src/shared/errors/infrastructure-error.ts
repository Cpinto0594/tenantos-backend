import { ErrorCode } from './error-code';

/**
 * A dependency failed: Postgres is down, Redis refused the connection, a query
 * hit its statement timeout.
 *
 * Distinct from DomainError because the two need opposite handling. A domain
 * error is a correct answer to a bad request — log it at warn, return 4xx, and
 * move on. An infrastructure error means *we* are broken: it pages someone,
 * returns 5xx, and must never leak the driver's message (which routinely
 * contains connection strings, table structure, or row values) to the caller.
 *
 * The original error travels in `cause` for the logs and stops there.
 */
export class InfrastructureError extends Error {
  readonly isExpected = false;

  constructor(
    readonly code: ErrorCode,
    message: string,
    override readonly cause?: unknown,
    readonly context?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }

  static database(message: string, cause?: unknown, context?: Record<string, unknown>) {
    return new InfrastructureError(ErrorCode.DATABASE_UNAVAILABLE, message, cause, context);
  }

  static cache(message: string, cause?: unknown, context?: Record<string, unknown>) {
    return new InfrastructureError(ErrorCode.CACHE_UNAVAILABLE, message, cause, context);
  }
}
