import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Rate limiting keyed on the real client IP.
 *
 * The stock guard uses the socket's remote address. Behind a load balancer that
 * is the balancer, so every client in the world shares one bucket: the limit
 * either never triggers or locks out everyone at once.
 *
 * `req.ip` is Express's resolution of X-Forwarded-For, honouring the
 * `trust proxy` hop count set in main.ts. That hop count matters — trusting the
 * whole header lets a client forge its own address and evade the limit entirely
 * by rotating a spoofed prefix.
 */
@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  // The base signature returns a promise; there is nothing to await, so the
  // value is wrapped rather than the method being pointlessly `async`.
  protected getTracker(req: Request): Promise<string> {
    return Promise.resolve(req.ip ?? req.socket.remoteAddress ?? 'unknown');
  }
}
