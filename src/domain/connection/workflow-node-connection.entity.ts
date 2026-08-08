export interface WorkflowNodeConnectionSnapshot {
  nodeId: string;
  connectionId: string;
  purpose: string | null;
}

/**
 * A workflow node connection row as the domain sees it.
 *
 * Behaviour-free on purpose: the list endpoint is the only thing reading it
 * today, and inventing invariants before there is a write path to enforce them
 * on produces rules nobody validated. They belong here when create/update land.
 */
export class WorkflowNodeConnection {
  readonly nodeId: string;
  readonly connectionId: string;
  readonly purpose: string | null;

  private constructor(s: WorkflowNodeConnectionSnapshot) {
    this.nodeId = s.nodeId;
    this.connectionId = s.connectionId;
    this.purpose = s.purpose;
  }

  static fromSnapshot(s: WorkflowNodeConnectionSnapshot): WorkflowNodeConnection {
    return new WorkflowNodeConnection(s);
  }

  toSnapshot(): WorkflowNodeConnectionSnapshot {
    return {
      nodeId: this.nodeId,
      connectionId: this.connectionId,
      purpose: this.purpose,
    };
  }
}
