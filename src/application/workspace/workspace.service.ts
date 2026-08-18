import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Connection } from '@domain/connection/connection.entity';
import {
  CONNECTION_REPOSITORY,
  type ConnectionRepositoryPort,
  type CreateConnectionInput,
  type UpdateConnectionInput,
} from '@domain/connection/connection.repository.port';
import type { Folder } from '@domain/folder/folder.entity';
import { FolderNotFoundError } from '@domain/folder/folder.errors';
import {
  type CreateFolderInput,
  FOLDER_REPOSITORY,
  type FolderRepositoryPort,
} from '@domain/folder/folder.repository.port';
import { slugify } from '@domain/shared/slug';
import type { Variable } from '@domain/variable/variable.entity';
import {
  type CreateVariableInput,
  type UpdateVariableInput,
  VARIABLE_REPOSITORY,
  type VariableRepositoryPort,
} from '@domain/variable/variable.repository.port';
import {
  type UpdateWorkflowInput,
  WORKFLOW_REPOSITORY,
  type WorkflowRepositoryPort,
} from '@domain/workflow/workflow.repository.port';
import type { Workspace } from '@domain/workspace/workspace.entity';
import { WorkspaceNotFoundError } from '@domain/workspace/workspace.errors';
import {
  type CreateWorkspaceInput,
  WORKSPACE_REPOSITORY,
  type WorkspaceRepositoryPort,
} from '@domain/workspace/workspace.repository.port';
import { InlineLogger } from '@infrastructure/logging/inline-logger';
import { Workflow } from '@domain/workflow/workflow.entity';

export interface NamespacesResourcesCounts {
  workspaceId: string;
  workflows: number;
  variables: number;
  credentials: number;
  folders: number;
}

export interface FolderResourcesCounts {
  folderId: string;
  workflows: number;
  variables: number;
  credentials: number;
}

/**
 * What createWorkspace needs, independent of how it arrived — same rationale
 * as CreateWorkflowRequest below.
 */
export interface CreateWorkspaceRequest {
  readonly name: string;
  readonly slug?: string | undefined;
  readonly description?: string | undefined;
  readonly settings?: Record<string, unknown> | undefined;
}

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

export interface UpdateWorkflowRequest {
  readonly name?: string | undefined;
  readonly slug?: string | undefined;
  readonly description?: string | undefined;
  readonly settings?: Record<string, unknown> | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface CreateFolderRequest {
  readonly name: string;
  readonly slug?: string | undefined;
  readonly description?: string | undefined;
}

export interface CreateVariableRequest {
  readonly name: string;
  readonly value: string;
}

export interface UpdateVariableRequest {
  readonly name: string;
  readonly value: string;
}

export interface CreateCredentialRequest {
  readonly name: string;
  readonly type: string;
  readonly provider: string;
  readonly credentials: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
}

export interface UpdateCredentialRequest {
  readonly name?: string;
  readonly type?: string;
  readonly provider?: string;
  readonly credentials: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
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

  async namespacesResourcesCounts(workspaceIds: string[]): Promise<NamespacesResourcesCounts[]> {
    const workflows = await this.workflows.countByWorkspaceIds(workspaceIds);
    const variables = await this.variables.countByWorkspaceIds(workspaceIds);
    const credentials = await this.connections.countByWorkspaceIds(workspaceIds);
    const folders = await this.folders.countByWorkspaceIds(workspaceIds);
    return workspaceIds.map((id) => ({
      workspaceId: id,
      workflows: workflows.find((w) => w.workspaceId === id)?.count ?? 0,
      variables: variables.find((v) => v.workspaceId === id)?.count ?? 0,
      credentials: credentials.find((c) => c.workspaceId === id)?.count ?? 0,
      folders: folders.find((f) => f.workspaceId === id)?.count ?? 0,
    }));
  }

  async folderResourcesCounts(folderIds: string[]): Promise<FolderResourcesCounts[]> {
    const workflows = await this.workflows.countByFolderIds(folderIds);
    const variables = await this.variables.countByFolderIds(folderIds);
    const credentials = await this.connections.countByFolderIds(folderIds);
    return folderIds.map((id) => ({
      folderId: id,
      workflows: workflows.find((w) => w.folderId === id)?.count ?? 0,
      variables: variables.find((v) => v.folderId === id)?.count ?? 0,
      credentials: credentials.find((c) => c.folderId === id)?.count ?? 0,
    }));
  }

  /**
   * Provisions a workspace for the caller.
   *
   * Unscoped by design — a workspace is the top of this hierarchy, so there is
   * no parent to check ownership against. `userId` comes from the access
   * token, not the request body, so a caller can only ever create one for
   * themself.
   */
  async createWorkspace(userId: string, input: CreateWorkspaceRequest): Promise<Workspace> {
    const done = this.inline.start(WorkspaceService.name, 'createWorkspace');

    const create: CreateWorkspaceInput = {
      // Neither table has a default on its primary key, so both ids are ours
      // to mint — including the folder's, which the repository needs up
      // front to insert it alongside the workspace in one transaction.
      id: randomUUID(),
      userId,
      name: input.name,
      slug: input.slug ?? slugify(input.name),
      description: input.description ?? null,
      settings: input.settings ?? {},
      defaultFolderId: randomUUID(),
    };

    const workspace = await this.repository.create(create);
    done({ workspaceId: workspace.id, slug: workspace.slug });
    return workspace;
  }

  async getWorkspace(workspaceId: string, userId: string): Promise<Workspace> {
    const done = this.inline.start(WorkspaceService.name, 'getWorkspace', { workspaceId });
    const workspace = await this.findOwned(workspaceId, userId);
    done({ workspaceId: workspace.id });
    return workspace;
  }

  async listFolders(workspaceId: string, userId: string): Promise<Folder[]> {
    const done = this.inline.start(WorkspaceService.name, 'listFolders', { workspaceId });
    await this.assertOwned(workspaceId, userId);
    const items = await this.folders.findByWorkspaceIds([workspaceId]);
    done({ count: items.length });
    return items;
  }

  /**
   * The workspace's default folder — the one createWorkspace provisions
   * alongside every workspace row.
   *
   * Not found is still possible: a workspace created before that invariant
   * existed has none. FolderNotFoundError takes `workspaceId` here since
   * there is no folder id to report — the lookup is by workspace, not id.
   */
  async getDefaultFolder(workspaceId: string, userId: string): Promise<Folder> {
    const done = this.inline.start(WorkspaceService.name, 'getDefaultFolder', { workspaceId });
    await this.assertOwned(workspaceId, userId);
    const folder = await this.folders.findByWorkspaceIdAndDefault(workspaceId);
    if (!folder) throw new FolderNotFoundError(workspaceId);
    done({ folderId: folder.id });
    return folder;
  }

  /**
   * Creates a folder in a workspace. Never the default one — that only
   * happens once, alongside the workspace itself, in createWorkspace.
   */
  async createFolder(workspaceId: string, userId: string, input: CreateFolderRequest): Promise<Folder> {
    const done = this.inline.start(WorkspaceService.name, 'createFolder', { workspaceId });
    await this.assertOwned(workspaceId, userId);

    const create: CreateFolderInput = {
      id: randomUUID(),
      workspaceId,
      name: input.name,
      slug: input.slug ?? slugify(input.name),
      description: input.description ?? null,
    };

    const folder = await this.folders.create(create);
    done({ folderId: folder.id, slug: folder.slug });
    return folder;
  }

  // --- Folder-scoped reads ---------------------------------------------------
  // Workflows, variables and credentials all live in a folder, so all three are
  // read through one. `assertFolder` is the gate on every one of them.

  async listFolderWorkflows(workspaceId: string, folderId: string, userId: string): Promise<Workflow[]> {
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
  ): Promise<Workflow> {
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
      workflowId: created.id,
      slug: created.slug,
      versionId: created.currentVersionId,
    });
    return created;
  }

  async updateWorkflow(
    workspaceId: string,
    folderId: string,
    workflowId: string,
    userId: string,
    input: UpdateWorkflowRequest,
  ): Promise<Workflow> {
    const done = this.inline.start(WorkspaceService.name, 'updateWorkflow', { folderId, workflowId });
    await this.assertFolder(workspaceId, folderId, userId);

    const update: UpdateWorkflowInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.settings !== undefined ? { settings: input.settings } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };

    const workflow = await this.workflows.update(workflowId, folderId, update);
    done({ workflowId: workflow.id, slug: workflow.slug });
    return workflow;
  }

  async deleteWorkflow(
    workspaceId: string,
    folderId: string,
    workflowId: string,
    userId: string,
  ): Promise<void> {
    const done = this.inline.start(WorkspaceService.name, 'deleteWorkflow', { folderId, workflowId });
    await this.assertFolder(workspaceId, folderId, userId);
    await this.workflows.delete(workflowId, folderId);
    done({ workflowId });
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

  async updateVariable(
    workspaceId: string,
    folderId: string,
    variableId: string,
    userId: string,
    input: UpdateVariableRequest,
  ): Promise<Variable> {
    const done = this.inline.start(WorkspaceService.name, 'updateVariable', { folderId, variableId });
    await this.assertFolder(workspaceId, folderId, userId);

    const update: UpdateVariableInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.value !== undefined ? { metadata: input.value } : {}),
    };

    const variable = await this.variables.update(variableId, folderId, update);
    done({ variableId: variable.id });
    return variable;
  }

  async deleteVariable(
    workspaceId: string,
    folderId: string,
    variableId: string,
    userId: string,
  ): Promise<void> {
    const done = this.inline.start(WorkspaceService.name, 'deleteVariable', { folderId, variableId });
    await this.assertFolder(workspaceId, folderId, userId);
    await this.variables.delete(variableId, folderId);
    done({ variableId });
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
   * Updates a credential (a `connections` row) inside a folder.
   *
   * Same plaintext caveat as createCredential: this codebase has no cipher, so
   * `credentials`, when supplied, is written as-is rather than re-encrypted.
   */
  async updateCredential(
    workspaceId: string,
    folderId: string,
    credentialId: string,
    userId: string,
    input: UpdateCredentialRequest,
  ): Promise<Connection> {
    const done = this.inline.start(WorkspaceService.name, 'updateCredential', { folderId, credentialId });
    await this.assertFolder(workspaceId, folderId, userId);

    const update: UpdateConnectionInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.provider !== undefined ? { provider: input.provider } : {}),
      ...(input.credentials !== undefined ? { credentials: input.credentials } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };

    const connection = await this.connections.update(credentialId, folderId, update);
    // Deliberately no credential fields in the trace line.
    done({ credentialId: connection.id });
    return connection;
  }

  async deleteCredential(
    workspaceId: string,
    folderId: string,
    credentialId: string,
    userId: string,
  ): Promise<void> {
    const done = this.inline.start(WorkspaceService.name, 'deleteCredential', { folderId, credentialId });
    await this.assertFolder(workspaceId, folderId, userId);
    await this.connections.delete(credentialId, folderId);
    done({ credentialId });
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
    await this.findOwned(workspaceId, userId);
  }

  /** Same check as assertOwned, but returns the row instead of discarding it. */
  private async findOwned(workspaceId: string, userId: string): Promise<Workspace> {
    const workspace = await this.repository.findById(workspaceId);
    // Same error for missing and not-yours — see WorkspaceNotFoundError.
    if (!workspace || workspace.userId !== userId) {
      throw new WorkspaceNotFoundError(workspaceId);
    }
    return workspace;
  }
}
