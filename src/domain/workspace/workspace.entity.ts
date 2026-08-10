export interface NamespacesResourcesCounts {
  workflows: number;
  variables: number;
  credentials: number;
}

export interface WorkspaceSnapshot {
  id: string;
  userId: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  settings: Record<string, unknown>;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;

}

/**
 * A workspace row as the domain sees it.
 *
 * Behaviour-free on purpose: the list endpoint is the only thing reading it
 * today, and inventing invariants before there is a write path to enforce them
 * on produces rules nobody validated. They belong here when create/update land.
 */
export class Workspace {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly status: string;
  readonly isDefault: boolean;
  readonly settings: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(s: WorkspaceSnapshot) {
    this.id = s.id;
    this.userId = s.userId;
    this.name = s.name;
    this.slug = s.slug;
    this.description = s.description;
    this.status = s.status;
    this.settings = s.settings;
    this.createdAt = s.createdAt;
    this.updatedAt = s.updatedAt;
    this.isDefault = s.isDefault;
  }

  static fromSnapshot(s: WorkspaceSnapshot): Workspace {
    return new Workspace(s);
  }

  toSnapshot(): WorkspaceSnapshot {
    return {
      id: this.id,
      userId: this.userId,
      name: this.name,
      slug: this.slug,
      description: this.description,
      status: this.status,
      settings: this.settings,
      isDefault: this.isDefault,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
