import { ConflictError, NotFoundError } from '@domain/shared/domain-error';
import { ErrorCode } from '@shared/errors/error-code';

/**
 * The folder does not exist, or it exists in a different workspace.
 *
 * Both cases answer the same way, for the same reason WorkspaceNotFoundError
 * does: the caller supplied the id, and telling them "that folder is real, just
 * not yours" is a fact worth withholding.
 */
export class FolderNotFoundError extends NotFoundError {
  readonly code = ErrorCode.FOLDER_NOT_FOUND;

  constructor(folderId: string) {
    super('Folder not found in this workspace', { folderId });
  }
}

/** Another folder in this workspace already uses that name — `(workspace_id, name)` is unique. */
export class FolderNameTakenError extends ConflictError {
  readonly code = ErrorCode.FOLDER_NAME_TAKEN;

  constructor(name: string) {
    super('A folder with that name already exists in this workspace', { name });
  }
}

/**
 * Another folder in this workspace already uses that slug —
 * `(workspace_id, slug)` is unique.
 *
 * Distinct from FolderNameTakenError because the two indexes can fail
 * independently: a caller-supplied slug can collide while the name does not.
 */
export class FolderSlugTakenError extends ConflictError {
  readonly code = ErrorCode.FOLDER_SLUG_TAKEN;

  constructor(slug: string) {
    super('A folder with that slug already exists in this workspace', { slug });
  }
}
