import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MembershipRole } from '@domain/shared/enums';
import type { AuthenticationResult } from '@application/auth/auth.types';

export class TenantSummaryResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'acme' }) slug!: string;
  @ApiProperty({ example: 'Acme Corporation' }) name!: string;
  @ApiProperty({ enum: MembershipRole }) role!: MembershipRole;
}

export class PrincipalResponse {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ example: 'owner@acme.local' }) email!: string;
  @ApiProperty({ example: 'Olivia Owner' }) displayName!: string;
  @ApiProperty() isPlatformAdmin!: boolean;
}

export class AuthResponse {
  @ApiProperty({ description: 'JWT. Send as `Authorization: Bearer <token>`.' })
  accessToken!: string;

  @ApiPropertyOptional({
    description:
      'Opaque refresh token. **Omitted when cookie transport is enabled** — it is set as an ' +
      'HttpOnly cookie instead, which is the safer default. See docs/AUTH.md.',
  })
  refreshToken?: string;

  @ApiProperty({ example: 'Bearer' }) tokenType!: string;

  @ApiProperty({ example: 900, description: 'Access token lifetime in seconds.' })
  expiresIn!: number;

  @ApiProperty({ type: PrincipalResponse }) principal!: PrincipalResponse;

  @ApiProperty({
    type: [TenantSummaryResponse],
    description: 'Workspaces this user can switch into without re-authenticating.',
  })
  availableTenants!: TenantSummaryResponse[];

  /**
   * @param includeRefreshToken false when the refresh token travels as a cookie.
   *        Returning it in the body *as well* would undo the HttpOnly
   *        protection: a successful XSS could read it straight out of the
   *        response the app just parsed.
   */
  static from(result: AuthenticationResult, includeRefreshToken: boolean): AuthResponse {
    const response = new AuthResponse();
    response.accessToken = result.tokens.accessToken;
    if (includeRefreshToken) response.refreshToken = result.tokens.refreshToken;
    response.tokenType = result.tokens.tokenType;
    response.expiresIn = result.tokens.expiresIn;
    response.principal = { ...result.principal };
    return response;
  }
}

export class SwitchTenantResponse {
  @ApiProperty() accessToken!: string;
  @ApiProperty({ example: 900 }) expiresIn!: number;
  @ApiProperty({ type: PrincipalResponse }) principal!: PrincipalResponse;
}

export class SessionResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) expiresAt!: Date;
  @ApiProperty({ nullable: true, example: 'Mozilla/5.0 …' }) userAgent!: string | null;
  @ApiProperty({ nullable: true, example: '203.0.113.7' }) ipAddress!: string | null;
  @ApiProperty({ description: 'True for the session making this request.' }) current!: boolean;
}
