import { Injectable } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { AppConfigService } from '@infrastructure/config/app-config.service';
import { RequestContextStore } from '@shared/context/request-context';

/** Returned by `start`. Call it when the work finishes to emit the closing line. */
export type InlineSpanEnd = (data?: Record<string, unknown>) => void;

const NOOP_SPAN: InlineSpanEnd = () => undefined;

/**
 * Human-readable trace lines, printed inline as they happen, behind
 * `INLINE_LOGS_ENABLED`.
 *
 * This deliberately does not go through Pino. In development Pino ships its
 * output to a `pino-pretty` transport running on a worker thread, so its lines
 * interleave unpredictably with anything else written to the terminal — which is
 * exactly the property you do not want when you are following one request by
 * eye. These writes are synchronous and ordered.
 *
 * It is therefore a development instrument, not an observability one: no
 * redaction, no JSON framing, no log levels. The env schema refuses to boot
 * production with it enabled. Structured logs that matter still go to Pino.
 *
 * When the flag is off, `log` returns immediately and `start` hands back a
 * shared no-op, so instrumented call sites cost approximately nothing.
 */
@Injectable()
export class InlineLogger {
  private readonly enabled: boolean;

  constructor(config: AppConfigService) {
    this.enabled = config.logging.inline;
  }

  /** One line, now. */
  log(scope: string, message: string, data?: Record<string, unknown>): void {
    if (!this.enabled) return;
    this.write(scope, message, data);
  }

  /**
   * Opens a span: logs `message` immediately and returns a function that logs
   * the completion with the elapsed milliseconds.
   *
   *     const done = this.inline.start('WorkflowService.listAll', 'listing workflows');
   *     const items = await this.repository.findAll();
   *     done({ count: items.length });
   */
  start(scope: string, message: string, data?: Record<string, unknown>): InlineSpanEnd {
    if (!this.enabled) return NOOP_SPAN;

    const startedAt = performance.now();
    this.write(scope, `${message} …`, data);

    return (endData?: Record<string, unknown>) => {
      const elapsedMs = Math.round((performance.now() - startedAt) * 100) / 100;
      this.write(scope, `${message} ✓`, { ...endData, elapsedMs });
    };
  }

  private write(scope: string, message: string, data?: Record<string, unknown>): void {
    const parts = [new Date().toISOString().slice(11, 23), 'inline'];

    // The request id is what makes two interleaved requests readable. Absent
    // outside an HTTP context (a scheduled job, a socket handler) — omitted
    // rather than printed as "undefined".
    const requestId = RequestContextStore.requestId;
    if (requestId) parts.push(requestId.slice(0, 8));

    parts.push(scope, message);

    const suffix = data && Object.keys(data).length > 0 ? ` ${safeStringify(data)}` : '';
    process.stdout.write(`[${parts.join('] [')}]${suffix}\n`);
  }
}

/**
 * Trace data is arbitrary — a BigInt or a circular reference in there should
 * degrade the line, not throw inside the thing being traced.
 */
function safeStringify(data: Record<string, unknown>): string {
  try {
    const replacer = (_key: string, value: unknown): unknown =>
      typeof value === 'bigint' ? value.toString() : value;
    return JSON.stringify(data, replacer) ?? '';
  } catch {
    return '[unserialisable]';
  }
}
