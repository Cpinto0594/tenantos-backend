import type {
  MembershipRole as PrismaMembershipRole,
  RefreshToken as PrismaRefreshToken,
  TenantPlan as PrismaTenantPlan,
  TenantStatus as PrismaTenantStatus,
  User as PrismaUser,
  UserStatus as PrismaUserStatus,
} from '@prisma/client';
import {
  type MembershipRole,
  type TenantPlan,
  type TenantStatus,
  type UserStatus,
} from '@domain/shared/enums';
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
// Enum parity — enforced at compile time.
//
// The domain declares its own enums (it must not import Prisma). These
// assertions fail the build the moment the two definitions diverge, which is
// the only thing that makes the duplication safe.
// -----------------------------------------------------------------------------

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

const _userStatusParity: Exact<PrismaUserStatus, UserStatus> = true;
const _tenantStatusParity: Exact<PrismaTenantStatus, TenantStatus> = true;
const _tenantPlanParity: Exact<PrismaTenantPlan, TenantPlan> = true;
const _membershipRoleParity: Exact<PrismaMembershipRole, MembershipRole> = true;
void _userStatusParity;
void _tenantStatusParity;
void _tenantPlanParity;
void _membershipRoleParity;

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
    status: row.status,
    isPlatformAdmin: row.isPlatformAdmin,
    tokenVersion: row.tokenVersion,
    lastLoginAt: row.lastLoginAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
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
