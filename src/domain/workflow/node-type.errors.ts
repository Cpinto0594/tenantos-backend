import { NotFoundError } from '@domain/shared/domain-error';
import { ErrorCode } from '@shared/errors/error-code';

/** No node type is registered under that name. */
export class NodeTypeNotFoundError extends NotFoundError {
  readonly code = ErrorCode.NODE_TYPE_NOT_FOUND;

  constructor(name: string) {
    super('Node type not found', { name });
  }
}
