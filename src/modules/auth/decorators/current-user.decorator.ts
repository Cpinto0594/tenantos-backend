import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../authenticated-user';

/**
 * Injects the authenticated principal into a handler parameter.
 *
 *   findMe(@CurrentUser() user: AuthenticatedUser)
 *   findMe(@CurrentUser('userId') userId: string)
 *
 * Throws rather than returning `undefined` when there is no principal. On a
 * guarded route that state is unreachable, so reaching it means the route was
 * accidentally made public — and a handler that quietly receives `undefined`
 * turns that mistake into "acts on behalf of nobody" instead of a loud error.
 */
export const CurrentUser = createParamDecorator(
  (property: keyof AuthenticatedUser | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('No authenticated principal on this request');
    }

    return property ? user[property] : user;
  },
);
