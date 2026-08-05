import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { ZodError } from 'zod';
import type { Request, Response } from 'express';
import {
  AuthenticationError,
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  DomainError,
  NotFoundError,
} from '@domain/shared/domain-error';
import { InfrastructureError } from '@shared/errors/infrastructure-error';
import { ErrorCode } from '@shared/errors/error-code';
import { ApiErrorResponse } from '@shared/http/api-response';
import { RequestContextStore } from '@shared/context/request-context';
import { HEADER } from '@shared/constants/http.constants';

interface NormalizedError {
  status: number;
  errorCode: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  /** Expected errors log at warn without a stack; unexpected ones at error with one. */
  isExpected: boolean;
}

/**
 * Domain error kind -> HTTP status. Ordered most-specific-first.
 *
 * A table of predicates rather than of classes. The obvious shape —
 * `[NotFoundError, 404]` — cannot be typed: these are abstract bases with
 * protected constructors, and neither `new (...) => T` nor `abstract new
 * (...) => T` accepts one, leaving only `Function`, which is untyped. Closing
 * over `instanceof` keeps the whole table checked.
 */
const DOMAIN_ERROR_STATUS: ReadonlyArray<[(error: DomainError) => boolean, number]> = [
  [(error) => error instanceof NotFoundError, HttpStatus.NOT_FOUND],
  [(error) => error instanceof ConflictError, HttpStatus.CONFLICT],
  [(error) => error instanceof AuthenticationError, HttpStatus.UNAUTHORIZED],
  [(error) => error instanceof AuthorizationError, HttpStatus.FORBIDDEN],
  [(error) => error instanceof BusinessRuleError, HttpStatus.UNPROCESSABLE_ENTITY],
];

const HTTP_STATUS_ERROR_CODE: Readonly<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.METHOD_NOT_ALLOWED]: ErrorCode.METHOD_NOT_ALLOWED,
  [HttpStatus.REQUEST_TIMEOUT]: ErrorCode.REQUEST_TIMEOUT,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PAYLOAD_TOO_LARGE,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ErrorCode.VALIDATION_FAILED,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMIT_EXCEEDED,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
};

/**
 * The single exit point for every error the API produces.
 *
 * Three jobs, in order of importance:
 *
 *  1. **Never leak internals.** A stack trace, a SQL fragment, or a Prisma
 *     message naming your tables is reconnaissance. Unrecognised errors become
 *     a flat 500 with a generic message; the real thing goes to the log, keyed
 *     by the same traceId the client receives.
 *  2. **One response shape.** Whatever went wrong — Zod, class-validator, a
 *     domain rule, a dead database, a thrown string — the client parses one
 *     schema.
 *  3. **Right log level.** A wrong password is not an error; a dead database
 *     is. Conflating them makes alerting useless.
 */
@Injectable()
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(GlobalExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    // WebSocket and RPC contexts have no `res` to write to; their own filters
    // handle them (see WsExceptionFilter).
    if (host.getType() !== 'http') throw exception;

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const traceId = RequestContextStore.requestId ?? 'unknown';

    const normalized = this.normalize(exception);

    this.log(normalized, exception, request);

    // Something already started streaming — headers are gone, and writing a
    // second body would corrupt the response.
    if (response.headersSent) {
      response.destroy();
      return;
    }

    if (
      normalized.status === Number(HttpStatus.TOO_MANY_REQUESTS) &&
      !response.getHeader(HEADER.RETRY_AFTER)
    ) {
      response.setHeader(HEADER.RETRY_AFTER, '60');
    }

    response.status(normalized.status).json(
      new ApiErrorResponse({
        message: normalized.message,
        errorCode: normalized.errorCode,
        traceId,
        details: normalized.details,
      }),
    );
  }

  // ---------------------------------------------------------------------------

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof DomainError) return this.fromDomainError(exception);
    if (exception instanceof ThrottlerException) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        errorCode: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: 'Too many requests. Slow down and retry after the interval in Retry-After.',
        isExpected: true,
      };
    }
    if (exception instanceof HttpException) return this.fromHttpException(exception);
    if (exception instanceof ZodError) return this.fromZodError(exception);
    if (exception instanceof InfrastructureError) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        errorCode: exception.code,
        // The real message names hosts, ports and sometimes credentials.
        message: 'A downstream dependency is unavailable. Retry shortly.',
        isExpected: false,
      };
    }
    if (this.isPrismaError(exception)) return this.fromPrismaError(exception);

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred.',
      isExpected: false,
    };
  }

  private fromDomainError(error: DomainError): NormalizedError {
    const match = DOMAIN_ERROR_STATUS.find(([matches]) => matches(error));
    return {
      status: match?.[1] ?? HttpStatus.BAD_REQUEST,
      errorCode: error.code,
      message: error.message,
      details: error.details,
      isExpected: error.isExpected,
    };
  }

  private fromHttpException(exception: HttpException): NormalizedError {
    const status = exception.getStatus();
    const body = exception.getResponse();

    // class-validator's ValidationPipe throws BadRequestException with
    // `message: string[]`. Reshape it into per-field details so a form can
    // highlight the offending inputs instead of dumping a sentence.
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const raw = body.message;
      if (Array.isArray(raw)) {
        return {
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errorCode: ErrorCode.VALIDATION_FAILED,
          message: 'Request validation failed.',
          details: { violations: raw.map(String) },
          isExpected: true,
        };
      }
      return {
        status,
        errorCode: this.codeForStatus(status),
        message: String(raw),
        isExpected: status < Number(HttpStatus.INTERNAL_SERVER_ERROR),
      };
    }

    return {
      status,
      errorCode: this.codeForStatus(status),
      message: typeof body === 'string' ? body : exception.message,
      isExpected: status < Number(HttpStatus.INTERNAL_SERVER_ERROR),
    };
  }

  private fromZodError(error: ZodError): NormalizedError {
    const fields: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.join('.') || '_';
      (fields[key] ??= []).push(issue.message);
    }
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      errorCode: ErrorCode.VALIDATION_FAILED,
      message: 'Request validation failed.',
      details: { fields },
      isExpected: true,
    };
  }

  /**
   * A last line of defence only. Repositories are expected to translate Prisma
   * errors into domain errors, because "unique constraint violated" is only
   * meaningful next to the code that knows *which* constraint. Anything
   * reaching here is a gap, so it is logged as unexpected even when the status
   * is a 4xx.
   */
  private fromPrismaError(error: Prisma.PrismaClientKnownRequestError): NormalizedError {
    switch (error.code) {
      case 'P2002': // unique constraint
        return {
          status: HttpStatus.CONFLICT,
          errorCode: ErrorCode.CONFLICT,
          message: 'That value is already taken.',
          isExpected: false,
        };
      case 'P2025': // record not found
        return {
          status: HttpStatus.NOT_FOUND,
          errorCode: ErrorCode.NOT_FOUND,
          message: 'The requested resource does not exist.',
          isExpected: false,
        };
      case 'P2003': // FK violation
        return {
          status: HttpStatus.CONFLICT,
          errorCode: ErrorCode.CONFLICT,
          message: 'The operation conflicts with a related record.',
          isExpected: false,
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          errorCode: ErrorCode.DATABASE_UNAVAILABLE,
          message: 'An unexpected error occurred.',
          isExpected: false,
        };
    }
  }

  private isPrismaError(e: unknown): e is Prisma.PrismaClientKnownRequestError {
    return e instanceof Prisma.PrismaClientKnownRequestError;
  }

  private codeForStatus(status: number): ErrorCode {
    return HTTP_STATUS_ERROR_CODE[status] ?? ErrorCode.INTERNAL_ERROR;
  }

  private log(normalized: NormalizedError, exception: unknown, request: Request): void {
    const payload = {
      errorCode: normalized.errorCode,
      status: normalized.status,
      method: request.method,
      path: request.originalUrl,
      // Pino's error serializer handles the stack; passing the raw error keeps
      // `cause` chains intact.
      err: exception instanceof Error ? exception : new Error(String(exception)),
    };

    if (normalized.isExpected) {
      // No stack: this is a valid request producing a negative answer, and a
      // stack trace per bad password is how log bills happen.
      this.logger.warn(
        { ...payload, err: undefined, reason: normalized.message },
        'Request rejected: %s',
        normalized.errorCode,
      );
      return;
    }

    this.logger.error(payload, 'Unhandled error: %s', normalized.errorCode);
  }
}
