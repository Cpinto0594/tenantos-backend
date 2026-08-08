import type { RefreshToken as PrismaRefreshToken, User as PrismaUser } from '@prisma/client';
import { UserStatus } from '@domain/shared/enums';
import { RefreshToken } from '@domain/auth/refresh-token.entity';
import { User } from '@domain/user/user.entity';

/**
 * The anti-corruption layer between Prisma rows and domain entities.
 *
 * Everything crossing this boundary is explicit on purpose. A `row as User`
 * cast would compile today and silently produce a broken entity the first time
 * a column is renamed or a nullable is added.
 */

// -----------------------------------------------------------------------------
// Enum narrowing — enforced at runtime.
//
// Status columns are plain strings in the database, so nothing below this line
// can assume the value is one the domain knows. This used to be a compile-time
// parity assertion against Prisma's generated enum; with no enum to compare
// against, the check has to happen where the value actually crosses the
// boundary.
// -----------------------------------------------------------------------------

/**
 * A row we cannot interpret is a bug — a hand-edited row, a half-applied
 * migration, a writer that bypassed this layer. Failing loudly beats handing
 * the domain a status it will silently mishandle in an authorization check.
 */
export function toUserStatus(value: string): UserStatus {
  if (!Object.hasOwn(UserStatus, value)) {
    throw new Error(`Unrecognised user status in the database: ${value}`);
  }

  return value as UserStatus;
}

/**
 * Rows in, aggregate out. Goes through `fromSnapshot` rather than a constructor
 * so the entity's private fields stay private: infrastructure can rebuild a
 * user, but it cannot assemble one that skipped an invariant.
 */
export function toUserEntity(row: PrismaUser): User {
  return User.fromSnapshot({
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    firstName: row.firstName,
    lastName: row.lastName,
    status: toUserStatus(row.status),
    isPlatformAdmin: row.isPlatformAdmin,
    tokenVersion: row.tokenVersion,
    lastLoginAt: row.lastLoginAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    registrarUserId: row.registrar_user_id,
  });
}

export function toRefreshTokenEntity(row: PrismaRefreshToken): RefreshToken {
  return RefreshToken.fromSnapshot({
    id: row.id,
    userId: row.userId,
    familyId: row.familyId,
    // CHAR(64) is blank-padded by Postgres on read; the stored hash is exactly
    // 64 chars, but trimming makes the comparison independent of that detail.
    tokenHash: row.tokenHash.trim(),
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    revokedReason: row.revokedReason,
    userAgent: row.userAgent,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt,
  });
}
