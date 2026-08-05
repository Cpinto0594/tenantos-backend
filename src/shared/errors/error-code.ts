/**
 * The stable, machine-readable error catalogue.
 *
 * These strings are part of the public API contract: clients branch on them, and
 * changing one is a breaking change. HTTP status codes are *not* a substitute —
 * four different things return 409, and a client that wants to say "that email
 * is taken" needs to tell them apart without parsing prose.
 *
 * Rules:
 *  - Add freely, never rename or repurpose.
 *  - `SCREAMING_SNAKE_CASE`, domain-prefixed where it aids grepping.
 *  - The `message` shipped alongside is for humans and may change at any time.
 */
export const ErrorCode = {
  // -- Generic ----------------------------------------------------------------
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BAD_REQUEST: 'BAD_REQUEST',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',

  // -- Authentication / authorization ----------------------------------------
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_ROLE: 'INSUFFICIENT_ROLE',
  TENANT_CONTEXT_REQUIRED: 'TENANT_CONTEXT_REQUIRED',
  ACCOUNT_NOT_ACTIVE: 'ACCOUNT_NOT_ACTIVE',

  // -- Users ------------------------------------------------------------------
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  WEAK_PASSWORD: 'WEAK_PASSWORD',
  PASSWORD_REUSED: 'PASSWORD_REUSED',
  CURRENT_PASSWORD_INCORRECT: 'CURRENT_PASSWORD_INCORRECT',
  CANNOT_MODIFY_SELF: 'CANNOT_MODIFY_SELF',
  PASSWORD_NOT_SET: 'PASSWORD_NOT_SET',

  // -- Tenants / membership ---------------------------------------------------
  TENANT_NOT_FOUND: 'TENANT_NOT_FOUND',
  TENANT_SLUG_TAKEN: 'TENANT_SLUG_TAKEN',
  TENANT_NOT_ACTIVE: 'TENANT_NOT_ACTIVE',
  MEMBERSHIP_NOT_FOUND: 'MEMBERSHIP_NOT_FOUND',
  ALREADY_A_MEMBER: 'ALREADY_A_MEMBER',
  LAST_OWNER_CANNOT_LEAVE: 'LAST_OWNER_CANNOT_LEAVE',

  // -- Infrastructure ---------------------------------------------------------
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
  CACHE_UNAVAILABLE: 'CACHE_UNAVAILABLE',
  CONCURRENT_MODIFICATION: 'CONCURRENT_MODIFICATION',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
