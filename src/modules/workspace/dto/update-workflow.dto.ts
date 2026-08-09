import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

export class UpdateWorkflowDto {
  /** Display name. Does not re-derive `slug` — supply one explicitly to rename it too. */
  @ApiPropertyOptional({ example: 'Nightly invoice sync', minLength: 1, maxLength: 250 })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MinLength(1)
  @MaxLength(250)
  name?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    example: 'nightly-invoice-sync',
    maxLength: 150,
    description: 'Unique within the workspace — see WorkflowSlugTakenError.',
  })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(150)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'must be lowercase alphanumeric words separated by single hyphens',
  })
  slug?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
