/**
 * Framework-free pagination primitives shared by the domain and application
 * layers. The HTTP-facing DTOs in `@shared/dto` map onto these.
 *
 * Two strategies, deliberately both supported:
 *
 *  - **Offset** (`page`/`limit`): what users expect from an admin table with
 *    numbered pages. Postgres must walk and discard `offset` rows, so page
 *    50 000 is slow and a concurrent insert can shift rows between pages.
 *    Fine up to a few thousand pages.
 *
 *  - **Keyset / cursor** (`cursor`): orders by `(created_at DESC, id DESC)` and
 *    seeks straight into the index. Constant cost at any depth and stable under
 *    concurrent writes, at the price of no page numbers and no jumping. This is
 *    what any client iterating the whole collection should use, and the only
 *    thing to expose on collections that grow without bound.
 *
 * See docs/ARCHITECTURE.md § "Large datasets".
 */

export type SortDirection = 'asc' | 'desc';

export const PAGINATION_DEFAULTS = {
  page: 1,
  limit: 20,
  /** Hard ceiling. Without it, `?limit=1000000` is a free denial-of-service. */
  maxLimit: 100,
} as const;

export interface OffsetPageRequest {
  readonly page: number;
  readonly limit: number;
  readonly sortBy?: string;
  readonly sortDirection: SortDirection;
  readonly search?: string;
}

export interface CursorPageRequest {
  /** Opaque to the client; encodes the sort key of the last row seen. */
  readonly cursor?: string;
  readonly limit: number;
  readonly sortDirection: SortDirection;
  readonly search?: string;
}

export interface OffsetPage<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export interface CursorPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly limit: number;
}

export function offsetToSkip(page: number, limit: number): number {
  return (Math.max(1, page) - 1) * limit;
}

/**
 * Cursors are base64url of `<iso timestamp>|<uuid>` — the full sort key, so the
 * seek is unambiguous even when many rows share a timestamp.
 *
 * Not encrypted, and that is fine: it encodes only data the client just
 * received. It is validated on the way back in, because an opaque-looking
 * string is exactly what someone will try to inject through.
 */
export const Cursor = {
  encode(createdAt: Date, id: string): string {
    return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64url');
  },

  decode(cursor: string): { createdAt: Date; id: string } | null {
    try {
      const [timestamp, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
      if (!timestamp || !id) return null;

      const createdAt = new Date(timestamp);
      if (Number.isNaN(createdAt.getTime())) return null;
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

      return { createdAt, id };
    } catch {
      return null;
    }
  },
} as const;
