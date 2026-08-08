import type { WorkflowNode } from './workflow-node.entity';

/** Injection token. Symbols cannot collide the way string tokens can. */
export const WORKFLOW_NODE_REPOSITORY = Symbol('WorkflowNodeRepository');

export interface WorkflowNodeRepositoryPort {
  /**
   * Every row, unpaginated and unfiltered.
   *
   * Fine while these tables are small; it is a table scan that grows without
   * bound, so this needs the same offset/keyset treatment as UserRepositoryPort
   * before anything real depends on it.
   */
  findAll(): Promise<WorkflowNode[]>;
}
