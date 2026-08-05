import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { RealtimePublisher } from './realtime.publisher';

/**
 * The gateway authenticates handshakes itself, reusing the same token service,
 * denylist and repositories the HTTP strategy uses — all of which come from the
 * global infrastructure modules, so nothing needs importing here.
 *
 * Reusing those checks rather than writing a second implementation is the point:
 * a socket can stay open for hours, and a parallel auth path is one that
 * eventually forgets a revocation check the HTTP path performs.
 *
 * The Redis adapter is installed in `main.ts` rather than here — it must be
 * attached to the application before it starts listening, which is outside a
 * module's lifecycle.
 */
@Module({
  providers: [EventsGateway, RealtimePublisher],
  exports: [RealtimePublisher],
})
export class WebsocketModule {}
