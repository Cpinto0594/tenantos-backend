export interface ScheduleSnapshot {
  id: string;
  workflowId: string;
  triggerId: string;
  name: string;
  type: string;
  cronExpression: string | null;
  misfirePolicy: string | null;
  intervalValue: number | null;
  intervalUnit: string | null;
  timezone: string;
  enabled: boolean;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A schedule row as the domain sees it.
 *
 * Behaviour-free on purpose: the list endpoint is the only thing reading it
 * today, and inventing invariants before there is a write path to enforce them
 * on produces rules nobody validated. They belong here when create/update land.
 */
export class Schedule {
  readonly id: string;
  readonly workflowId: string;
  readonly triggerId: string;
  readonly name: string;
  readonly type: string;
  readonly cronExpression: string | null;
  readonly misfirePolicy: string | null;
  readonly intervalValue: number | null;
  readonly intervalUnit: string | null;
  readonly timezone: string;
  readonly enabled: boolean;
  readonly nextRunAt: Date | null;
  readonly lastRunAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(s: ScheduleSnapshot) {
    this.id = s.id;
    this.workflowId = s.workflowId;
    this.triggerId = s.triggerId;
    this.name = s.name;
    this.type = s.type;
    this.cronExpression = s.cronExpression;
    this.misfirePolicy = s.misfirePolicy;
    this.intervalValue = s.intervalValue;
    this.intervalUnit = s.intervalUnit;
    this.timezone = s.timezone;
    this.enabled = s.enabled;
    this.nextRunAt = s.nextRunAt;
    this.lastRunAt = s.lastRunAt;
    this.createdAt = s.createdAt;
    this.updatedAt = s.updatedAt;
  }

  static fromSnapshot(s: ScheduleSnapshot): Schedule {
    return new Schedule(s);
  }

  toSnapshot(): ScheduleSnapshot {
    return {
      id: this.id,
      workflowId: this.workflowId,
      triggerId: this.triggerId,
      name: this.name,
      type: this.type,
      cronExpression: this.cronExpression,
      misfirePolicy: this.misfirePolicy,
      intervalValue: this.intervalValue,
      intervalUnit: this.intervalUnit,
      timezone: this.timezone,
      enabled: this.enabled,
      nextRunAt: this.nextRunAt,
      lastRunAt: this.lastRunAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
