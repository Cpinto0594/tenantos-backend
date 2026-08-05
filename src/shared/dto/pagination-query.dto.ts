import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PAGINATION_DEFAULTS, type SortDirection } from '@shared/http/pagination';

/**
 * Query parameters shared by every collection endpoint.
 *
 * Endpoints that support sorting subclass this and override `sortBy` with an
 * `@IsIn([...])` of their own allow-list. That allow-list is load-bearing: the
 * value reaches an `ORDER BY`, and Prisma will happily accept any key you hand
 * it — an unvalidated `sortBy` is how you sort by a column that is not indexed
 * and take the database down with a sequential scan.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    default: PAGINATION_DEFAULTS.page,
    description: 'Offset pagination. Ignored when `cursor` is supplied.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = PAGINATION_DEFAULTS.page;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: PAGINATION_DEFAULTS.maxLimit,
    default: PAGINATION_DEFAULTS.limit,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION_DEFAULTS.maxLimit)
  limit: number = PAGINATION_DEFAULTS.limit;

  @ApiPropertyOptional({
    description:
      'Keyset cursor. Send `?cursor=` (empty) to start a keyset walk, then pass the `nextCursor` ' +
      'from each response. While present, `page` is ignored and the response carries `nextCursor` ' +
      'instead of page counts. Use this to iterate large collections.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDirection: SortDirection = 'desc';

  @ApiPropertyOptional({
    description: 'Free-text search. Matched case-insensitively against the endpoint’s searchable fields.',
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  // Collapse whitespace and drop empties so `?search=%20` doesn't become a
  // `LIKE '% %'` scan of the table.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  search?: string;

  /**
   * True when the caller opted into keyset pagination.
   *
   * Presence of the parameter is the signal, not its content — an empty
   * `?cursor=` means "start a keyset walk from the beginning". Requiring a
   * non-empty value would leave no way to take the first page, which is how you
   * end up with a cursor API nobody can enter.
   */
  get isCursorMode(): boolean {
    return typeof this.cursor === 'string';
  }
}
