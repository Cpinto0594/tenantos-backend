import { SetMetadata } from '@nestjs/common';
import type { MembershipRole } from '@domain/shared/enums';
import { METADATA } from '@shared/constants/http.constants';

/**
 * Requires at least `role` in the token's active workspace.
 *
 * "At least" — roles are ranked (VIEWER < MEMBER < ADMIN < OWNER), so
 * `@RequireRole('ADMIN')` also admits owners. Listing acceptable roles
 * explicitly is the alternative, and it is how a newly added senior role
 * silently loses access to half the endpoints.
 *
 * Implies a workspace-scoped token: an unscoped one has no role to check, and
 * TenantRoleGuard rejects it with TENANT_CONTEXT_REQUIRED.
 */
export const RequireRole = (role: MembershipRole) => SetMetadata(METADATA.ROLES, role);

/**
 * Restricts a route to platform staff, across all tenants.
 *
 * A different axis from MembershipRole: an OWNER is the most privileged person
 * *inside* one workspace and has no standing outside it.
 */
export const PlatformAdminOnly = () => SetMetadata(METADATA.PLATFORM_ADMIN_ONLY, true);
