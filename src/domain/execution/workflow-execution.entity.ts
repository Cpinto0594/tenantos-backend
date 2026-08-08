export interface WorkflowExecutionSnapshot {
  id: string;
  workflowId: string;
  version: number;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  triggerType: string | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  errorMessage: string | null;
}

/**
 * A workflow execution row as the domain sees it.
 *
 * Behaviour-free on purpose: the list endpoint is the only thing reading it
 * today, and inventing invariants before there is a write path to enforce them
 * on produces rules nobody validated. They belong here when create/update land.
 */
export class WorkflowExecution {
  readonly id: string;
  readonly workflowId: string;
  readonly version: number;
  readonly status: string;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly durationMs: number | null;
  readonly triggerType: string | null;
  readonly input: Record<string, unknown> | null;
  readonly output: Record<string, unknown> | null;
  readonly errorMessage: string | null;

  private constructor(s: WorkflowExecutionSnapshot) {
    this.id = s.id;
    this.workflowId = s.workflowId;
    this.version = s.version;
    this.status = s.status;
    this.startedAt = s.startedAt;
    this.finishedAt = s.finishedAt;
    this.durationMs = s.durationMs;
    this.triggerType = s.triggerType;
    this.input = s.input;
    this.output = s.output;
    this.errorMessage = s.errorMessage;
  }

  static fromSnapshot(s: WorkflowExecutionSnapshot): WorkflowExecution {
    return new WorkflowExecution(s);
  }

  toSnapshot(): WorkflowExecutionSnapshot {
    return {
      id: this.id,
      workflowId: this.workflowId,
      version: this.version,
      status: this.status,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      durationMs: this.durationMs,
      triggerType: this.triggerType,
      input: this.input,
      output: this.output,
      errorMessage: this.errorMessage,
    };
  }
}
