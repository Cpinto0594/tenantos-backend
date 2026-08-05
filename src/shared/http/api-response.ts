import { ApiProperty } from '@nestjs/swagger';
import { type ErrorCode } from '@shared/errors/error-code';

/**
 * One response shape for the whole API. Clients write the unwrapping once.
 *
 * The cost of an envelope is a little verbosity; the benefit is that success
 * and failure are distinguishable without inspecting the status code, and that
 * `traceId` rides along on every response — so a user reporting "it broke"
 * hands you the exact log line.
 */

export class ApiSuccessResponse<T> {
  @ApiProperty({ example: true })
  readonly success = true as const;

  @ApiProperty({ description: 'Payload. Shape depends on the endpoint.' })
  readonly data: T;

  @ApiProperty({
    example: '3f1a...-…',
    description: 'Correlates this response with server logs. Quote it in bug reports.',
  })
  readonly traceId: string;

  @ApiProperty({ example: '2026-08-03T12:34:56.789Z', format: 'date-time' })
  readonly timestamp: string;

  constructor(data: T, traceId: string) {
    this.data = data;
    this.traceId = traceId;
    this.timestamp = new Date().toISOString();
  }
}

export class ApiErrorResponse {
  @ApiProperty({ example: false })
  readonly success = false as const;

  @ApiProperty({
    example: 'Email address is already registered',
    description: 'Human-readable and subject to change. Do not branch on this — use errorCode.',
  })
  readonly message: string;

  @ApiProperty({
    example: 'EMAIL_ALREADY_EXISTS',
    description: 'Stable machine-readable code. Part of the API contract.',
  })
  readonly errorCode: ErrorCode;

  @ApiProperty({
    required: false,
    description: 'Structured context — which fields failed validation, which id was not found.',
    example: { fields: { email: ['must be a valid email address'] } },
  })
  readonly details?: Record<string, unknown>;

  @ApiProperty({ example: '3f1a...-…' })
  readonly traceId: string;

  @ApiProperty({ example: '2026-08-03T12:34:56.789Z', format: 'date-time' })
  readonly timestamp: string;

  constructor(params: {
    message: string;
    errorCode: ErrorCode;
    traceId: string;
    details?: Record<string, unknown>;
  }) {
    this.message = params.message;
    this.errorCode = params.errorCode;
    this.traceId = params.traceId;
    if (params.details) this.details = params.details;
    this.timestamp = new Date().toISOString();
  }
}
