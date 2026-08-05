import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import { of, tap, type Observable } from 'rxjs';
import type { Request } from 'express';
import { METADATA } from '@shared/constants/http.constants';
import { RequestContextStore } from '@shared/context/request-context';
import { CacheService } from './cache.service';
import type { CacheResponseOptions } from './cache-response.decorator';

/**
 * Response caching for handlers marked with `@CacheResponse()`.
 *
 * Opt-in rather than blanket: a global response cache is the fastest way to
 * serve one tenant's data to another. Nothing is cached unless a human decided
 * it should be and declared the sharing scope.
 */
@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly cache: CacheService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();

    const options = this.reflector.getAllAndOverride<CacheResponseOptions | undefined>(METADATA.CACHE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    // Belt and braces: a mutation's response must never come from cache, even
    // if someone decorates a POST handler.
    if (request.method !== 'GET') return next.handle();

    const key = this.buildKey(request, options);
    if (!key) return next.handle();

    const cached = await this.cache.get<unknown>(key);
    if (cached !== null) return of(cached);

    return next.handle().pipe(
      tap((response: unknown) => {
        // Fire-and-forget: the client should not wait on a cache write, and a
        // failed write is a miss next time, not an error now.
        void this.cache.set(key, response, options.ttlSeconds);
      }),
    );
  }

  /**
   * The key must capture everything that can change the response body:
   * the path, the query string, and the identity the handler will see.
   *
   * Returns null when the scope demands an identity the request does not have —
   * better to skip caching than to file an anonymous response under a
   * user-scoped key.
   */
  private buildKey(request: Request, options: CacheResponseOptions): string | null {
    const context = RequestContextStore.get();

    let identity: string;
    switch (options.scope) {
      case 'user':
        if (!context?.userId) return null;
        identity = `u:${context.userId}`;
        break;
      case 'tenant':
        if (!context?.tenantId) return null;
        identity = `t:${context.tenantId}`;
        break;
      case 'public':
        identity = 'public';
        break;
    }

    // Hash the URL so a long query string cannot produce an unbounded key, and
    // so keys stay a predictable length in Redis.
    const url = createHash('sha256').update(request.originalUrl).digest('base64url').slice(0, 22);

    return `v1:res:${identity}:${url}`;
  }
}
