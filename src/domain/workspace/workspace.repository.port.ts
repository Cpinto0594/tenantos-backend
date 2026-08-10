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

  /**
   * Inserts a workspace together with its default folder.
   *
   * Throws WorkspaceSlugTakenError on the `(user_id, slug)` unique index. Both
   * rows are minted by the caller and inserted in one transaction, the same
   * shape as WorkflowRepositoryPort.create pairing a workflow with its first
   * version — "a workspace always has a default folder" is an invariant every
   * reader can rely on rather than a case each one has to handle.
   */
  create(input: CreateWorkspaceInput): Promise<Workspace>;
}

export interface CreateWorkspaceInput {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly settings: Record<string, unknown>;
  /** Id for the default folder created alongside this workspace. */
  readonly defaultFolderId: string;
}
