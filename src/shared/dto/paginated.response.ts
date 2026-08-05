import { ApiProperty } from '@nestjs/swagger';
import type { CursorPage, OffsetPage } from '@shared/http/pagination';

export class PaginationMeta {
  @ApiProperty({ example: 20 })
  readonly limit: number;

  @ApiProperty({ example: 1, nullable: true, description: 'Null in cursor mode.' })
  readonly page: number | null;

  @ApiProperty({
    example: 137,
    nullable: true,
    description: 'Null in cursor mode — counting is the slow part.',
  })
  readonly total: number | null;

  @ApiProperty({ example: 7, nullable: true })
  readonly totalPages: number | null;

  @ApiProperty({ example: true })
  readonly hasNext: boolean;

  @ApiProperty({ example: false })
  readonly hasPrevious: boolean;

  @ApiProperty({
    nullable: true,
    example: 'MjAyNi0wOC0wM1QxMjozNDo1Ni43ODlafDNmMWEt…',
    description: 'Pass back as `?cursor=` to fetch the next page. Null when the collection is exhausted.',
  })
  readonly nextCursor: string | null;

  constructor(init: Omit<PaginationMeta, never>) {
    Object.assign(this, init);
  }
}

/**
 * Collection payload. Always `{ items, meta }` — never a bare array, because a
 * bare array leaves nowhere to add pagination later without breaking clients.
 */
export class PaginatedResponse<T> {
  @ApiProperty({ isArray: true })
  readonly items: T[];

  @ApiProperty({ type: PaginationMeta })
  readonly meta: PaginationMeta;

  private constructor(items: T[], meta: PaginationMeta) {
    this.items = items;
    this.meta = meta;
  }

  static fromOffset<S, T>(page: OffsetPage<S>, map: (item: S) => T): PaginatedResponse<T> {
    const totalPages = page.limit > 0 ? Math.ceil(page.total / page.limit) : 0;
    return new PaginatedResponse(
      page.items.map(map),
      new PaginationMeta({
        limit: page.limit,
        page: page.page,
        total: page.total,
        totalPages,
        hasNext: page.page < totalPages,
        hasPrevious: page.page > 1,
        nextCursor: null,
      }),
    );
  }

  static fromCursor<S, T>(page: CursorPage<S>, map: (item: S) => T): PaginatedResponse<T> {
    return new PaginatedResponse(
      page.items.map(map),
      new PaginationMeta({
        limit: page.limit,
        // Offset semantics are meaningless here, and a fabricated `total` would
        // cost a COUNT(*) over the whole table on every page — the exact thing
        // cursor pagination exists to avoid.
        page: null,
        total: null,
        totalPages: null,
        hasNext: page.nextCursor !== null,
        hasPrevious: false,
        nextCursor: page.nextCursor,
      }),
    );
  }
}
