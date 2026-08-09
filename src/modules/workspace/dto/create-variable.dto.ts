import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength, IsOptional } from 'class-validator';

export class CreateVariableDto {
  /** Unique within the workspace, not just the folder — see VariableNameTakenError. */
  @ApiProperty({ example: 'API_BASE_URL', maxLength: 200 })
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1)
  @MaxLength(200)
  // Constrained to an identifier shape because these are referenced from
  // expressions (`{{ $vars.API_BASE_URL }}`); a name with a dot or a space in it
  // has no usable reference syntax.
  @Matches(/^[A-Za-z_][A-Za-z0-9_]*$/, {
    message: 'must start with a letter or underscore and contain only letters, digits and underscores',
  })
  name!: string;

  @ApiProperty({ example: 'https://api.example.com', maxLength: 10_000 })
  @IsString()
  // The column is unbounded `text`; the cap is a payload guard. Not trimmed —
  // trailing whitespace can be significant in a configuration value.
  @MaxLength(10_000)
  value!: string;

  @IsOptional()
  scope?: string | undefined;
}
