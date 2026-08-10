import type { Connection, ConnectionSnapshot } from '@domain/connection/connection.entity';

/**
 * A connection as the credentials endpoint returns it: everything in
 * ConnectionSnapshot except the `credentials` blob itself.
 *
 * That column holds the secret material — API keys, OAuth tokens, passwords —
 * and a list endpoint is the last place it should appear. A caller listing a
 * workspace's credentials wants to know *which* ones exist and whether they are
 * healthy; nothing on this screen needs the secret, and shipping it means every
 * proxy log, browser cache and error report along the way now holds it too.
 *
 * A future "reveal one credential" route can return the blob deliberately, for
 * a single id, and be audited as the sensitive operation it is.
 */
export type CredentialSummary = ConnectionSnapshot;//Omit<ConnectionSnapshot, 'credentials'>;

export function toCredentialSummary(connection: Connection): CredentialSummary {
  return connection.toSnapshot();
}
