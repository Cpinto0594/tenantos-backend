import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { finalize, type Observable } from 'rxjs';
import type { Request, Response } from 'express';
import { MetricsService } from './metrics.service';

/**
 * Records latency, throughput and in-flight count for every HTTP request.
 *
 * Runs in `finalize`, so a request that ends in an exception is still counted —
 * metrics that only cover the happy path hide exactly the incidents you need
 * them for.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const method = request.method;
    const route = this.routeOf(request);
    const stopTimer = this.metrics.httpRequestDuration.startTimer({ method, route });

    this.metrics.httpRequestsInFlight.inc({ method });

    return next.handle().pipe(
      finalize(() => {
        const status = String(response.statusCode);
        stopTimer({ status });
        this.metrics.httpRequestsTotal.inc({ method, route, status });
        this.metrics.httpRequestsInFlight.dec({ method });
      }),
    );
  }

  /**
   * The *templated* route (`/api/v1/users/:id`), taken from Express's matched
   * layer rather than `req.originalUrl`.
   *
   * This is the single most important line in the file. Using the raw URL would
   * create one time series per user id — unbounded cardinality that bloats this
   * process's memory and then Prometheus's.
   */
  private routeOf(request: Request): string {
    // Express types `route` loosely, so narrow it here rather than letting an
    // `any` leak into the label value — a non-string label would silently
    // create a garbage time series.
    const matched: unknown = (request as Request & { route?: unknown }).route;
    const path =
      typeof matched === 'object' && matched !== null && 'path' in matched
        ? (matched as { path?: unknown }).path
        : undefined;
    if (typeof path === 'string') return `${request.baseUrl}${path}`;
    // No matched route means a 404. Bucketing them all together is deliberate:
    // scanners generate unbounded distinct paths.
    return 'unmatched';
  }
}
