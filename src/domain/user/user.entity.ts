import { randomUUID } from 'node:crypto';
import { UserStatus } from '@domain/shared/enums';
import { Email } from './email.vo';
import { AccountNotActiveError, PasswordNotSetError } from './user.errors';

/**
 * The flat, persistence-shaped view of a user.
 *
 * The repository maps rows to and from this, never to the entity's private
 * fields — so adding a field is a change in two visible places rather than a
 * silent partial write.
 */
export interface UserSnapshot {
  id: string;
  email: string;
  passwordHash: string | null;
  firstName: string | null;
  lastName: string | null;
  status: UserStatus;
  isPlatformAdmin: boolean;
  tokenVersion: number;
  lastLoginAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  registrarUserId: string | null;
}

export interface CreateUserInput {
  email: Email;
  /** Absent for an invited user — they set one by accepting the invitation. */
  passwordHash?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  status?: UserStatus;
  isPlatformAdmin?: boolean;
}

/**
 * The user aggregate root.
 *
 * State changes go through methods, never through field assignment: each one
 * decides whether it also has to bump `tokenVersion`, and that decision is the
 * whole revocation story. An anaemic version of this class with public setters
 * would let a caller suspend an account and leave its access tokens valid for
 * another fifteen minutes.
 *
 * `version` is the optimistic-locking counter and is deliberately immutable
 * here — the repository increments it in the UPDATE's WHERE clause, so an
 * entity that mutated it locally would fail its own write.
 */
export class User {
  private constructor(
    readonly id: string,
    private _email: Email,
    private _passwordHash: string | null,
    private _firstName: string | null,
    private _lastName: string | null,
    private _status: UserStatus,
    private _isPlatformAdmin: boolean,
    private _tokenVersion: number,
    private _lastLoginAt: Date | null,
    readonly version: number,
    readonly createdAt: Date,
    private _updatedAt: Date,
    private _deletedAt: Date | null,
    private _registrarUserId: string | null,
  ) {}

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  static create(input: CreateUserInput, now: Date = new Date()): User {
    // No password means the account was invited rather than registered: the row
    // exists so it can be granted memberships, but it cannot authenticate until
    // `setPasswordHash` runs.
    return new User(
      randomUUID(),
      input.email,
      input.passwordHash ?? null,
      input.firstName?.trim() || null,
      input.lastName?.trim() || null,
      input.status ?? (input.passwordHash ? UserStatus.ACTIVE : UserStatus.INVITED),
      input.isPlatformAdmin ?? false,
      0,
      null,
      0,
      now,
      now,
      null,
      null,
    );
  }

  static fromSnapshot(s: UserSnapshot): User {
    return new User(
      s.id,
      Email.fromPersisted(s.email),
      s.passwordHash,
      s.firstName,
      s.lastName,
      s.status,
      s.isPlatformAdmin,
      s.tokenVersion,
      s.lastLoginAt,
      s.version,
      s.createdAt,
      s.updatedAt,
      s.deletedAt,
      s.registrarUserId ?? null,
    );
  }

  toSnapshot(): UserSnapshot {
    return {
      id: this.id,
      email: this._email.value,
      passwordHash: this._passwordHash,
      firstName: this._firstName,
      lastName: this._lastName,
      status: this._status,
      isPlatformAdmin: this._isPlatformAdmin,
      tokenVersion: this._tokenVersion,
      lastLoginAt: this._lastLoginAt,
      version: this.version,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
      deletedAt: this._deletedAt,
      registrarUserId: this._registrarUserId,
    };
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  get email(): Email {
    return this._email;
  }

  get passwordHash(): string | null {
    return this._passwordHash;
  }

  get firstName(): string | null {
    return this._firstName;
  }

  get lastName(): string | null {
    return this._lastName;
  }

  get status(): UserStatus {
    return this._status;
  }

  get isPlatformAdmin(): boolean {
    return this._isPlatformAdmin;
  }

  get tokenVersion(): number {
    return this._tokenVersion;
  }

  get lastLoginAt(): Date | null {
    return this._lastLoginAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get deletedAt(): Date | null {
    return this._deletedAt;
  }

  get isDeleted(): boolean {
    return this._deletedAt !== null;
  }

  /** Falls back to the address so the UI never has to render an empty label. */
  get displayName(): string {
    const name = [this._firstName, this._lastName].filter(Boolean).join(' ');
    return name || this._email.value;
  }

  // ---------------------------------------------------------------------------
  // Invariants
  // ---------------------------------------------------------------------------

  /**
   * The single gate every authentication path goes through — login, refresh and
   * tenant switch all call it, so a suspended user cannot keep a session alive
   * by refreshing.
   */
  assertCanAuthenticate(): void {
    if (this.isDeleted || this._status === UserStatus.SUSPENDED) {
      throw new AccountNotActiveError(this.isDeleted ? 'DELETED' : this._status);
    }
    if (this._status === UserStatus.INVITED || this._passwordHash === null) {
      throw new PasswordNotSetError();
    }
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  rename(firstName: string | null, lastName: string | null, now: Date = new Date()): void {
    this._firstName = firstName?.trim() || null;
    this._lastName = lastName?.trim() || null;
    this.touch(now);
  }

  changeEmail(email: Email, now: Date = new Date()): void {
    if (this._email.equals(email)) return;
    this._email = email;
    // The address is the login identifier; sessions opened against the old one
    // do not survive the change.
    this.revokeIssuedTokens();
    this.touch(now);
  }

  /**
   * Sets a password, and completes the invitation if one was outstanding.
   *
   * Bumps `tokenVersion`: a password change is the standard response to a
   * suspected compromise, and it must sign the other party out.
   */
  setPasswordHash(hash: string, now: Date = new Date()): void {
    this._passwordHash = hash;
    if (this._status === UserStatus.INVITED) this._status = UserStatus.ACTIVE;
    this.revokeIssuedTokens();
    this.touch(now);
  }

  /**
   * Re-hashes the *same* password under current Argon2 parameters, after a
   * successful verification.
   *
   * Distinct from `setPasswordHash` precisely because it must not bump
   * `tokenVersion`: the credential has not changed, and signing users out
   * whenever the hashing cost is raised would be a self-inflicted outage.
   */
  upgradePasswordHash(hash: string, now: Date = new Date()): void {
    this._passwordHash = hash;
    this.touch(now);
  }

  activate(now: Date = new Date()): void {
    if (this._status === UserStatus.ACTIVE) return;
    this._status = UserStatus.ACTIVE;
    this.touch(now);
  }

  suspend(now: Date = new Date()): void {
    if (this._status === UserStatus.SUSPENDED) return;
    this._status = UserStatus.SUSPENDED;
    // Without this, a suspended user keeps working until their access token
    // expires — the one window an administrator is trying to close.
    this.revokeIssuedTokens();
    this.touch(now);
  }

  grantPlatformAdmin(now: Date = new Date()): void {
    if (this._isPlatformAdmin) return;
    this._isPlatformAdmin = true;
    // Privilege is carried *in* the token, so the old one has to go — on the
    // grant as well as the revoke, or the user waits for a new token to use it.
    this.revokeIssuedTokens();
    this.touch(now);
  }

  revokePlatformAdmin(now: Date = new Date()): void {
    if (!this._isPlatformAdmin) return;
    this._isPlatformAdmin = false;
    this.revokeIssuedTokens();
    this.touch(now);
  }

  recordSuccessfulLogin(now: Date = new Date()): void {
    this._lastLoginAt = now;
    // Intentionally no `touch`: this is telemetry, and letting it bump the
    // optimistic-locking version would make concurrent logins collide with each
    // other. The repository writes it with `touchLastLogin`, outside the lock.
  }

  /**
   * GDPR-shaped erasure: the row survives for referential integrity, the
   * personal data does not. The address is rewritten to a reserved domain so
   * the unique index frees the real one for re-registration.
   */
  softDelete(now: Date = new Date()): void {
    if (this.isDeleted) return;
    this._deletedAt = now;
    this._status = UserStatus.SUSPENDED;
    this._email = Email.fromPersisted(`${this.id}@deleted.invalid`);
    this._passwordHash = null;
    this._firstName = null;
    this._lastName = null;
    this.revokeIssuedTokens();
    this.touch(now);
  }

  /**
   * "Sign out of all devices" — every access token in existence carries the old
   * `tokenVersion` and is rejected on its next use.
   *
   * Refresh tokens are revoked separately by the logout use case; this handles
   * the stateless half, which no repository can reach.
   */
  invalidateSessions(now: Date = new Date()): void {
    this.revokeIssuedTokens();
    this.touch(now);
  }

  /** One bump invalidates every access token minted before this moment. */
  private revokeIssuedTokens(): void {
    this._tokenVersion += 1;
  }

  private touch(now: Date): void {
    this._updatedAt = now;
  }
}
