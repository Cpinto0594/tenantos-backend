import type { Workspace } from './workspace.entity';

/** Injection token. Symbols cannot collide the way string tokens can. */
export const WORKSPACE_REPOSITORY = Symbol('WorkspaceRepository');

export interface WorkspaceRepositoryPort {
  /**
   * Every row, unpaginated and unfiltered.
   *
   * Fine while these tables are small; it is a table scan that grows without
   * bound, so this needs the same offset/keyset treatment as UserRepositoryPort
   * before anything real depends on it.
   */
  findAll(): Promise<Workspace[]>;

  /**
   * Every workspace owned by one user.
   *
   * Ownership is the `user_id` column, which is indexed — this is the query the
   * namespace endpoint scopes itself with, and the only thing standing between
   * one user and another's rows, so it belongs in the repository rather than as
   * a filter applied after `findAll`.
   */
  findByUserId(userId: string): Promise<Workspace[]>;

  findByUserIdAndDefault(userId: string): Promise<Workspace | null>;

  /**
   * One workspace by id, or null.
   *
   * Returns the row without filtering by owner: the caller compares `userId`
   * itself. Keeping the check in the service rather than baking it into the
   * query is what lets the same read serve a platform-admin path later without
   * a second, near-identical method — and the comparison is one line in
   * WorkspaceService.assertOwned, where it is easy to see.
   */
  findById(id: string): Promise<Workspace | null>;
}
