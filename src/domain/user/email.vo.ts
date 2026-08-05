import { BusinessRuleError } from '@domain/shared/domain-error';
import { ErrorCode } from '@shared/errors/error-code';

export class InvalidEmailError extends BusinessRuleError {
  readonly code = ErrorCode.VALIDATION_FAILED;

  constructor(reason: string) {
    super(`Invalid email address: ${reason}`, { field: 'email' });
  }
}

/**
 * A validated, normalised email address.
 *
 * Exists as a type so that "normalise before comparing" cannot be forgotten.
 * Uniqueness in this system is case-insensitive; if normalisation lived in the
 * controller, one write path that skipped it would let `Bob@x.com` and
 * `bob@x.com` both register, and the unique index would not stop it.
 *
 * The pattern is intentionally permissive. Fully validating an address per
 * RFC 5322 is famously not worth it — the only real proof an address works is
 * sending mail to it, which the invite flow does.
 */
export class Email {
  private static readonly PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
  /** RFC 5321 limit. Also the column width, so an over-long value fails here rather than in Postgres. */
  private static readonly MAX_LENGTH = 320;

  private constructor(readonly value: string) {}

  static create(raw: string): Email {
    const normalized = raw.trim().toLowerCase();

    if (normalized.length === 0) throw new InvalidEmailError('must not be empty');
    if (normalized.length > Email.MAX_LENGTH) {
      throw new InvalidEmailError(`must be at most ${Email.MAX_LENGTH} characters`);
    }
    if (!Email.PATTERN.test(normalized)) throw new InvalidEmailError('must be a valid address');

    return new Email(normalized);
  }

  /** For values already normalised by the database. Skips validation by design. */
  static fromPersisted(value: string): Email {
    return new Email(value);
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  /** `j***@example.com` — for logs, where a full address is personal data. */
  toMasked(): string {
    const [local = '', domain = ''] = this.value.split('@');
    const head = local.slice(0, 1);
    return `${head}${'*'.repeat(Math.max(0, local.length - 1))}@${domain}`;
  }
}
