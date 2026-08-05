import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';
import type { Response } from 'express';
import { ApiSuccessResponse } from '@shared/http/api-response';
import { RequestContextStore } from '@shared/context/request-context';
import { HEADER, METADATA } from '@shared/constants/http.constants';

/**
 * Wraps every successful handler return value in the standard envelope and
 * stamps `x-response-time`.
 *
 * Opt out with `@SkipEnvelope()` where a consumer dictates the shape:
 * `/metrics` (Prometheus text format), `/health` (Terminus schema, understood
 * by Kubernetes probes), and any file download.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const skip = this.reflector.getAllAndOverride<boolean>(METADATA.SKIP_RESPONSE_ENVELOPE, [
      context.getHandler(),
      context.getClass(),
    ]);

    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = RequestContextStore.get()?.startedAt ?? Date.now();

    return next.handle().pipe(
      map((data: unknown) => {
        if (!response.headersSent) {
          response.setHeader(HEADER.RESPONSE_TIME, `${Date.now() - startedAt}ms`);
        }

        // Wrapping a stream would buffer the whole thing into memory — the
        // exact opposite of why the handler chose to stream.
        if (skip || data instanceof StreamableFile) return data;

        return new ApiSuccessResponse(data ?? null, RequestContextStore.requestId ?? 'unknown');
      }),
    );
  }
}
