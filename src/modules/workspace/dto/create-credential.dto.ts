import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmptyObject, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

export class CreateCredentialDto {
  /** Unique within the workspace, not just the folder. */
  @ApiProperty({ example: 'Stripe (production)', maxLength: 200 })
  @IsString()
  @Transform(trim)
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'api_key', maxLength: 100, description: 'Credential shape, e.g. api_key, oauth2.' })
  @IsString()
  @Transform(trim)
  @MinLength(1)
  @MaxLength(100)
  type!: string;

  @ApiProperty({
    example: 'stripe',
    maxLength: 100,
    description: 'Service this credential authenticates to.',
  })
  @IsString()
  @Transform(trim)
  @MinLength(1)
  @MaxLength(100)
  provider!: string;

  /**
   * The secret material. Write-only: no endpoint returns it — see
   * CredentialSummary.
   */
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    default: {},
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { apiKey: 'sk_live_…' },
    description: 'Write-only. Never included in any response.',
  })
  @IsObject()
  @IsNotEmptyObject()
  credentials!: Record<string, unknown>;

  @IsOptional()
  workspaceId?: string;

  @IsOptional()
  folderId?: string;
}
