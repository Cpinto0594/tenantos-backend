import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RenameFolderDto {
  @ApiProperty({ example: 'Nightly jobs', minLength: 1, maxLength: 200 })
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  // Same bounds as CreateFolderDto.name — the column is VarChar(200).
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({
    description:
      '`true` makes this the workspace’s only default folder. `false` or omitted leaves the flag as it is.',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
