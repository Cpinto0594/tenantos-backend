import { Injectable } from '@nestjs/common';
import { EventsGateway } from './events.gateway';

/**
 * The publishing surface application code depends on.
 *
 * Use cases inject this, not the gateway. It keeps Socket.IO's types out of the
 * application layer and gives one place to add an outbox, batching, or a
 * different transport later — none of which should require touching a use case.
 *
 * Real-time delivery is best effort by design. A dropped event must never fail
 * the business operation that produced it: the write is committed, and a client
 * that missed the notification will see the change on its next fetch.
 */
@Injectable()
export class RealtimePublisher {
  constructor(private readonly gateway: EventsGateway) {}

  userUpdated(userId: string, payload: Record<string, unknown>): void {
    this.gateway.emitToUser(userId, 'user.updated', payload);
  }

  tenantEvent(tenantId: string, event: string, payload: Record<string, unknown>): void {
    this.gateway.emitToTenant(tenantId, event, payload);
  }

  /**
   * Tells every session for this user to discard its tokens — used after a
   * password change or an administrative revocation, so open tabs sign
   * themselves out instead of failing their next request with a 401.
   */
  sessionRevoked(userId: string, reason: string): void {
    this.gateway.emitToUser(userId, 'session.revoked', { reason, at: new Date().toISOString() });
  }
}
