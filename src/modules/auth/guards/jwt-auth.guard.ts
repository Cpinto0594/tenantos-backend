import { type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Observable } from 'rxjs';
import { InvalidTokenError, TokenExpiredError } from '@domain/auth/auth.errors';
import { DomainError } from '@domain/shared/domain-error';
import { METADATA } from '@shared/constants/http.constants';
import type { AuthenticatedUser } from '../authenticated-user';

/**
 * Registered globally in AppModule, so authentication is the default and
 * `@Public()` is the exception.
 *
 * The inverse — guarding routes individually — puts the failure mode in the
 * wrong place: forgetting a guard exposes an endpoint silently, while
 * forgetting `@Public()` produces a 401 the first time anyone tries it.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    // Method-level `@Public()` overrides a controller-level one, so a mostly
    // public controller can still protect one route.
    const isPublic = this.reflector.getAllAndOverride<boolean>(METADATA.IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    return super.canActivate(context);
  }

  /**
   * Translates Passport's failure modes into domain errors so the response
   * carries a useful `errorCode`.
   *
   * The distinction that matters to clients is expired-versus-invalid: the
   * first means "call /auth/refresh", the second means "send the user to the
   * login screen". Passport collapses both into a bare 401.
   */
  handleRequest<TUser = AuthenticatedUser>(error: unknown, user: TUser | false, info: unknown): TUser {
    // Errors raised inside `validate` (revoked token, inactive account) already
    // carry the right code — pass them through untouched.
    if (error instanceof DomainError) throw error;
    // Passport types this as `any`. Anything that is not already an Error is
    // wrapped rather than thrown raw — a thrown string or object loses its
    // stack and confuses every handler downstream. JSON, not String(), so an
    // object does not stringify to "[object Object]".
    if (error) {
      throw error instanceof Error ? error : new Error(JSON.stringify(error) ?? 'Authentication failed');
    }

    if (!user) {
      const name = info instanceof Error ? info.name : '';
      if (name === 'TokenExpiredError') throw new TokenExpiredError();
      throw new InvalidTokenError('No valid access token was supplied');
    }

    return user;
  }
}
