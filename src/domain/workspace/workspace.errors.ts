import { ConflictError, NotFoundError } from '@domain/shared/domain-error';
import { ErrorCode } from '@shared/errors/error-code';

/**
 * The workspace does not exist, or it does but belongs to someone else.
 *
 * One error for both cases on purpose. A workspace id is a bearer-ish handle:
 * distinguishing "no such workspace" (404) from "not yours" (403) tells an
 * attacker holding a guessed id that it is real, which is exactly the fact worth
 * keeping from them. The id is echoed back because the caller already sent it.
 */
export class WorkspaceNotFoundError extends NotFoundError {
  readonly code = ErrorCode.WORKSPACE_NOT_FOUND;

  constructor(workspaceId: string) {
    super('Workspace not found', { workspaceId });
  }
}

/**
 * Another workspace owned by this user already uses that slug.
 *
 * Per-user, not global, because the unique index is `(user_id, slug)` — two
 * different users can each have a `my-project` workspace.
 */
export class WorkspaceSlugTakenError extends ConflictError {
  readonly code = ErrorCode.WORKSPACE_SLUG_TAKEN;

  constructor(slug: string) {
    super('A workspace with that slug already exists for this user', { slug });
  }
}
