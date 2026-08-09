import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateVariableDto {
  /** Unique within the workspace, not just the folder — see VariableNameTakenError. */
  @ApiPropertyOptional({ example: 'API_BASE_URL', maxLength: 200 })
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(200)
  // Same identifier shape as CreateVariableDto.name — see its comment.
  @Matches(/^[A-Za-z_][A-Za-z0-9_]*$/, {
    message: 'must start with a letter or underscore and contain only letters, digits and underscores',
  })
  name: string;

  @ApiPropertyOptional({ example: '{}' })
  @IsObject()
  metadata: Record<string, unknown> | undefined;

  @IsOptional()
  scope?: string | undefined;
}
