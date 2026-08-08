import type { ExecutionQueueItem } from './execution-queue-item.entity';

/** Injection token. Symbols cannot collide the way string tokens can. */
export const EXECUTION_QUEUE_ITEM_REPOSITORY = Symbol('ExecutionQueueItemRepository');

export interface ExecutionQueueItemRepositoryPort {
  /**
   * Every row, unpaginated and unfiltered.
   *
   * Fine while these tables are small; it is a table scan that grows without
   * bound, so this needs the same offset/keyset treatment as UserRepositoryPort
   * before anything real depends on it.
   */
  findAll(): Promise<ExecutionQueueItem[]>;
}
