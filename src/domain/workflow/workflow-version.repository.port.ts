import type { WorkflowVersion } from './workflow-version.entity';

/** Injection token. Symbols cannot collide the way string tokens can. */
export const WORKFLOW_VERSION_REPOSITORY = Symbol('WorkflowVersionRepository');

export interface WorkflowVersionRepositoryPort {
  /**
   * Every row, unpaginated and unfiltered.
   *
   * Fine while these tables are small; it is a table scan that grows without
   * bound, so this needs the same offset/keyset treatment as UserRepositoryPort
   * before anything real depends on it.
   */
  findAll(): Promise<WorkflowVersion[]>;
}
