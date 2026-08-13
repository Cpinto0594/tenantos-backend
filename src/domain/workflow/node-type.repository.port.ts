import type { NodeType } from './node-type.entity';

/** Injection token. Symbols cannot collide the way string tokens can. */
export const NODE_TYPE_REPOSITORY = Symbol('NodeTypeRepository');

export interface NodeTypeRepositoryPort {
  /**
   * Every row, unpaginated and unfiltered.
   *
   * Fine while this table is small; it is a table scan that grows without
   * bound, so this needs the same offset/keyset treatment as UserRepositoryPort
   * before anything real depends on it.
   */
  findAll(): Promise<NodeType[]>;

  findAllEnabled(): Promise<NodeType[]>;

  /**
   * The node type registered under `name`.
   *
   * `name` is not a unique column — a name can carry several `version` rows —
   * so this returns the highest version, null when none match.
   */
  findByName(name: string): Promise<NodeType | null>;
}
