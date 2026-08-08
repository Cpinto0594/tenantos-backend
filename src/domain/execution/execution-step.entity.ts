export interface ExecutionStepSnapshot {
  id: string;
  executionId: string;
  nodeId: string;
  parentStepId: string | null;
  status: string;
  attempt: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationMs: number | null;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  errorCode: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/**
 * A execution step row as the domain sees it.
 *
 * Behaviour-free on purpose: the list endpoint is the only thing reading it
 * today, and inventing invariants before there is a write path to enforce them
 * on produces rules nobody validated. They belong here when create/update land.
 */
export class ExecutionStep {
  readonly id: string;
  readonly executionId: string;
  readonly nodeId: string;
  readonly parentStepId: string | null;
  readonly status: string;
  readonly attempt: number;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly durationMs: number | null;
  readonly input: Record<string, unknown>;
  readonly output: Record<string, unknown>;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;

  private constructor(s: ExecutionStepSnapshot) {
    this.id = s.id;
    this.executionId = s.executionId;
    this.nodeId = s.nodeId;
    this.parentStepId = s.parentStepId;
    this.status = s.status;
    this.attempt = s.attempt;
    this.startedAt = s.startedAt;
    this.finishedAt = s.finishedAt;
    this.durationMs = s.durationMs;
    this.input = s.input;
    this.output = s.output;
    this.errorCode = s.errorCode;
    this.errorMessage = s.errorMessage;
    this.metadata = s.metadata;
    this.createdAt = s.createdAt;
  }

  static fromSnapshot(s: ExecutionStepSnapshot): ExecutionStep {
    return new ExecutionStep(s);
  }

  toSnapshot(): ExecutionStepSnapshot {
    return {
      id: this.id,
      executionId: this.executionId,
      nodeId: this.nodeId,
      parentStepId: this.parentStepId,
      status: this.status,
      attempt: this.attempt,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      durationMs: this.durationMs,
      input: this.input,
      output: this.output,
      errorCode: this.errorCode,
      errorMessage: this.errorMessage,
      metadata: this.metadata,
      createdAt: this.createdAt,
    };
  }
}
