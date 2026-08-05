import type { MembershipRole } from '@domain/shared/enums';

/**
 * The principal attached to `request.user` once a request has authenticated.
 *
 * Built by JwtStrategy from verified token claims plus a freshness check
 * against the database. Never constructed from request input.
 */
export interface AuthenticatedUser {
  readonly userId: string;
  readonly isPlatformAdmin: boolean;
  /** Present only on workspace-scoped tokens. */
  readonly tenantId?: string;
  readonly role?: MembershipRole;
  /** Token id — needed to denylist this specific token on logout. */
  readonly jti: string;
  readonly tokenExpiresAt: Date;
}

declare module 'express' {
  // Replaces Passport's `Express.User`, which is typed as an empty interface
  // and therefore lets `req.user.anything` compile.
  interface Request {
    user?: AuthenticatedUser;
  }
}
