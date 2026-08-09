import { ConflictError, NotFoundError } from '@domain/shared/domain-error';
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

/**
 * The variable does not exist, or it exists in a different folder.
 *
 * Both cases answer the same way, for the same reason FolderNotFoundError
 * does: the caller supplied the id, and telling them "that variable is real,
 * just not in this folder" is a fact worth withholding.
 */
export class VariableNotFoundError extends NotFoundError {
  readonly code = ErrorCode.VARIABLE_NOT_FOUND;

  constructor(variableId: string) {
    super('Variable not found in this folder', { variableId });
  }
}
