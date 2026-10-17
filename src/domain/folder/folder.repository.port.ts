import type { Folder } from './folder.entity';

/** Injection token. Symbols cannot collide the way string tokens can. */
export const FOLDER_REPOSITORY = Symbol('FolderRepository');

export interface WorkspaceFolderCounts {
  workspaceId: string;
  count: number;
}

export interface FolderRepositoryPort {
  /**
   * Every row, unpaginated and unfiltered.
   *
   * Fine while these tables are small; it is a table scan that grows without
   * bound, so this needs the same offset/keyset treatment as UserRepositoryPort
   * before anything real depends on it.
   */
  findAll(): Promise<Folder[]>;

  countByWorkspaceIds(workspaceIds: readonly string[]): Promise<WorkspaceFolderCounts[]>;

  /**
   * Every folder inside the given workspaces.
   *
   * Takes a list rather than a single id so a caller reading a whole namespace
   * does it in one round trip instead of one per workspace. An empty list means
   * an empty result, not "no filter" — the difference is a data leak.
   */
  findByWorkspaceIds(workspaceIds: readonly string[]): Promise<Folder[]>;

  findByWorkspaceIdAndDefault(workspaceId: string): Promise<Folder | null>;

  /** One folder by id, or null. The caller checks which workspace it is in. */
  findById(id: string): Promise<Folder | null>;

  /**
   * Inserts a folder.
   *
   * Throws FolderNameTakenError on the `(workspace_id, name)` unique index and
   * FolderSlugTakenError on `(workspace_id, slug)`.
   */
  create(input: CreateFolderInput): Promise<Folder>;

  /**
   * Renames a folder scoped to the workspace it must belong to, and optionally
   * makes it the workspace's default.
   *
   * The slug is left alone: it is an identifier other things may already
   * point at, not a view of the name.
   *
   * `isDefault: true` makes this the only default folder in the workspace,
   * clearing the flag on the others in the same transaction. Anything else
   * leaves the flag as it is — there is no way to end up with no default.
   *
   * Throws FolderNotFoundError when no row matches `(id, workspaceId)` and
   * FolderNameTakenError on the `(workspace_id, name)` unique index.
   */
  rename(id: string, workspaceId: string, input: RenameFolderInput): Promise<Folder>;
}

export interface RenameFolderInput {
  readonly name: string;
  readonly isDefault?: boolean;
}

export interface CreateFolderInput {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
}
