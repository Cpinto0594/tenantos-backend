export interface WorkflowSnapshot {
  id: string;
  workspaceId: string;
  folderId: string | null;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  active: boolean;
  currentVersionId: string | null;
  createdBy: string | null;
  settings: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A workflow row as the domain sees it.
 *
 * Behaviour-free on purpose: the list endpoint is the only thing reading it
 * today, and inventing invariants before there is a write path to enforce them
 * on produces rules nobody validated. They belong here when create/update land.
 */
export class Workflow {
  readonly id: string;
  readonly workspaceId: string;
  readonly folderId: string | null;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly status: string;
  readonly active: boolean;
  readonly currentVersionId: string | null;
  readonly createdBy: string | null;
  readonly settings: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(s: WorkflowSnapshot) {
    this.id = s.id;
    this.workspaceId = s.workspaceId;
    this.folderId = s.folderId;
    this.name = s.name;
    this.slug = s.slug;
    this.description = s.description;
    this.status = s.status;
    this.active = s.active;
    this.currentVersionId = s.currentVersionId;
    this.createdBy = s.createdBy;
    this.settings = s.settings;
    this.metadata = s.metadata;
    this.createdAt = s.createdAt;
    this.updatedAt = s.updatedAt;
  }

  static fromSnapshot(s: WorkflowSnapshot): Workflow {
    return new Workflow(s);
  }

  toSnapshot(): WorkflowSnapshot {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      folderId: this.folderId,
      name: this.name,
      slug: this.slug,
      description: this.description,
      status: this.status,
      active: this.active,
      currentVersionId: this.currentVersionId,
      createdBy: this.createdBy,
      settings: this.settings,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
