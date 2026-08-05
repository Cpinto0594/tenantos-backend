import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import { catchError, throwError, timeout, TimeoutError, type Observable } from 'rxjs';

/**
 * Caps how long a single request may occupy a worker.
 *
 * The database has its own `statement_timeout`, but that only covers SQL. This
 * covers everything else — a wedged HTTP call to a third party, an await that
 * never settles — and guarantees the client gets an answer rather than holding
 * a socket until its own timeout fires.
 *
 * Note this unblocks the *caller*; it does not cancel the work already in
 * flight. Nothing in Node can, short of cooperative AbortSignals threaded all
 * the way down. Treat it as a bound on client-visible latency, not a kill
 * switch.
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly timeoutMs = 30_000) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout(this.timeoutMs),
      catchError((error: unknown) =>
        throwError(() =>
          error instanceof TimeoutError
            ? new RequestTimeoutException(`Request exceeded ${this.timeoutMs}ms`)
            : error,
        ),
      ),
    );
  }
}
