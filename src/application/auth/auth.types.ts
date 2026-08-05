
/** What a successful authentication hands back to the transport layer. */
export interface IssuedTokenPair {
  readonly accessToken: string;
  /** Opaque. The client stores it, or it goes into an HttpOnly cookie. */
  readonly refreshToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresIn: number;
  readonly refreshExpiresIn: number;
}

export interface AuthenticatedPrincipal {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly isPlatformAdmin: boolean;
}

export interface AuthenticationResult {
  readonly tokens: IssuedTokenPair;
  readonly principal: AuthenticatedPrincipal;
  /** Workspaces the user can switch into without re-authenticating. */

}

/** Weak device fingerprint recorded against an issued refresh token. */
export interface ClientFingerprint {
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
}
