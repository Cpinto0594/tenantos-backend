import type { Variable } from './variable.entity';

/** Injection token. Symbols cannot collide the way string tokens can. */
export const VARIABLE_REPOSITORY = Symbol('VariableRepository');

export interface WorkspaceVariablesCounts {
  workspaceId: string;
  count: number;
}

export interface FolderVariablesCounts {
  folderId: string;
  count: number;
}

export interface VariableRepositoryPort {
  /**
   * Every row, unpaginated and unfiltered.
   *
   * Fine while these tables are small; it is a table scan that grows without
   * bound, so this needs the same offset/keyset treatment as UserRepositoryPort
   * before anything real depends on it.
   */
  findAll(): Promise<Variable[]>;

  countByWorkspaceIds(workspaceIds: readonly string[]): Promise<WorkspaceVariablesCounts[]>;

  countByFolderIds(folderIds: readonly string[]): Promise<FolderVariablesCounts[]>;

  /** Every variable in one workspace, by name. */
  findByWorkspaceId(workspaceId: string): Promise<Variable[]>;

  /** Every variable in one folder, by name. */
  findByFolderId(folderId: string): Promise<Variable[]>;

  /**
   * Inserts a variable.
   *
   * Throws VariableNameTakenError on the `(workspace_id, name)` unique index.
   */
  create(input: CreateVariableInput): Promise<Variable>;

  /**
   * Updates a variable scoped to the folder it must belong to.
   *
   * Throws VariableNotFoundError when no row matches `(id, folderId)`, and
   * VariableNameTakenError on the `(workspace_id, name)` unique index.
   */
  update(id: string, folderId: string, input: UpdateVariableInput): Promise<Variable>;

  /**
   * Deletes a variable scoped to the folder it must belong to.
   *
   * Throws VariableNotFoundError when no row matches `(id, folderId)`.
   */
  delete(id: string, folderId: string): Promise<void>;
}

export interface CreateVariableInput {
  readonly id: string;
  readonly workspaceId: string;
  readonly folderId: string;
  readonly name: string;
  readonly value: string;
  /**
   * Whether `value` is ciphertext. Set by the service, never by the caller —
   * the row must not be able to claim a protection it does not have.
   */
  readonly encrypted: boolean;
}

export interface UpdateVariableInput {
  readonly name?: string;
  readonly value?: string;
}
