export interface WorkflowNodeSnapshot {
  id: string;
  workflowVersionId: string;
  nodeKey: string;
  type: string;
  name: string;
  description: string | null;
  positionX: number;
  positionY: number;
  width: number | null;
  height: number | null;
  enabled: boolean;
  config: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A workflow node row as the domain sees it.
 *
 * Behaviour-free on purpose: the list endpoint is the only thing reading it
 * today, and inventing invariants before there is a write path to enforce them
 * on produces rules nobody validated. They belong here when create/update land.
 */
export class WorkflowNode {
  readonly id: string;
  readonly workflowVersionId: string;
  readonly nodeKey: string;
  readonly type: string;
  readonly name: string;
  readonly description: string | null;
  readonly positionX: number;
  readonly positionY: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly enabled: boolean;
  readonly config: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(s: WorkflowNodeSnapshot) {
    this.id = s.id;
    this.workflowVersionId = s.workflowVersionId;
    this.nodeKey = s.nodeKey;
    this.type = s.type;
    this.name = s.name;
    this.description = s.description;
    this.positionX = s.positionX;
    this.positionY = s.positionY;
    this.width = s.width;
    this.height = s.height;
    this.enabled = s.enabled;
    this.config = s.config;
    this.metadata = s.metadata;
    this.createdAt = s.createdAt;
    this.updatedAt = s.updatedAt;
  }

  static fromSnapshot(s: WorkflowNodeSnapshot): WorkflowNode {
    return new WorkflowNode(s);
  }

  toSnapshot(): WorkflowNodeSnapshot {
    return {
      id: this.id,
      workflowVersionId: this.workflowVersionId,
      nodeKey: this.nodeKey,
      type: this.type,
      name: this.name,
      description: this.description,
      positionX: this.positionX,
      positionY: this.positionY,
      width: this.width,
      height: this.height,
      enabled: this.enabled,
      config: this.config,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
