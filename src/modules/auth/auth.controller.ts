import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Req, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { LoginUseCase } from '@application/auth/login.usecase';
import { LogoutUseCase } from '@application/auth/logout.usecase';
import { RefreshTokensUseCase } from '@application/auth/refresh-tokens.usecase';
import { UpdateUserUseCase } from '@application/users/update-user.usecase';
import type { AuthenticationResult, ClientFingerprint } from '@application/auth/auth.types';
import { InvalidTokenError } from '@domain/auth/auth.errors';
import {
  REFRESH_TOKEN_REPOSITORY,
  TOKEN_SERVICE,
  type RefreshTokenRepositoryPort,
  type TokenServicePort,
} from '@domain/auth/auth.ports';
import { ApiErrorResponse } from '@shared/http/api-response';
import { COOKIE } from '@shared/constants/http.constants';
import { AuthCookieService } from './auth-cookie.service';
import type { AuthenticatedUser } from './authenticated-user';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { ChangePasswordDto, LoginDto, RefreshTokenDto } from './dto/auth.dto';
import { AuthResponse, SessionResponse } from './dto/auth.response';

/**
 * Authentication endpoints.
 *
 * Every route here uses the tighter `auth` rate-limit bucket instead of the
 * global one: these are the endpoints an attacker attacks. `/login` in
 * particular performs an Argon2 verification per call, so an unthrottled login
 * endpoint is both a credential-stuffing target and a CPU amplification vector.
 *
 * All of them share one budget per client IP. Splitting it per endpoint would
 * be marginally friendlier — a user fumbling their password would not eat into
 * their refresh allowance — but it means four hardcoded numbers that an
 * operator cannot change during an incident. One configurable budget is the
 * better trade.
 */
@ApiTags('auth')
@Controller('auth')
// Only the tighter `auth` bucket applies to this controller. Its limit comes
// from AUTH_THROTTLE_LIMIT rather than being hardcoded per route, so an
// operator under a credential-stuffing run can turn it down without a deploy.
@SkipThrottle({ default: true })
@ApiTooManyRequestsResponse({ description: 'Rate limit exceeded', type: ApiErrorResponse })
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshUseCase: RefreshTokensUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
    private readonly cookies: AuthCookieService,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepositoryPort,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenServicePort,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiOkResponse({ type: AuthResponse })
  @ApiUnauthorizedResponse({
    description:
      'INVALID_CREDENTIALS. Deliberately identical whether the account exists, the password is ' +
      'wrong, or the account is suspended — distinguishing them enables account enumeration.',
    type: ApiErrorResponse,
  })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.loginUseCase.execute({
      email: dto.email,
      password: dto.password,
      ...(dto.tenantId ? { tenantId: dto.tenantId } : {}),
      fingerprint: fingerprintOf(request),
    });

    return this.respondWithTokens(result, response);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a refresh token for a new token pair',
    description:
      'Rotates the refresh token: the presented one is consumed and cannot be used again. ' +
      'Presenting a consumed token revokes the entire session family — see docs/AUTH.md.',
  })
  @ApiOkResponse({ type: AuthResponse })
  @ApiUnauthorizedResponse({
    description: 'TOKEN_EXPIRED, TOKEN_INVALID, or REFRESH_TOKEN_REUSED.',
    type: ApiErrorResponse,
  })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    // Cookie first: a browser client never sends the token in the body, and
    // preferring the body would let an attacker who can set a query/body value
    // override the cookie.
    const token = (request.cookies?.[COOKIE.REFRESH_TOKEN] as string | undefined) ?? dto.refreshToken;
    if (!token) throw new InvalidTokenError('No refresh token supplied');

    const result = await this.refreshUseCase.execute({
      refreshToken: token,
      ...(dto.tenantId ? { tenantId: dto.tenantId } : {}),
      fingerprint: fingerprintOf(request),
    });

    return this.respondWithTokens(result, response);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Sign out of this device',
    description: 'Revokes this session’s refresh-token family and denylists the current access token.',
  })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const refreshToken = (request.cookies?.[COOKIE.REFRESH_TOKEN] as string | undefined) ?? undefined;

    await this.logoutUseCase.execute({
      userId: user.userId,
      ...(refreshToken ? { refreshToken } : {}),
      accessTokenJti: user.jti,
      accessTokenExpiresAt: user.tokenExpiresAt,
    });

    this.cookies.clearAuthCookies(response);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Sign out of every device',
    description:
      'Revokes all refresh tokens and bumps the user’s token version, invalidating every access token.',
  })
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.logoutUseCase.executeAll({
      userId: user.userId,
      accessTokenJti: user.jti,
      accessTokenExpiresAt: user.tokenExpiresAt,
    });

    this.cookies.clearAuthCookies(response);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change your password',
    description:
      'Requires the current password even though you are authenticated. Succeeding revokes every ' +
      'other session, including the one making this call — the client must sign in again.',
  })
  @ApiBody({ type: ChangePasswordDto })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.updateUserUseCase.changePassword({
      userId: user.userId,
      currentPassword: dto.currentPassword,
      newPassword: dto.newPassword,
    });

    this.cookies.clearAuthCookies(response);
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List active sessions',
    description: 'One entry per signed-in device, for an account-security screen.',
  })
  @ApiOkResponse({ type: [SessionResponse] })
  async sessions(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<SessionResponse[]> {
    const active = await this.refreshTokens.findActiveByUser(user.userId, new Date());

    const currentHash = request.cookies?.[COOKIE.REFRESH_TOKEN]
      ? this.tokenService.hashRefreshToken(request.cookies[COOKIE.REFRESH_TOKEN] as string)
      : null;

    return active.map((token) => ({
      id: token.id,
      createdAt: token.createdAt,
      expiresAt: token.expiresAt,
      userAgent: token.userAgent,
      ipAddress: token.ipAddress,
      current: currentHash !== null && token.tokenHash === currentHash,
    }));
  }

  /**
   * Sets cookies when cookie transport is on, and omits the refresh token from
   * the body in that case — returning it in both places would hand a successful
   * XSS the very token the HttpOnly cookie exists to protect.
   */
  private respondWithTokens(result: AuthenticationResult, response: Response): AuthResponse {
    this.cookies.setAuthCookies(response, {
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
    });

    return AuthResponse.from(result, !this.cookies.enabled);
  }
}

/** Recorded against the issued refresh token for the sessions screen and abuse triage. */
function fingerprintOf(request: Request): ClientFingerprint {
  return {
    ipAddress: request.ip ?? null,
    userAgent: request.header('user-agent') ?? null,
  };
}
