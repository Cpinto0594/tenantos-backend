import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Password } from '@domain/user/password.vo';

/**
 * Request DTOs.
 *
 * **Why class-validator here and Zod for configuration**, given the brief asked
 * for a recommendation:
 *
 *  - DTOs feed Swagger. `@nestjs/swagger`'s CLI plugin reads class-validator
 *    decorators and emits an accurate OpenAPI schema with no duplication. With
 *    Zod you either maintain the schema twice or add a bridge library, and the
 *    generated docs are the API's contract with its consumers.
 *  - Configuration is parsed once at boot, has no OpenAPI representation, and
 *    needs cross-field rules and coercion — Zod's `superRefine` and transforms
 *    are a better fit than a pile of custom class-validator constraints.
 *
 * The rule of thumb: class-validator at the HTTP boundary, Zod for everything
 * parsed outside it. Both are strict; neither is used for business rules, which
 * live in value objects (Email, Password) so that non-HTTP callers get them too.
 */

export class LoginDto {
  @ApiProperty({ example: 'owner@acme.local', maxLength: 320 })
  @IsEmail({}, { message: 'must be a valid email address' })
  @MaxLength(320)
  // Normalised here as well as in the Email value object: it keeps the
  // rate-limiter and audit log from treating `A@x.com` and `a@x.com` as two
  // different subjects.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @ApiProperty({ example: 'correct-horse-battery-staple', minLength: 1, maxLength: Password.MAX_LENGTH })
  @IsString()
  // Deliberately not the full password policy. A login must accept whatever the
  // user's existing password is, including one set before the policy tightened;
  // only the length cap applies, as a DoS guard.
  @MaxLength(Password.MAX_LENGTH)
  password!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Sign directly into this workspace instead of picking one afterwards.',
  })
  @IsOptional()
  @IsUUID('4')
  tenantId?: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'ada@example.com', maxLength: 320 })
  @IsEmail({}, { message: 'must be a valid email address' })
  @MaxLength(320)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @ApiProperty({
    minLength: Password.MIN_LENGTH,
    maxLength: Password.MAX_LENGTH,
    description: `At least ${Password.MIN_LENGTH} characters. Full policy enforced server-side.`,
  })
  @IsString()
  @MinLength(Password.MIN_LENGTH)
  @MaxLength(Password.MAX_LENGTH)
  password!: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @ApiPropertyOptional({
    maxLength: 120,
    description: 'Creates a workspace with this name and makes the new account its owner.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  workspaceName?: string;

  @ApiPropertyOptional({ maxLength: 63, description: 'Defaults to a slug derived from workspaceName.' })
  @IsOptional()
  @IsString()
  @MaxLength(63)
  workspaceSlug?: string;
}

export class RefreshTokenDto {
  @ApiPropertyOptional({
    description:
      'Omit when using cookie transport — the token is read from the HttpOnly refresh cookie instead.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  refreshToken?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Keeps the new access token scoped to this workspace.',
  })
  @IsOptional()
  @IsUUID('4')
  tenantId?: string;
}

export class ChangePasswordDto {
  @ApiProperty({ maxLength: Password.MAX_LENGTH })
  @IsString()
  @MaxLength(Password.MAX_LENGTH)
  currentPassword!: string;

  @ApiProperty({ minLength: Password.MIN_LENGTH, maxLength: Password.MAX_LENGTH })
  @IsString()
  @MinLength(Password.MIN_LENGTH)
  @MaxLength(Password.MAX_LENGTH)
  newPassword!: string;
}

export class SwitchTenantDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  tenantId!: string;
}
