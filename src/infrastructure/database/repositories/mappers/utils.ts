import type { Prisma } from '@prisma/client';

export function asJsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return value;
}

export function toMillis(value: bigint | null): number | null {
  return value === null ? null : Number(value);
}
