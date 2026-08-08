export interface FolderSnapshot {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A folder row as the domain sees it.
 *
 * Behaviour-free on purpose: the list endpoint is the only thing reading it
 * today, and inventing invariants before there is a write path to enforce them
 * on produces rules nobody validated. They belong here when create/update land.
 */
export class Folder {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly description: string | null;
  readonly position: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(s: FolderSnapshot) {
    this.id = s.id;
    this.workspaceId = s.workspaceId;
    this.name = s.name;
    this.description = s.description;
    this.position = s.position;
    this.createdAt = s.createdAt;
    this.updatedAt = s.updatedAt;
  }

  static fromSnapshot(s: FolderSnapshot): Folder {
    return new Folder(s);
  }

  toSnapshot(): FolderSnapshot {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      name: this.name,
      description: this.description,
      position: this.position,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
