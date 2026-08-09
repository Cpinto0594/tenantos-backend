import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

export class CreateWorkspaceDto {
  /** Display name. The slug is derived from it unless one is supplied. */
  @ApiProperty({ example: 'Acme Corp', minLength: 1, maxLength: 200 })
  @IsString()
  @Transform(trim)
  // Bounds match the column (VarChar(200)). Validating here rather than
  // letting Postgres reject it turns a 500 into a 422 that names the field.
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @Transform(trim)
  // The column is unbounded `text`; the cap is a payload-size guard, not a
  // schema constraint.
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    example: 'acme-corp',
    maxLength: 100,
    description: 'Defaults to a slug derived from `name`. Unique per user — see WorkspaceSlugTakenError.',
  })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(100)
  // Validated, not slugified: a caller that explicitly asked for a slug should
  // be told it is unusable rather than handed a silently different one.
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'must be lowercase alphanumeric words separated by single hyphens',
  })
  slug?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, default: {} })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}
