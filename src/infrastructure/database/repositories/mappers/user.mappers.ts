import type { RefreshToken as PrismaRefreshToken, User as PrismaUser } from '@prisma/client';
import { UserStatus } from '@domain/shared/enums';
import { RefreshToken } from '@domain/auth/refresh-token.entity';
import { User } from '@domain/user/user.entity';

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
