import { NotFoundError } from '@domain/shared/domain-error';
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
