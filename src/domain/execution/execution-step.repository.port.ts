import type { ExecutionStep } from './execution-step.entity';

/** Injection token. Symbols cannot collide the way string tokens can. */
export const EXECUTION_STEP_REPOSITORY = Symbol('ExecutionStepRepository');

export interface ExecutionStepRepositoryPort {
  /**
   * Every row, unpaginated and unfiltered.
   *
   * Fine while these tables are small; it is a table scan that grows without
   * bound, so this needs the same offset/keyset treatment as UserRepositoryPort
   * before anything real depends on it.
   */
  findAll(): Promise<ExecutionStep[]>;
}
