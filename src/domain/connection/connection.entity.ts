export interface ConnectionSnapshot {
  id: string;
  workspaceId: string;
  folderId: string;
  name: string;
  type: string;
  provider: string;
  credentials: Record<string, unknown>;
  encrypted: boolean;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A connection row as the domain sees it.
 *
 * Behaviour-free on purpose: the list endpoint is the only thing reading it
 * today, and inventing invariants before there is a write path to enforce them
 * on produces rules nobody validated. They belong here when create/update land.
 */
export class Connection {
  readonly id: string;
  readonly workspaceId: string;
  readonly folderId: string;
  readonly name: string;
  readonly type: string;
  readonly provider: string;
  readonly credentials: Record<string, unknown>;
  readonly encrypted: boolean;
  readonly status: string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(s: ConnectionSnapshot) {
    this.id = s.id;
    this.workspaceId = s.workspaceId;
    this.folderId = s.folderId;
    this.name = s.name;
    this.type = s.type;
    this.provider = s.provider;
    this.credentials = s.credentials;
    this.encrypted = s.encrypted;
    this.status = s.status;
    this.metadata = s.metadata;
    this.createdAt = s.createdAt;
    this.updatedAt = s.updatedAt;
  }

  static fromSnapshot(s: ConnectionSnapshot): Connection {
    return new Connection(s);
  }

  toSnapshot(): ConnectionSnapshot {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      folderId: this.folderId,
      name: this.name,
      type: this.type,
      provider: this.provider,
      credentials: this.credentials,
      encrypted: this.encrypted,
      status: this.status,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
