import { Injectable, type OnModuleInit } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { AppConfigService } from '@infrastructure/config/app-config.service';

/**
 * Prometheus metrics.
 *
 * A private `Registry` rather than the global default: the global one is
 * process-wide mutable state, and two test files that both touch it fail with
 * "metric already registered". This also lets the registry be cleared between
 * tests.
 *
 * **Cardinality is the thing to be careful about.** Every distinct label
 * combination is a separate time series held in memory by both this process and
 * Prometheus. `route` is the *templated* path (`/users/:id`), never the actual
 * one — labelling by raw URL means one series per user id, and that is how you
 * take down a monitoring system.
 */
@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  readonly httpRequestDuration: Histogram<'method' | 'route' | 'status'>;
  readonly httpRequestsTotal: Counter<'method' | 'route' | 'status'>;
  readonly httpRequestsInFlight: Gauge<'method'>;
  readonly authAttemptsTotal: Counter<'result'>;
  readonly cacheOperationsTotal: Counter<'operation' | 'result'>;
  readonly websocketConnections: Gauge<never>;

  constructor(private readonly config: AppConfigService) {
    this.registry.setDefaultLabels({ app: config.app.name, env: config.nodeEnv });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request latency',
      labelNames: ['method', 'route', 'status'],
      // Tuned for an API where the interesting boundary is "did it beat 100ms"
      // and "did it blow past a second", not for page loads.
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });

    this.httpRequestsInFlight = new Gauge({
      name: 'http_requests_in_flight',
      help: 'Requests currently being served — saturation, not throughput',
      labelNames: ['method'],
      registers: [this.registry],
    });

    this.authAttemptsTotal = new Counter({
      name: 'auth_attempts_total',
      help: 'Authentication attempts by outcome',
      // `success` | `invalid_credentials` | `inactive` | `reuse_detected`.
      // A spike in `invalid_credentials` from a flat request rate is credential
      // stuffing; this is the series to alert on.
      labelNames: ['result'],
      registers: [this.registry],
    });

    this.cacheOperationsTotal = new Counter({
      name: 'cache_operations_total',
      help: 'Cache operations by result — hit rate lives here',
      labelNames: ['operation', 'result'],
      registers: [this.registry],
    });

    this.websocketConnections = new Gauge({
      name: 'websocket_connections',
      help: 'Open WebSocket connections on this instance',
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    if (!this.config.observability.metricsEnabled) return;

    // Event loop lag, heap, GC pauses, handles. When a Node service gets slow
    // without the database getting slow, the answer is almost always in here.
    collectDefaultMetrics({ register: this.registry, prefix: 'nodejs_' });
  }

  async scrape(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
