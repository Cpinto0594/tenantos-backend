import type { MembershipRole } from '@domain/shared/enums';
import type { RefreshToken, RevocationReason } from './refresh-token.entity';

export const PASSWORD_HASHER = Symbol('PasswordHasher');
export const TOKEN_SERVICE = Symbol('TokenService');
export const REFRESH_TOKEN_REPOSITORY = Symbol('RefreshTokenRepository');
export const TOKEN_DENYLIST = Symbol('TokenDenylist');

/**
 * Password hashing. Behind a port because the algorithm and its parameters are
 * an operational decision that changes over time — and because `verify` is the
 * single most expensive call in the app, so tests must be able to stub it.
 */
export interface PasswordHasherPort {
  hash(plaintext: string): Promise<string>;

  /**
   * Constant-time comparison. Must return `false` rather than throwing on a
   * malformed hash — a corrupt row should read as "wrong password", not as a
   * 500 that tells an attacker something interesting.
   */
  verify(hash: string, plaintext: string): Promise<boolean>;

  /**
   * True when `hash` was produced with weaker parameters than the current
   * policy. Lets the login path transparently upgrade a user's hash while it
   * has the plaintext in hand — the only moment it ever will.
   */
  needsRehash(hash: string): boolean;

  /**
   * Burns roughly the same CPU as a real verification. Called when no user
   * matched, so that "unknown email" and "wrong password" take the same wall
   * time — otherwise response latency is a free account-enumeration oracle.
   */
  simulateVerification(): Promise<void>;
}

/** Claims carried by an access token. Short keys: this is sent on every request. */
export interface AccessTokenClaims {
  /** Subject — the user id. */
  sub: string;
  /** Token version at issue time. Compared against the user row to detect revocation. */
  tv: number;
  /** Platform administrator. */
  adm: boolean;
  /** Active tenant, when the token is workspace-scoped. */
  tid?: string;
  /** The user's role in `tid`. */
  role?: MembershipRole;
  /** Unique token id — the key used when denylisting a single token. */
  jti: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface IssuedAccessToken {
  readonly token: string;
  readonly jti: string;
  readonly expiresAt: Date;
  readonly expiresInSeconds: number;
}

export interface GeneratedRefreshToken {
  /** Sent to the client. Never stored. */
  readonly raw: string;
  /** SHA-256 of `raw`, hex. This is what the database holds. */
  readonly hash: string;
}

export interface TokenServicePort {
  issueAccessToken(input: {
    userId: string;
    tokenVersion: number;
    isPlatformAdmin: boolean;
    tenantId?: string;
    role?: MembershipRole;
  }): Promise<IssuedAccessToken>;

  /** Throws InvalidTokenError / TokenExpiredError rather than returning null. */
  verifyAccessToken(token: string): Promise<AccessTokenClaims>;

  /** 256 bits of CSPRNG output plus its hash. Not a JWT — see docs/AUTH.md. */
  generateRefreshToken(): GeneratedRefreshToken;

  hashRefreshToken(raw: string): string;
}

export interface RefreshTokenRepositoryPort {
  findByHash(tokenHash: string): Promise<RefreshToken | null>;
  create(token: RefreshToken): Promise<RefreshToken>;
  save(token: RefreshToken): Promise<RefreshToken>;

  /**
   * Atomically marks a token as used, returning `true` only for the caller that
   * won.
   *
   * This is the compare-and-swap that makes rotation single-use. A read
   * followed by a write cannot do it: two concurrent refreshes with the same
   * token would both observe "not revoked", both issue a session, and the reuse
   * detection would never fire. As one conditional UPDATE, exactly one caller
   * sees a row count of 1 and the loser is — correctly — treated as reuse.
   */
  consume(tokenId: string, reason: RevocationReason, at: Date): Promise<boolean>;

  /** Revokes every token in a family. The reuse-detection hammer. */
  revokeFamily(familyId: string, reason: RevocationReason, at: Date): Promise<number>;

  /** Revokes every active token for a user — "sign out everywhere". */
  revokeAllForUser(userId: string, reason: RevocationReason, at: Date): Promise<number>;

  /** Active sessions, for the account security screen. */
  findActiveByUser(userId: string, now: Date): Promise<RefreshToken[]>;

  /** Housekeeping: drops rows that expired long enough ago to be uninteresting. */
  deleteExpiredBefore(cutoff: Date): Promise<number>;
}

/**
 * Immediate revocation for *access* tokens.
 *
 * `tokenVersion` covers the common cases (password change, suspension) with no
 * extra I/O. This covers the case it cannot: revoking one specific token — one
 * device, one leaked session — without invalidating the user's others.
 *
 * Redis-backed, with each entry TTL'd to the token's own expiry, so the
 * denylist can never grow beyond one access-token lifetime of traffic.
 */
export interface TokenDenylistPort {
  add(jti: string, expiresAt: Date): Promise<void>;
  has(jti: string): Promise<boolean>;
}
