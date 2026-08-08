export interface VariableSnapshot {
  id: string;
  workspaceId: string;
  folderId: string;
  name: string;
  value: string;
  encrypted: boolean;
}

/**
 * A variable row as the domain sees it.
 *
 * Behaviour-free on purpose: the list endpoint is the only thing reading it
 * today, and inventing invariants before there is a write path to enforce them
 * on produces rules nobody validated. They belong here when create/update land.
 */
export class Variable {
  readonly id: string;
  readonly workspaceId: string;
  readonly folderId: string;
  readonly name: string;
  readonly value: string;
  readonly encrypted: boolean;

  private constructor(s: VariableSnapshot) {
    this.id = s.id;
    this.workspaceId = s.workspaceId;
    this.folderId = s.folderId;
    this.name = s.name;
    this.value = s.value;
    this.encrypted = s.encrypted;
  }

  static fromSnapshot(s: VariableSnapshot): Variable {
    return new Variable(s);
  }

  toSnapshot(): VariableSnapshot {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      folderId: this.folderId,
      name: this.name,
      value: this.value,
      encrypted: this.encrypted,
    };
  }
}
