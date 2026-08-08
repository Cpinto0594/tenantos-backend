import { ConflictError } from '@domain/shared/domain-error';
import { ErrorCode } from '@shared/errors/error-code';

/**
 * Another variable in this *workspace* already uses that name.
 *
 * Workspace, not folder: the unique index is `(workspace_id, name)`, so moving
 * to a different folder does not free the name up. That is deliberate — a
 * workflow resolves `{{ $vars.API_URL }}` against the workspace, so two folders
 * holding different values under one name would make resolution ambiguous.
 */
export class VariableNameTakenError extends ConflictError {
  readonly code = ErrorCode.VARIABLE_NAME_TAKEN;

  constructor(name: string) {
    super('A variable with that name already exists in this workspace', { name });
  }
}
