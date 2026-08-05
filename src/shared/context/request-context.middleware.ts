import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextStore, type RequestContext } from './request-context';
import { HEADER } from '@shared/constants/http.constants';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Opens the AsyncLocalStorage scope for the request. Must be the first
 * middleware registered — anything running before it logs without a request id.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = sanitizeId(req.header(HEADER.REQUEST_ID)) ?? randomUUID();
    const correlationId = sanitizeId(req.header(HEADER.CORRELATION_ID)) ?? requestId;

    const context: RequestContext = {
      requestId,
      correlationId,
      ip: req.ip,
      userAgent: req.header('user-agent')?.slice(0, 255),
      method: req.method,
      path: req.originalUrl,
      startedAt: Date.now(),
    };

    // Echo both ids so a client can quote them in a bug report, and so a
    // downstream service picks up the same correlation id.
    res.setHeader(HEADER.REQUEST_ID, requestId);
    res.setHeader(HEADER.CORRELATION_ID, correlationId);

    RequestContextStore.run(context, () => next());
  }
}

/**
 * Inbound ids are attacker-controlled. They end up in log lines and response
 * headers, so anything that isn't a UUID is discarded rather than sanitised —
 * accepting arbitrary text invites log injection and header splitting.
 */
function sanitizeId(value: string | undefined): string | undefined {
  return value && UUID_PATTERN.test(value) ? value : undefined;
}
