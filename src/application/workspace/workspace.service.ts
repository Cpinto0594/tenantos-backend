import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Connection } from '@domain/connection/connection.entity';
import {
  CONNECTION_REPOSITORY,
  type ConnectionRepositoryPort,
  type CreateConnectionInput,
} from '@domain/connection/connection.repository.port';
import type { Folder } from '@domain/folder/folder.entity';
import { FolderNotFoundError } from '@domain/folder/folder.errors';
import { FOLDER_REPOSITORY, type FolderRepositoryPort } from '@domain/folder/folder.repository.port';
import { slugify } from '@domain/shared/slug';
import type { Variable } from '@domain/variable/variable.entity';
import {
  type CreateVariableInput,
  VARIABLE_REPOSITORY,
  type VariableRepositoryPort,
} from '@domain/variable/variable.repository.port';
import {
  type CreatedWorkflow,
  WORKFLOW_REPOSITORY,
  type WorkflowRepositoryPort,
  type WorkflowWithCurrentVersion,
} from '@domain/workflow/workflow.repository.port';
import type { Workspace } from '@domain/workspace/workspace.entity';
import { WorkspaceNotFoundError } from '@domain/workspace/workspace.errors';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepositoryPort,
} from '@domain/workspace/workspace.repository.port';
import { InlineLogger } from '@infrastructure/logging/inline-logger';

/**
 * What createWorkflow needs, independent of how it arrived.
 *
 * Not the HTTP DTO: the application layer taking a class decorated for Swagger
 * and class-validator would make every non-HTTP caller — a seeder, a job —
 * depend on the transport.
 */
export interface CreateWorkflowRequest {
  readonly name: string;
  readonly slug?: string | undefined;
  readonly description?: string | undefined;
  readonly settings?: Record<string, unknown> | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface CreateVariableRequest {
  readonly name: string;
  readonly value: string;
}

export interface CreateCredentialRequest {
  readonly name: string;
  readonly type: string;
  readonly provider: string;
  readonly credentials: Record<string, unknown>;
  readonly metadata?: Record<string, unknown> | undefined;
}

@Injectable()
export class WorkspaceService {
  constructor(
    @Inject(WORKSPACE_REPOSITORY) private readonly repository: WorkspaceRepositoryPort,
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepositoryPort,
    @Inject(WORKFLOW_REPOSITORY) private readonly workflows: WorkflowRepositoryPort,
    @Inject(VARIABLE_REPOSITORY) private readonly variables: VariableRepositoryPort,
    @Inject(CONNECTION_REPOSITORY) private readonly connections: ConnectionRepositoryPort,
    private readonly inline: InlineLogger,
  ) {}

  async listAll(): Promise<Workspace[]> {
    const done = this.inline.start(WorkspaceService.name, 'listAll');
    const items = await this.repository.findAll();
    done({ count: items.length });
    return items;
  }

  async listFolders(workspaceId: string, userId: string): Promise<Folder[]> {
    const done = this.inline.start(WorkspaceService.name, 'listFolders', { workspaceId });
    await this.assertOwned(workspaceId, userId);
    const items = await this.folders.findByWorkspaceIds([workspaceId]);
    done({ count: items.length });
    return items;
  }

  // --- Folder-scoped reads ---------------------------------------------------
  // Workflows, variables and credentials all live in a folder, so all three are
  // read through one. `assertFolder` is the gate on every one of them.

  async listFolderWorkflows(
    workspaceId: string,
    folderId: string,
    userId: string,
  ): Promise<WorkflowWithCurrentVersion[]> {
    const done = this.inline.start(WorkspaceService.name, 'listFolderWorkflows', { folderId });
    await this.assertFolder(workspaceId, folderId, userId);
    const items = await this.workflows.findByFolderId(folderId);
    done({ count: items.length });
    return items;
  }

  async listFolderVariables(workspaceId: string, folderId: string, userId: string): Promise<Variable[]> {
    const done = this.inline.start(WorkspaceService.name, 'listFolderVariables', { folderId });
    await this.assertFolder(workspaceId, folderId, userId);
    const items = await this.variables.findByFolderId(folderId);
    done({ count: items.length });
    return items;
  }

  async listFolderCredentials(workspaceId: string, folderId: string, userId: string): Promise<Connection[]> {
    const done = this.inline.start(WorkspaceService.name, 'listFolderCredentials', { folderId });
    await this.assertFolder(workspaceId, folderId, userId);
    const items = await this.connections.findByFolderId(folderId);
    done({ count: items.length });
    return items;
  }

  // --- Folder-scoped writes --------------------------------------------------

  /**
   * Provisions a workflow inside a folder, together with its version 1.
   *
   * Draft and inactive, and the version is an empty draft too — but it exists,
   * and `currentVersionId` points at it. That makes "a workflow always has a
   * current version" an invariant every reader can rely on instead of a case
   * each one has to handle; the repository does both inserts in one
   * transaction so it cannot be half true.
   */
  async createWorkflow(
    workspaceId: string,
    folderId: string,
    userId: string,
    input: CreateWorkflowRequest,
  ): Promise<CreatedWorkflow> {
    const done = this.inline.start(WorkspaceService.name, 'createWorkflow', { folderId });
    await this.assertFolder(workspaceId, folderId, userId);

    const created = await this.workflows.create({
      // These tables have no default on their primary key, so the ids are ours
      // to mint — including the version's, which the repository needs up front
      // to link the two rows inside one transaction.
      id: randomUUID(),
      initialVersionId: randomUUID(),
      workspaceId,
      folderId,
      name: input.name,
      slug: input.slug ?? slugify(input.name),
      description: input.description ?? null,
      // Attribution, not authorization: the row is reachable through the
      // workspace, so this records who provisioned it, nothing more.
      createdBy: userId,
      settings: input.settings ?? {},
      metadata: input.metadata ?? {},
    });

    done({
      workflowId: created.workflow.id,
      slug: created.workflow.slug,
      versionId: created.version.id,
    });
    return created;
  }

  async createVariable(
    workspaceId: string,
    folderId: string,
    userId: string,
    input: CreateVariableRequest,
  ): Promise<Variable> {
    const done = this.inline.start(WorkspaceService.name, 'createVariable', { folderId });
    await this.assertFolder(workspaceId, folderId, userId);

    const create: CreateVariableInput = {
      id: randomUUID(),
      workspaceId,
      folderId,
      name: input.name,
      value: input.value,
      // Stored as supplied. `false` is the honest answer while there is no
      // encryption service in this codebase — see the note on createCredential.
      encrypted: false,
    };

    const variable = await this.variables.create(create);
    done({ variableId: variable.id });
    return variable;
  }

  /**
   * Provisions a credential (a `connections` row) inside a folder.
   *
   * **`encrypted` is written as `false`, not the column default of `true`.**
   * Nothing in this codebase encrypts the payload — `infrastructure/security`
   * holds password hashers and the JWT service, and no cipher. Taking the
   * default would produce a row asserting a protection it does not have, and an
   * operator reading `encrypted: true` would reasonably stop worrying about the
   * column. Until a key-managed cipher exists, the flag tells the truth and the
   * secret sits in plaintext jsonb.
   */
  async createCredential(
    workspaceId: string,
    folderId: string,
    userId: string,
    input: CreateCredentialRequest,
  ): Promise<Connection> {
    const done = this.inline.start(WorkspaceService.name, 'createCredential', { folderId });
    await this.assertFolder(workspaceId, folderId, userId);

    const create: CreateConnectionInput = {
      id: randomUUID(),
      workspaceId,
      folderId,
      name: input.name,
      type: input.type,
      provider: input.provider,
      credentials: input.credentials,
      encrypted: false,
      metadata: input.metadata ?? {},
    };

    const connection = await this.connections.create(create);
    // Deliberately no credential fields in the trace line.
    done({ credentialId: connection.id });
    return connection;
  }

  /**
   * Resolves a folder within a workspace the caller owns.
   *
   * Both halves matter. `assertOwned` stops a caller reaching another user's
   * workspace at all; the second check stops them naming a folder that exists
   * but sits in a *different* workspace — the foreign keys alone permit that,
   * and without it `/workspaces/{mine}/folders/{theirs}/credentials` would read
   * someone else's rows.
   */
  private async assertFolder(workspaceId: string, folderId: string, userId: string): Promise<void> {
    await this.assertOwned(workspaceId, userId);

    const folder = await this.folders.findById(folderId);
    if (!folder || folder.workspaceId !== workspaceId) {
      throw new FolderNotFoundError(folderId);
    }
  }

  /**
   * The authorization boundary for every workspace-scoped read above.
   *
   * `workspaceId` arrives from the client, and folders, workflows, variables and
   * connections have no owner column of their own — the workspace they hang off
   * is the only thing that makes them anyone's. So this check is not a nicety:
   * without it, any authenticated user could read any other user's credentials
   * by guessing a uuid.
   *
   * It costs one indexed read per request. Caching it would be premature and
   * would need invalidating the moment ownership changes.
   */
  private async assertOwned(workspaceId: string, userId: string): Promise<void> {
    const workspace = await this.repository.findById(workspaceId);
    // Same error for missing and not-yours — see WorkspaceNotFoundError.
    if (!workspace || workspace.userId !== userId) {
      throw new WorkspaceNotFoundError(workspaceId);
    }
  }
}
