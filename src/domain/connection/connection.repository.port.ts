import type { Connection } from './connection.entity';

/** Injection token. Symbols cannot collide the way string tokens can. */
export const CONNECTION_REPOSITORY = Symbol('ConnectionRepository');

export interface ConnectionRepositoryPort {
  /**
   * Every row, unpaginated and unfiltered.
   *
   * Fine while these tables are small; it is a table scan that grows without
   * bound, so this needs the same offset/keyset treatment as UserRepositoryPort
   * before anything real depends on it.
   */
  findAll(): Promise<Connection[]>;

  /** Every connection in one workspace, newest first. */
  findByWorkspaceId(workspaceId: string): Promise<Connection[]>;

  /** Every connection in one folder, newest first. */
  findByFolderId(folderId: string): Promise<Connection[]>;

  /**
   * Inserts a connection.
   *
   * Throws CredentialNameTakenError on the `(workspace_id, name)` unique index.
   */
  create(input: CreateConnectionInput): Promise<Connection>;
}

export interface CreateConnectionInput {
  readonly id: string;
  readonly workspaceId: string;
  readonly folderId: string;
  readonly name: string;
  readonly type: string;
  readonly provider: string;
  readonly credentials: Record<string, unknown>;
  /**
   * Whether `credentials` is ciphertext. Set by the service, never by the
   * caller — see CreateVariableInput.encrypted.
   */
  readonly encrypted: boolean;
  readonly metadata: Record<string, unknown>;
}
