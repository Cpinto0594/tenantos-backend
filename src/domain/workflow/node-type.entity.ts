export interface NodeTypeSnapshot {
  id: string;
  name: string;
  displayName: string;
  version: number;
  description: string | null;
  inputs: unknown[] | null;
  outputs: unknown[];
  credentials: unknown[];
  properties: unknown[];
  icon: Record<string, unknown>;
  category: unknown[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A node type row as the domain sees it.
 *
 * Behaviour-free on purpose: the list endpoint is the only thing reading it
 * today, and inventing invariants before there is a write path to enforce them
 * on produces rules nobody validated. They belong here when create/update land.
 */
export class NodeType {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly version: number;
  readonly description: string | null;
  readonly inputs: unknown[] | null;
  readonly outputs: unknown[];
  readonly credentials: unknown[];
  readonly properties: unknown[];
  readonly icon: Record<string, unknown>;
  readonly category: unknown[];
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(s: NodeTypeSnapshot) {
    this.id = s.id;
    this.name = s.name;
    this.displayName = s.displayName;
    this.version = s.version;
    this.description = s.description;
    this.inputs = s.inputs;
    this.outputs = s.outputs;
    this.credentials = s.credentials;
    this.properties = s.properties;
    this.icon = s.icon;
    this.category = s.category;
    this.metadata = s.metadata;
    this.createdAt = s.createdAt;
    this.updatedAt = s.updatedAt;
  }

  static fromSnapshot(s: NodeTypeSnapshot): NodeType {
    return new NodeType(s);
  }

  toSnapshot(): NodeTypeSnapshot {
    return {
      id: this.id,
      name: this.name,
      displayName: this.displayName,
      version: this.version,
      description: this.description,
      inputs: this.inputs,
      outputs: this.outputs,
      credentials: this.credentials,
      properties: this.properties,
      icon: this.icon,
      category: this.category,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
