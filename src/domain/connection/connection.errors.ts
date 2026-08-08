import { ConflictError } from '@domain/shared/domain-error';
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
