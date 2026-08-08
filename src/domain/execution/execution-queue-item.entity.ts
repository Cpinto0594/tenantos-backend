export interface ExecutionQueueItemSnapshot {
  id: string;
  workflowId: string;
  workflowVersionId: string;
  triggerType: string;
  triggerId: string | null;
  payload: Record<string, unknown>;
  priority: number;
  status: string;
  attempts: number;
  maxAttempts: number;
  availableAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  lockedBy: string | null;
  lockedUntil: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A queued execution row as the domain sees it.
 *
 * Behaviour-free on purpose: the list endpoint is the only thing reading it
 * today, and inventing invariants before there is a write path to enforce them
 * on produces rules nobody validated. They belong here when create/update land.
 */
export class ExecutionQueueItem {
  readonly id: string;
  readonly workflowId: string;
  readonly workflowVersionId: string;
  readonly triggerType: string;
  readonly triggerId: string | null;
  readonly payload: Record<string, unknown>;
  readonly priority: number;
  readonly status: string;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly availableAt: Date;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly lockedBy: string | null;
  readonly lockedUntil: Date | null;
  readonly errorMessage: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(s: ExecutionQueueItemSnapshot) {
    this.id = s.id;
    this.workflowId = s.workflowId;
    this.workflowVersionId = s.workflowVersionId;
    this.triggerType = s.triggerType;
    this.triggerId = s.triggerId;
    this.payload = s.payload;
    this.priority = s.priority;
    this.status = s.status;
    this.attempts = s.attempts;
    this.maxAttempts = s.maxAttempts;
    this.availableAt = s.availableAt;
    this.startedAt = s.startedAt;
    this.completedAt = s.completedAt;
    this.lockedBy = s.lockedBy;
    this.lockedUntil = s.lockedUntil;
    this.errorMessage = s.errorMessage;
    this.createdAt = s.createdAt;
    this.updatedAt = s.updatedAt;
  }

  static fromSnapshot(s: ExecutionQueueItemSnapshot): ExecutionQueueItem {
    return new ExecutionQueueItem(s);
  }

  toSnapshot(): ExecutionQueueItemSnapshot {
    return {
      id: this.id,
      workflowId: this.workflowId,
      workflowVersionId: this.workflowVersionId,
      triggerType: this.triggerType,
      triggerId: this.triggerId,
      payload: this.payload,
      priority: this.priority,
      status: this.status,
      attempts: this.attempts,
      maxAttempts: this.maxAttempts,
      availableAt: this.availableAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      lockedBy: this.lockedBy,
      lockedUntil: this.lockedUntil,
      errorMessage: this.errorMessage,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
