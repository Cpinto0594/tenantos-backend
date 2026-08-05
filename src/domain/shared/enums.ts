/**
 * Domain enums.
 *
 * These are declared here rather than re-exported from `@prisma/client` on
 * purpose: the domain layer must not import the persistence driver, or the
 * "swap the ORM" claim is fiction and every domain unit test drags Prisma's
 * generated client into the process.
 *
 * The values are identical to the database enums by contract. The mapping is
 * asserted at compile time in `@infrastructure/database/prisma.mappers` — if
 * someone adds a value on either side without the other, that file stops
 * compiling.
 */

export const UserStatus = {
  /** Row exists, no password set. Cannot authenticate until the invite is accepted. */
  INVITED: 'INVITED',
  ACTIVE: 'ACTIVE',
  /** Blocked by an administrator. Authentication is refused; data is retained. */
  SUSPENDED: 'SUSPENDED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const TenantStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type TenantStatus = (typeof TenantStatus)[keyof typeof TenantStatus];

export const TenantPlan = {
  FREE: 'FREE',
  STARTER: 'STARTER',
  PRO: 'PRO',
  ENTERPRISE: 'ENTERPRISE',
} as const;
export type TenantPlan = (typeof TenantPlan)[keyof typeof TenantPlan];

export const MembershipRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
  VIEWER: 'VIEWER',
} as const;
export type MembershipRole = (typeof MembershipRole)[keyof typeof MembershipRole];

/**
 * Roles are a total order, so authorization asks "at least ADMIN?" instead of
 * enumerating every acceptable role at each call site. Enumerating is how a new
 * role silently loses access to half the endpoints.
 */
const ROLE_RANK: Readonly<Record<MembershipRole, number>> = {
  [MembershipRole.VIEWER]: 0,
  [MembershipRole.MEMBER]: 1,
  [MembershipRole.ADMIN]: 2,
  [MembershipRole.OWNER]: 3,
};

export function roleAtLeast(actual: MembershipRole, required: MembershipRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export function rankOf(role: MembershipRole): number {
  return ROLE_RANK[role];
}
