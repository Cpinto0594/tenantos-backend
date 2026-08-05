import { type INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';
import { AppConfigService } from '@infrastructure/config/app-config.service';
import { REDIS_PUBLISHER, REDIS_SUBSCRIBER } from '@infrastructure/cache/redis.provider';

/**
 * Socket.IO with a Redis pub/sub backplane.
 *
 * **This is what makes WebSockets survive horizontal scaling.** Socket.IO keeps
 * connections in the memory of whichever process accepted them. With more than
 * one replica, `server.to(room).emit(...)` reaches only the clients connected to
 * *that* replica — so a notification lands for a third of your users and the
 * bug is invisible in single-instance development.
 *
 * The Redis adapter forwards every emit through pub/sub so all instances
 * deliver it. It is not an optimisation; without it, a multi-replica deployment
 * is silently broken.
 *
 * The related requirement is sticky sessions at the load balancer: Socket.IO's
 * HTTP long-polling fallback makes several requests that must reach the same
 * process. Either enable session affinity or force `transports: ['websocket']`.
 * See docs/DEPLOYMENT.md.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  connect(): void {
    // Dedicated connections: a subscribed Redis client cannot issue ordinary
    // commands, so these cannot be the cache client.
    const pubClient = this.app.get<Redis>(REDIS_PUBLISHER, { strict: false });
    const subClient = this.app.get<Redis>(REDIS_SUBSCRIBER, { strict: false });
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    const config = this.app.get(AppConfigService, { strict: false });

    const server = super.createIOServer(port, {
      ...options,
      path: config.websocket.path,
      cors: {
        origin: config.websocket.corsOrigins,
        credentials: true,
      },
      // Below this size, compression costs more CPU than it saves bandwidth.
      perMessageDeflate: { threshold: 1024 },
      // Client is assumed gone after 20s of silence. Long enough to survive a
      // mobile network hiccup, short enough to free the slot promptly.
      pingInterval: 25_000,
      pingTimeout: 20_000,
      maxHttpBufferSize: 1e6,
    }) as { adapter: (factory: unknown) => void };

    if (this.adapterConstructor) server.adapter(this.adapterConstructor);

    return server;
  }
}
