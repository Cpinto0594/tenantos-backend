/** Header names used in more than one place. Typos here are silent bugs. */
export const HEADER = {
  REQUEST_ID: 'x-request-id',
  CORRELATION_ID: 'x-correlation-id',
  IDEMPOTENCY_KEY: 'idempotency-key',
  TENANT: 'x-tenant-id',
  RESPONSE_TIME: 'x-response-time',
  RETRY_AFTER: 'retry-after',
} as const;

/** Cookie names for the cookie-based auth transport. See docs/AUTH.md. */
export const COOKIE = {
  ACCESS_TOKEN: 'tos_at',
  REFRESH_TOKEN: 'tos_rt',
} as const;

/**
 * Reflection metadata keys. Exported as constants because a decorator and its
 * guard must agree on the string, and `Reflector.get('isPublic')` typed by hand
 * in two files is how a route silently becomes public.
 */
export const METADATA = {
  IS_PUBLIC: 'auth:isPublic',
  ROLES: 'auth:roles',
  PLATFORM_ADMIN_ONLY: 'auth:platformAdminOnly',
  CACHE: 'cache:options',
  SKIP_RESPONSE_ENVELOPE: 'http:skipEnvelope',
} as const;
