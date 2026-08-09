import { Prisma } from '@prisma/client';
import { InfrastructureError } from '@shared/errors/infrastructure-error';

/**
 * Prisma error codes worth branching on. The full list is large; these are the
 * ones a repository can meaningfully translate into a domain error.
 */
export const PrismaErrorCode = {
  UNIQUE_VIOLATION: 'P2002',
  FOREIGN_KEY_VIOLATION: 'P2003',
  RECORD_NOT_FOUND: 'P2025',
  QUERY_INTERPRETATION_ERROR: 'P2016',
  TRANSACTION_CONFLICT: 'P2034',
  CONNECTION_TIMEOUT: 'P2024',
} as const;

export function isPrismaKnownError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}

/** True when the failure is a unique violation on the given index/column. */
export function isUniqueViolation(error: unknown, target?: string): boolean {
  if (!isPrismaKnownError(error) || error.code !== PrismaErrorCode.UNIQUE_VIOLATION) return false;
  if (!target) return true;

  // `meta.target` is the constraint's column list on Postgres.
  const meta = error.meta as { target?: string[] | string } | undefined;
  const fields = Array.isArray(meta?.target) ? meta.target : meta?.target ? [meta.target] : [];
  return fields.some((field) => field.includes(target));
}

/** True when a mutation matched no row — an `update`/`delete` whose `where` missed. */
export function isRecordNotFound(error: unknown): boolean {
  return isPrismaKnownError(error) && error.code === PrismaErrorCode.RECORD_NOT_FOUND;
}

/**
 * Last-resort translation for failures a repository has no domain meaning for:
 * the pool is exhausted, the connection dropped, the statement timed out.
 *
 * These become InfrastructureError so the exception filter returns 503 with a
 * generic message rather than leaking the driver's text, which routinely
 * contains the connection string.
 */
export function toInfrastructureError(error: unknown, operation: string): InfrastructureError {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return InfrastructureError.database(`Database unavailable during ${operation}`, error, { operation });
  }
  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return InfrastructureError.database(`Database engine panicked during ${operation}`, error, { operation });
  }
  if (isPrismaKnownError(error) && error.code === PrismaErrorCode.CONNECTION_TIMEOUT) {
    return InfrastructureError.database(`Connection pool exhausted during ${operation}`, error, {
      operation,
    });
  }
  return InfrastructureError.database(`Database error during ${operation}`, error, { operation });
}
