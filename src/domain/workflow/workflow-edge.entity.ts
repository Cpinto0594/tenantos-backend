export interface WorkflowEdgeSnapshot {
  id: string;
  workflowVersionId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePort: string;
  targetPort: string;
  edgeType: string;
  label: string | null;
  config: Record<string, unknown>;
  createdAt: Date;
}

/**
 * A workflow edge row as the domain sees it.
 *
 * Behaviour-free on purpose: the list endpoint is the only thing reading it
 * today, and inventing invariants before there is a write path to enforce them
 * on produces rules nobody validated. They belong here when create/update land.
 */
export class WorkflowEdge {
  readonly id: string;
  readonly workflowVersionId: string;
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly sourcePort: string;
  readonly targetPort: string;
  readonly edgeType: string;
  readonly label: string | null;
  readonly config: Record<string, unknown>;
  readonly createdAt: Date;

  private constructor(s: WorkflowEdgeSnapshot) {
    this.id = s.id;
    this.workflowVersionId = s.workflowVersionId;
    this.sourceNodeId = s.sourceNodeId;
    this.targetNodeId = s.targetNodeId;
    this.sourcePort = s.sourcePort;
    this.targetPort = s.targetPort;
    this.edgeType = s.edgeType;
    this.label = s.label;
    this.config = s.config;
    this.createdAt = s.createdAt;
  }

  static fromSnapshot(s: WorkflowEdgeSnapshot): WorkflowEdge {
    return new WorkflowEdge(s);
  }

  toSnapshot(): WorkflowEdgeSnapshot {
    return {
      id: this.id,
      workflowVersionId: this.workflowVersionId,
      sourceNodeId: this.sourceNodeId,
      targetNodeId: this.targetNodeId,
      sourcePort: this.sourcePort,
      targetPort: this.targetPort,
      edgeType: this.edgeType,
      label: this.label,
      config: this.config,
      createdAt: this.createdAt,
    };
  }
}
