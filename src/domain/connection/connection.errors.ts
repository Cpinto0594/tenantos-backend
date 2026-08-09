import { ConflictError, NotFoundError } from '@domain/shared/domain-error';
import { ErrorCode } from '@shared/errors/error-code';

/**
 * Another credential in this *workspace* already uses that name.
 *
 * Workspace-wide rather than per-folder because the unique index is
 * `(workspace_id, name)`. Filing the new one in a different folder does not
 * make the name available.
 */
export class CredentialNameTakenError extends ConflictError {
  readonly code = ErrorCode.CREDENTIAL_NAME_TAKEN;

  constructor(name: string) {
    super('A credential with that name already exists in this workspace', { name });
  }
}

/**
 * The credential does not exist, or it exists in a different folder.
 *
 * Both cases answer the same way, for the same reason FolderNotFoundError
 * does: the caller supplied the id, and telling them "that credential is
 * real, just not in this folder" is a fact worth withholding.
 */
export class CredentialNotFoundError extends NotFoundError {
  readonly code = ErrorCode.CREDENTIAL_NOT_FOUND;

  constructor(credentialId: string) {
    super('Credential not found in this folder', { credentialId });
  }
}
