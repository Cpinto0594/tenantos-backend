import type { WorkflowNodeConnection } from './workflow-node-connection.entity';

/** Injection token. Symbols cannot collide the way string tokens can. */
export const WORKFLOW_NODE_CONNECTION_REPOSITORY = Symbol('WorkflowNodeConnectionRepository');

export interface WorkflowNodeConnectionRepositoryPort {
  /**
   * Every row, unpaginated and unfiltered.
   *
   * Fine while these tables are small; it is a table scan that grows without
   * bound, so this needs the same offset/keyset treatment as UserRepositoryPort
   * before anything real depends on it.
   */
  findAll(): Promise<WorkflowNodeConnection[]>;
}
