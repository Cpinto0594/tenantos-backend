import { ConflictError } from '@domain/shared/domain-error';
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
