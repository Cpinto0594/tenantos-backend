export interface WorkflowNodeSettingsSnapshot {
  id: string;
  nodeId: string;
  timeoutMs: number | null;
  retryEnabled: boolean;
  retryCount: number;
  retryDelayMs: number;
  retryStrategy: string;
  continueOnError: boolean;
  alwaysExecute: boolean;
  executionCondition: string | null;
  concurrencyLimit: number | null;
  cacheEnabled: boolean;
  cacheTtlSeconds: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A workflow node setting row as the domain sees it.
 *
 * Behaviour-free on purpose: the list endpoint is the only thing reading it
 * today, and inventing invariants before there is a write path to enforce them
 * on produces rules nobody validated. They belong here when create/update land.
 */
export class WorkflowNodeSettings {
  readonly id: string;
  readonly nodeId: string;
  readonly timeoutMs: number | null;
  readonly retryEnabled: boolean;
  readonly retryCount: number;
  readonly retryDelayMs: number;
  readonly retryStrategy: string;
  readonly continueOnError: boolean;
  readonly alwaysExecute: boolean;
  readonly executionCondition: string | null;
  readonly concurrencyLimit: number | null;
  readonly cacheEnabled: boolean;
  readonly cacheTtlSeconds: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(s: WorkflowNodeSettingsSnapshot) {
    this.id = s.id;
    this.nodeId = s.nodeId;
    this.timeoutMs = s.timeoutMs;
    this.retryEnabled = s.retryEnabled;
    this.retryCount = s.retryCount;
    this.retryDelayMs = s.retryDelayMs;
    this.retryStrategy = s.retryStrategy;
    this.continueOnError = s.continueOnError;
    this.alwaysExecute = s.alwaysExecute;
    this.executionCondition = s.executionCondition;
    this.concurrencyLimit = s.concurrencyLimit;
    this.cacheEnabled = s.cacheEnabled;
    this.cacheTtlSeconds = s.cacheTtlSeconds;
    this.createdAt = s.createdAt;
    this.updatedAt = s.updatedAt;
  }

  static fromSnapshot(s: WorkflowNodeSettingsSnapshot): WorkflowNodeSettings {
    return new WorkflowNodeSettings(s);
  }

  toSnapshot(): WorkflowNodeSettingsSnapshot {
    return {
      id: this.id,
      nodeId: this.nodeId,
      timeoutMs: this.timeoutMs,
      retryEnabled: this.retryEnabled,
      retryCount: this.retryCount,
      retryDelayMs: this.retryDelayMs,
      retryStrategy: this.retryStrategy,
      continueOnError: this.continueOnError,
      alwaysExecute: this.alwaysExecute,
      executionCondition: this.executionCondition,
      concurrencyLimit: this.concurrencyLimit,
      cacheEnabled: this.cacheEnabled,
      cacheTtlSeconds: this.cacheTtlSeconds,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
