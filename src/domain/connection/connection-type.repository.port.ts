import type { ConnectionType } from './connection-type.entity';

/** Injection token. Symbols cannot collide the way string tokens can. */
export const CONNECTION_TYPE_REPOSITORY = Symbol('ConnectionTypeRepository');

export interface ConnectionTypeRepositoryPort {
  /**
   * Every row, unpaginated and unfiltered.
   *
   * Fine while these tables are small; it is a table scan that grows without
   * bound, so this needs the same offset/keyset treatment as UserRepositoryPort
   * before anything real depends on it.
   */
  findAll(): Promise<ConnectionType[]>;
}
