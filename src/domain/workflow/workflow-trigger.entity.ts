export interface WorkflowTriggerSnapshot {
  id: string;
  workflowId: string;
  type: string;
  config: Record<string, unknown>;
  enabled: boolean;
}

/**
 * A workflow trigger row as the domain sees it.
 *
 * Behaviour-free on purpose: the list endpoint is the only thing reading it
 * today, and inventing invariants before there is a write path to enforce them
 * on produces rules nobody validated. They belong here when create/update land.
 */
export class WorkflowTrigger {
  readonly id: string;
  readonly workflowId: string;
  readonly type: string;
  readonly config: Record<string, unknown>;
  readonly enabled: boolean;

  private constructor(s: WorkflowTriggerSnapshot) {
    this.id = s.id;
    this.workflowId = s.workflowId;
    this.type = s.type;
    this.config = s.config;
    this.enabled = s.enabled;
  }

  static fromSnapshot(s: WorkflowTriggerSnapshot): WorkflowTrigger {
    return new WorkflowTrigger(s);
  }

  toSnapshot(): WorkflowTriggerSnapshot {
    return {
      id: this.id,
      workflowId: this.workflowId,
      type: this.type,
      config: this.config,
      enabled: this.enabled,
    };
  }
}
