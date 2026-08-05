import { BusinessRuleError } from '@domain/shared/domain-error';
import { ErrorCode } from '@shared/errors/error-code';

export class WeakPasswordError extends BusinessRuleError {
  readonly code = ErrorCode.WEAK_PASSWORD;

  constructor(readonly failures: string[]) {
    super('Password does not meet the security policy', { failures });
  }
}

/**
 * A plaintext password that has passed policy. Never persisted, never logged —
 * it exists only long enough to be handed to the hasher.
 *
 * Policy follows NIST SP 800-63B: length is the dominant factor, and composition
 * rules ("must contain a symbol") mostly produce `Password1!`. We therefore
 * require real length, block the handful of passwords that appear in every
 * breach corpus, and stop there. A proper deployment adds a breached-password
 * check (k-anonymity against HIBP) at the use-case layer — see docs/AUTH.md.
 */
export class Password {
  static readonly MIN_LENGTH = 12;
  /** Argon2 hashes the input, but bcrypt-style truncation bugs and DoS via
   *  megabyte passwords are avoided by capping length regardless. */
  static readonly MAX_LENGTH = 128;

  private static readonly BLOCKLIST = new Set([
    'password',
    'password1',
    'password123',
    'qwertyuiop',
    '123456789012',
    'administrator',
    'letmein12345',
  ]);

  private constructor(readonly value: string) {}

  static create(raw: string): Password {
    const failures: string[] = [];

    if (raw.length < Password.MIN_LENGTH) {
      failures.push(`must be at least ${Password.MIN_LENGTH} characters`);
    }
    if (raw.length > Password.MAX_LENGTH) {
      failures.push(`must be at most ${Password.MAX_LENGTH} characters`);
    }
    // Trailing whitespace is nearly always a paste accident, and it makes the
    // password unreproducible when typed by hand.
    if (raw !== raw.trim()) {
      failures.push('must not start or end with whitespace');
    }
    if (Password.BLOCKLIST.has(raw.toLowerCase())) {
      failures.push('is among the most commonly used passwords');
    }
    if (/^(.)\1+$/.test(raw)) {
      failures.push('must not be a single repeated character');
    }

    if (failures.length > 0) throw new WeakPasswordError(failures);

    return new Password(raw);
  }

  /** Keeps the value out of logs, `console.log`, and error serialisers. */
  toString(): string {
    return '[REDACTED]';
  }

  toJSON(): string {
    return '[REDACTED]';
  }
}
