export interface WorkflowVersionSnapshot {
  id: string;
  workflowId: string;
  version: number;
  status: string;
  workflowJson: Record<string, unknown>;
  changeSummary: string | null;
  createdBy: string | null;
  publishedAt: Date | null;
  createdAt: Date;
}

/**
 * A workflow version row as the domain sees it.
 *
 * Behaviour-free on purpose: the list endpoint is the only thing reading it
 * today, and inventing invariants before there is a write path to enforce them
 * on produces rules nobody validated. They belong here when create/update land.
 */
export class WorkflowVersion {
  readonly id: string;
  readonly workflowId: string;
  readonly version: number;
  readonly status: string;
  readonly workflowJson: Record<string, unknown>;
  readonly changeSummary: string | null;
  readonly createdBy: string | null;
  readonly publishedAt: Date | null;
  readonly createdAt: Date;

  private constructor(s: WorkflowVersionSnapshot) {
    this.id = s.id;
    this.workflowId = s.workflowId;
    this.version = s.version;
    this.status = s.status;
    this.workflowJson = s.workflowJson;
    this.changeSummary = s.changeSummary;
    this.createdBy = s.createdBy;
    this.publishedAt = s.publishedAt;
    this.createdAt = s.createdAt;
  }

  static fromSnapshot(s: WorkflowVersionSnapshot): WorkflowVersion {
    return new WorkflowVersion(s);
  }

  toSnapshot(): WorkflowVersionSnapshot {
    return {
      id: this.id,
      workflowId: this.workflowId,
      version: this.version,
      status: this.status,
      workflowJson: this.workflowJson,
      changeSummary: this.changeSummary,
      createdBy: this.createdBy,
      publishedAt: this.publishedAt,
      createdAt: this.createdAt,
    };
  }
}
