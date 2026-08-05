import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PASSWORD_HASHER, TOKEN_DENYLIST, TOKEN_SERVICE } from '@domain/auth/auth.ports';
import { Argon2PasswordHasher } from './argon2-password-hasher';
import { JwtTokenService } from './jwt-token.service';
import { TokenDenylistService } from './token-denylist.service';

/**
 * Security adapters: password hashing, token signing, and the access-token
 * denylist.
 *
 * These sit alongside DatabaseModule and CacheModule as infrastructure rather
 * than inside AuthModule, because they are not an authentication *feature* —
 * they are capabilities several features need. Password hashing is used by
 * registration, invitation and password change; the token service by the HTTP
 * strategy and the WebSocket gateway. Owning them in AuthModule forced
 * UsersModule to import AuthModule while AuthModule imported UsersModule, which
 * is a dependency cycle dressed up as a feature boundary.
 *
 * Global for the same reason the other infrastructure modules are: they are
 * process-wide singletons behind port symbols, so nothing can depend on the
 * concrete class by accident.
 *
 * `JwtModule.register({})` is deliberately empty — signing options are passed
 * per call in JwtTokenService, because access and refresh operations use
 * different secrets and a module-level default would make it possible to sign
 * with the wrong one by omitting an option.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    { provide: TOKEN_DENYLIST, useClass: TokenDenylistService },
  ],
  exports: [PASSWORD_HASHER, TOKEN_SERVICE, TOKEN_DENYLIST],
})
export class SecurityModule {}
