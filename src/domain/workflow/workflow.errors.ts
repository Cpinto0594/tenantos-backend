import { ConflictError, NotFoundError } from '@domain/shared/domain-error';
import { ErrorCode } from '@shared/errors/error-code';

/**
 * Another workflow in this workspace already owns that slug.
 *
 * Surfaced rather than silently suffixed (`my-flow-2`): the slug is part of the
 * workflow's addressable identity, and a caller that asked for one and quietly
 * got another has no way to know which url it now holds. The `slug` in
 * `details` is what the caller needs to pick a different name.
 */
export class WorkflowSlugTakenError extends ConflictError {
  readonly code = ErrorCode.WORKFLOW_SLUG_TAKEN;

  constructor(slug: string) {
    super('A workflow with that name already exists in this workspace', { slug });
  }
}

/**
 * The workflow does not exist, or it exists in a different folder.
 *
 * Both cases answer the same way, for the same reason FolderNotFoundError
 * does: the caller supplied the id, and telling them "that workflow is real,
 * just not in this folder" is a fact worth withholding.
 */
export class WorkflowNotFoundError extends NotFoundError {
  readonly code = ErrorCode.WORKFLOW_NOT_FOUND;

  constructor(workflowId: string) {
    super('Workflow not found in this folder', { workflowId });
  }
}
