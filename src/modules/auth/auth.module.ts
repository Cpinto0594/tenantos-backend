import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { LoginUseCase } from '@application/auth/login.usecase';
import { LogoutUseCase } from '@application/auth/logout.usecase';
import { RefreshTokensUseCase } from '@application/auth/refresh-tokens.usecase';
import { SwitchTenantUseCase } from '@application/auth/switch-tenant.usecase';
import { UpdateUserUseCase } from '@application/users/update-user.usecase';
import { AuthController } from './auth.controller';
import { AuthCookieService } from './auth-cookie.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * Authentication and authorization: the HTTP surface, the Passport strategy,
 * the guards, and the auth use cases.
 *
 * The hashing/token/denylist adapters live in the global SecurityModule, not
 * here — see the note there on why.
 *
 * The guards are exported (and registered globally in AppModule) rather than
 * applied per controller — see JwtAuthGuard for why the secure default matters.
 */
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt', session: false })],
  controllers: [AuthController],
  providers: [
    JwtStrategy,
    JwtAuthGuard,
    AuthCookieService,

    LoginUseCase,
    RefreshTokensUseCase,
    LogoutUseCase,
    SwitchTenantUseCase,
    // Lives under @application/users but is provided here: /auth/change-password
    // is the only route that reaches it, and a UsersModule does not exist yet.
    UpdateUserUseCase,
  ],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
