import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmptyObject, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

export class UpdateCredentialDto {
  /** Unique within the workspace, not just the folder. */
  @ApiPropertyOptional({ example: 'Stripe (production)', maxLength: 200 })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    example: 'api_key',
    maxLength: 100,
    description: 'Credential shape, e.g. api_key, oauth2.',
  })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MinLength(1)
  @MaxLength(100)
  type?: string;

  @ApiPropertyOptional({
    example: 'stripe',
    maxLength: 100,
    description: 'Service this credential authenticates to.',
  })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MinLength(1)
  @MaxLength(100)
  provider?: string;

  /**
   * The secret material. Write-only: no endpoint returns it — see
   * CredentialSummary. Replaces the stored payload wholesale; there is no
   * partial-key merge.
   */
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { apiKey: 'sk_live_…' },
    description: 'Write-only. Never included in any response. Replaces the stored payload entirely.',
  })
  @IsOptional()
  @IsObject()
  credentials?: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  @IsNotEmptyObject()
  metadata?: Record<string, unknown>;
}
