export interface ConnectionTypeSnapshot {
  id: string;
  name: string;
  type: string;
  provider: string;
  schema: Record<string, unknown>;
  createdAt: Date;
}

/**
 * A connection type row as the domain sees it.
 *
 * Behaviour-free on purpose: the list endpoint is the only thing reading it
 * today, and inventing invariants before there is a write path to enforce them
 * on produces rules nobody validated. They belong here when create/update land.
 */
export class ConnectionType {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly provider: string;
  readonly schema: Record<string, unknown>;
  readonly createdAt: Date;

  private constructor(s: ConnectionTypeSnapshot) {
    this.id = s.id;
    this.type = s.type;
    this.name = s.name;
    this.provider = s.provider;
    this.schema = s.schema;
    this.createdAt = s.createdAt;
  }

  static fromSnapshot(s: ConnectionTypeSnapshot): ConnectionType {
    return new ConnectionType(s);
  }

  toSnapshot(): ConnectionTypeSnapshot {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      provider: this.provider,
      schema: this.schema,
      createdAt: this.createdAt,
    };
  }
}
