import { Inject, Injectable } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { PinoLogger } from 'nestjs-pino';
import type { Server, Socket } from 'socket.io';
import { TOKEN_SERVICE, TOKEN_DENYLIST } from '@domain/auth/auth.ports';
import type { TokenDenylistPort, TokenServicePort } from '@domain/auth/auth.ports';
import { USER_REPOSITORY, type UserRepositoryPort } from '@domain/user/user.repository.port';
import { UserStatus } from '@domain/shared/enums';
import { MetricsService } from '@infrastructure/observability/metrics.service';

/** What we hang off the socket once it has authenticated. */
interface SocketPrincipal {
  userId: string;
  tenantIds: string[];
  isPlatformAdmin: boolean;
}

const PRINCIPAL = Symbol('principal');
type AuthenticatedSocket = Socket & { [PRINCIPAL]?: SocketPrincipal };

/**
 * Real-time events.
 *
 * **Authentication happens in handshake middleware, not in a guard.** A Nest
 * WebSocket guard runs per *message*, which means an unauthenticated socket is
 * already connected and consuming a slot before anything checks it. Rejecting
 * during the handshake is both cheaper and correct — see `afterInit`.
 *
 * **Rooms are the authorization boundary.** A socket joins exactly the rooms
 * for the workspaces its user belongs to, decided once from the database at
 * connection time. Clients cannot ask to join a room — that request would be
 * attacker-controlled input deciding what data they receive, which is how
 * cross-tenant leaks happen in every WebSocket implementation that gets it
 * wrong.
 */
@Injectable()
@WebSocketGateway({ namespace: '/events' })
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenServicePort,
    @Inject(TOKEN_DENYLIST) private readonly denylist: TokenDenylistPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    private readonly metrics: MetricsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EventsGateway.name);
  }

  /**
   * Authentication runs as namespace middleware, **not** in `handleConnection`.
   *
   * `handleConnection` is async, and Socket.IO does not await it: the client's
   * `connect` event fires as soon as the transport is up, so a well-behaved
   * client that emits immediately gets its first messages rejected while the
   * token verification is still in flight. The bug is timing-dependent, so it
   * shows up as "sometimes the first message is lost" rather than anything
   * reproducible.
   *
   * Middleware runs *before* the connection is established. Rejecting here
   * means `next(error)` — the client sees `connect_error` and no socket slot is
   * ever allocated, which is also the cheaper outcome under abuse.
   */
  afterInit(server: Server): void {
    server.use((socket: AuthenticatedSocket, next: (error?: Error) => void) => {
      void this.authenticate(socket)
        .then(() => next())
        .catch((error: unknown) => {
          this.logger.warn(
            { socketId: socket.id, reason: error instanceof Error ? error.message : 'unknown' },
            'Rejected socket handshake',
          );
          // The client is told only that authentication failed — which check
          // failed is not its business.
          next(new Error('Authentication failed'));
        });
    });

    this.logger.info('WebSocket gateway ready on /events');
  }

  private async authenticate(socket: AuthenticatedSocket): Promise<void> {
    const token = this.extractToken(socket);
    if (!token) throw new WsException('No access token supplied');

    const claims = await this.tokens.verifyAccessToken(token);

    // The same revocation checks the HTTP strategy performs. A socket can stay
    // open for hours, so skipping them would leave a revoked session live far
    // longer than any HTTP request would.
    if (await this.denylist.has(claims.jti)) throw new WsException('Token revoked');

    const snapshot = await this.users.findAuthSnapshot(claims.sub);
    if (
      !snapshot ||
      snapshot.deletedAt !== null ||
      snapshot.tokenVersion !== claims.tv ||
      snapshot.status !== UserStatus.ACTIVE
    ) {
      throw new WsException('Session is no longer valid');
    }

    socket[PRINCIPAL] = {
      userId: claims.sub,
      tenantIds: [],
      isPlatformAdmin: snapshot.isPlatformAdmin,
    };
  }

  /**
   * Runs after the middleware has authenticated, so the principal is
   * guaranteed. Only joins rooms and counts the connection.
   */
  handleConnection(socket: AuthenticatedSocket): void {
    const principal = socket[PRINCIPAL];
    if (!principal) {
      // Unreachable — the middleware rejects before this runs. Fail closed
      // rather than assert, so a future refactor cannot open a hole silently.
      socket.disconnect(true);
      return;
    }

    // Server-decided rooms: one per user for direct messages, one per workspace
    // for broadcasts. `join` is synchronous for the in-memory adapter and
    // returns a promise for the Redis one; either way nothing depends on the
    // result here.
    void socket.join(userRoom(principal.userId));
    for (const tenantId of principal.tenantIds) void socket.join(tenantRoom(tenantId));

    this.metrics.websocketConnections.inc();
    this.logger.debug(
      { userId: principal.userId, socketId: socket.id, rooms: principal.tenantIds.length },
      'Socket connected',
    );
  }

  handleDisconnect(socket: AuthenticatedSocket): void {
    // Only count sockets that were actually admitted, or the gauge drifts
    // negative every time a connection is rejected.
    if (socket[PRINCIPAL]) this.metrics.websocketConnections.dec();
    this.logger.debug({ socketId: socket.id }, 'Socket disconnected');
  }

  /**
   * Round-trip latency check for clients.
   *
   * Named `client:ping`, not `ping`: Socket.IO reserves `ping`/`pong` for its
   * own heartbeat frames, so a handler registered under that name is simply
   * never invoked — the message is swallowed by the protocol layer and the
   * client's callback waits forever. Same applies to `connect`, `disconnect`,
   * `error` and `newListener`.
   */
  @SubscribeMessage('client:ping')
  handlePing(@ConnectedSocket() socket: AuthenticatedSocket): { pong: true; at: string } {
    this.requirePrincipal(socket);
    return { pong: true, at: new Date().toISOString() };
  }

  /**
   * Subscribes to a workspace's event stream — but only one the user already
   * belongs to. The membership list was fixed at connection time from the
   * database; this checks against that, never against the request.
   */
  @SubscribeMessage('subscribe:tenant')
  async handleSubscribe(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() body: { tenantId?: unknown },
  ): Promise<{ subscribed: string }> {
    const principal = this.requirePrincipal(socket);
    const tenantId = typeof body?.tenantId === 'string' ? body.tenantId : null;

    if (!tenantId) throw new WsException('tenantId is required');
    if (!principal.isPlatformAdmin && !principal.tenantIds.includes(tenantId)) {
      throw new WsException('You are not a member of that workspace');
    }

    await socket.join(tenantRoom(tenantId));
    return { subscribed: tenantId };
  }

  // -- Server-side publishing API ---------------------------------------------
  // Used by RealtimePublisher, which is what application code injects.

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server.to(userRoom(userId)).emit(event, payload);
  }

  emitToTenant(tenantId: string, event: string, payload: unknown): void {
    this.server.to(tenantRoom(tenantId)).emit(event, payload);
  }

  private requirePrincipal(socket: AuthenticatedSocket): SocketPrincipal {
    const principal = socket[PRINCIPAL];
    // Only reachable if a message arrives between connection and rejection.
    if (!principal) throw new WsException('Not authenticated');
    return principal;
  }

  /**
   * Handshake auth first, query string second.
   *
   * `auth` is the documented Socket.IO mechanism and does not end up in
   * proxy access logs; `?token=` does, which is why it is a fallback for
   * environments that cannot set handshake auth rather than the primary path.
   */
  private extractToken(socket: Socket): string | null {
    const fromAuth: unknown = socket.handshake.auth?.token;
    if (typeof fromAuth === 'string' && fromAuth.length > 0) return fromAuth;

    const header = socket.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7);

    const fromQuery = socket.handshake.query?.token;
    if (typeof fromQuery === 'string' && fromQuery.length > 0) return fromQuery;

    return null;
  }
}

const userRoom = (userId: string) => `user:${userId}`;
const tenantRoom = (tenantId: string) => `tenant:${tenantId}`;
