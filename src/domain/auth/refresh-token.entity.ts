import { randomUUID } from 'node:crypto';

export interface RefreshTokenSnapshot {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
}

export type RevocationReason =
  | 'rotated'
  | 'logout'
  | 'logout-all'
  | 'reuse-detected'
  | 'password-changed'
  | 'admin-revoked'
  | 'expired-sweep';

/**
 * One issued refresh token.
 *
 * A login opens a *family*; each refresh revokes the presented token with
 * reason `rotated` and issues its successor into the same family. Presenting a
 * token that is already revoked means it leaked — the legitimate client and the
 * attacker are both holding descendants of the same login — so the entire
 * family is destroyed and the user must sign in again.
 *
 * The plaintext token never reaches this entity: only its SHA-256. See
 * docs/AUTH.md for the full lifecycle.
 */
export class RefreshToken {
  private constructor(
    readonly id: string,
    readonly userId: string,
    readonly familyId: string,
    readonly tokenHash: string,
    readonly expiresAt: Date,
    private _revokedAt: Date | null,
    private _revokedReason: string | null,
    readonly userAgent: string | null,
    readonly ipAddress: string | null,
    readonly createdAt: Date,
  ) {}

  static issue(
    input: {
      userId: string;
      tokenHash: string;
      ttlSeconds: number;
      /** Omit to start a new family (a fresh login); pass to continue one (a rotation). */
      familyId?: string;
      userAgent?: string | null;
      ipAddress?: string | null;
    },
    now: Date = new Date(),
  ): RefreshToken {
    return new RefreshToken(
      randomUUID(),
      input.userId,
      input.familyId ?? randomUUID(),
      input.tokenHash,
      new Date(now.getTime() + input.ttlSeconds * 1000),
      null,
      null,
      input.userAgent?.slice(0, 255) ?? null,
      input.ipAddress ?? null,
      now,
    );
  }

  static fromSnapshot(s: RefreshTokenSnapshot): RefreshToken {
    return new RefreshToken(
      s.id,
      s.userId,
      s.familyId,
      s.tokenHash,
      s.expiresAt,
      s.revokedAt,
      s.revokedReason,
      s.userAgent,
      s.ipAddress,
      s.createdAt,
    );
  }

  toSnapshot(): RefreshTokenSnapshot {
    return {
      id: this.id,
      userId: this.userId,
      familyId: this.familyId,
      tokenHash: this.tokenHash,
      expiresAt: this.expiresAt,
      revokedAt: this._revokedAt,
      revokedReason: this._revokedReason,
      userAgent: this.userAgent,
      ipAddress: this.ipAddress,
      createdAt: this.createdAt,
    };
  }

  get revokedAt(): Date | null {
    return this._revokedAt;
  }

  get revokedReason(): string | null {
    return this._revokedReason;
  }

  get isRevoked(): boolean {
    return this._revokedAt !== null;
  }

  isExpired(now: Date = new Date()): boolean {
    return this.expiresAt.getTime() <= now.getTime();
  }

  isUsable(now: Date = new Date()): boolean {
    return !this.isRevoked && !this.isExpired(now);
  }

  revoke(reason: RevocationReason, now: Date = new Date()): void {
    // First revocation wins: overwriting would lose the reason that matters
    // (`reuse-detected` must not be replaced by a later `expired-sweep`).
    if (this.isRevoked) return;
    this._revokedAt = now;
    this._revokedReason = reason;
  }
}
