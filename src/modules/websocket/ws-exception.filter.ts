import { type ArgumentsHost, Catch } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { DomainError } from '@domain/shared/domain-error';
import type { Socket } from 'socket.io';

/**
 * Error handling for gateway message handlers.
 *
 * WebSockets have no status codes, so the same discipline as the HTTP filter
 * applies by hand: domain errors keep their message and code, everything else
 * becomes a generic failure. An unhandled exception here would otherwise
 * serialise the stack trace straight to the client.
 */
@Catch()
export class WsExceptionFilter extends BaseWsExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    const socket = host.switchToWs().getClient<Socket>();

    if (exception instanceof DomainError) {
      socket.emit('error', { errorCode: exception.code, message: exception.message });
      return;
    }

    if (exception instanceof WsException) {
      socket.emit('error', { errorCode: 'BAD_REQUEST', message: exception.message });
      return;
    }

    socket.emit('error', { errorCode: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' });
    super.catch(exception, host);
  }
}
