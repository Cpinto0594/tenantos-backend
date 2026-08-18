import { type Workflow } from './workflow.entity';

/** Injection token. Symbols cannot collide the way string tokens can. */
export const WORKFLOW_REPOSITORY = Symbol('WorkflowRepository');

export interface WorkspaceWorkflowsCounts {
  workspaceId: string;
  count: number;
}

export interface FolderWorkflowsCounts {
  folderId: string;
  count: number;
}

/**
 * The columns a caller supplies when creating a workflow.
 *
 * `status`, `active` and `currentVersionId` are absent on purpose: they are
 * lifecycle state the database defaults (`draft`, `false`, null) and nothing
 * about a brand-new workflow should be able to set them. `id` is supplied by
 * the caller rather than the database because the `workflows` table has no
 * default on its primary key.
 */
export interface CreateWorkflowInput {
  readonly id: string;
  /**
   * Id for the version-1 row created alongside the workflow.
   *
   * Minted by the caller rather than the repository so that all id generation
   * stays in one layer, and so the workflow's `currentVersionId` can be written
   * in the same insert instead of needing a follow-up update.
   */
  readonly initialVersionId: string;
  readonly workspaceId: string;
  /**
   * Required, even though the column is nullable. Every create path is
   * folder-scoped, so a workflow with no folder can only arrive from data that
   * predates that — not from this API.
   */
  readonly folderId: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly createdBy: string | null;
  readonly settings: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
}

export interface UpdateWorkflowInput {
  readonly name?: string;
  readonly slug?: string;
  readonly description?: string | null;
  readonly settings?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Both rows a create produces.
 *
 * Returned together rather than leaving the caller to look the version up by
 * `workflow.currentVersionId`: it was just written inside the transaction, so
 * re-reading it would be a second round trip for a row we already have — and
 * one that could, between the two statements, come back as something else.
 */

export interface WorkflowRepositoryPort {
  /**
   * Every row, unpaginated and unfiltered.
   *
   * Fine while these tables are small; it is a table scan that grows without
   * bound, so this needs the same offset/keyset treatment as UserRepositoryPort
   * before anything real depends on it.
   */
  findAll(): Promise<Workflow[]>;

  countByWorkspaceIds(workspaceIds: readonly string[]): Promise<WorkspaceWorkflowsCounts[]>;

  countByFolderIds(folderIds: readonly string[]): Promise<FolderWorkflowsCounts[]>;

  /**
   * Every workflow inside the given workspaces.
   *
   * Takes a list rather than a single id so a caller reading a whole namespace
   * does it in one round trip instead of one per workspace. An empty list means
   * an empty result, not "no filter" — the difference is a data leak.
   */
  findByWorkspaceIds(workspaceIds: readonly string[]): Promise<Workflow[]>;

  /** Every workflow filed in one folder, newest first, each with its current version. */
  findByFolderId(folderId: string): Promise<Workflow[]>;

  /**
   * Inserts a workflow *and* its version-1 row, atomically.
   *
   * The two are one operation, not two: a workflow whose `currentVersionId`
   * points at a row that was never inserted — or a version orphaned by a
   * workflow insert that rolled back — is a state no reader knows how to
   * handle, so the transaction is what makes "a workflow always has a version"
   * true rather than merely usual.
   *
   * Throws WorkflowSlugTakenError when `[workspaceId, slug]` is already taken.
   * That check belongs here rather than in a preceding `existsBySlug` call: two
   * concurrent creates both pass such a check, and only the unique index
   * actually arbitrates.
   */
  create(input: CreateWorkflowInput): Promise<Workflow>;

  /**
   * Updates a workflow scoped to the folder it must belong to.
   *
   * Throws WorkflowNotFoundError when no row matches `(id, folderId)`, and
   * WorkflowSlugTakenError on the `(workspace_id, slug)` unique index.
   */
  update(id: string, folderId: string, input: UpdateWorkflowInput): Promise<Workflow>;

  /**
   * Deletes a workflow scoped to the folder it must belong to.
   *
   * Throws WorkflowNotFoundError when no row matches `(id, folderId)`.
   */
  delete(id: string, folderId: string): Promise<void>;
}
