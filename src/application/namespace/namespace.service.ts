import { Inject, Injectable } from '@nestjs/common';
import { FOLDER_REPOSITORY, type FolderRepositoryPort } from '@domain/folder/folder.repository.port';
import { WORKFLOW_REPOSITORY, type WorkflowRepositoryPort } from '@domain/workflow/workflow.repository.port';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepositoryPort,
} from '@domain/workspace/workspace.repository.port';
import { InlineLogger } from '@infrastructure/logging/inline-logger';
import type { Namespace } from './namespace.types';

@Injectable()
export class NamespaceService {
  constructor(
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepositoryPort,
    @Inject(FOLDER_REPOSITORY) private readonly folders: FolderRepositoryPort,
    @Inject(WORKFLOW_REPOSITORY) private readonly workflows: WorkflowRepositoryPort,
    private readonly inline: InlineLogger,
  ) {}

  /**
   * Everything one user owns.
   *
   * The workspaces are read first because they are what defines the scope:
   * folders and workflows have no owner column of their own, so the only thing
   * making them this user's is the workspace they hang off. Deriving the id
   * list from rows already filtered by `userId` is what keeps the two follow-up
   * queries from having to be trusted separately.
   */
  async getForUser(userId: string): Promise<Namespace> {
    const done = this.inline.start(NamespaceService.name, 'getForUser', { userId });

    const defaultWorkspace = await this.workspaces.findByUserIdAndDefault(userId);
    if (!defaultWorkspace) {
      done({ workspaces: 0, folders: 0, workflows: 0 });
      return { workspaces: [], folders: [], workflows: [], defaultWorkspace: null, defaultFolder: null };
    }

    const defaultFolder = await this.folders.findByWorkspaceIdAndDefault(defaultWorkspace.id);
    const workspaces = await this.workspaces.findByUserId(userId);
    const workspaceIds = workspaces.map((workspace) => workspace.id);

    // Independent of each other and both already scoped — no reason to await
    // them in sequence. Each returns [] for an empty id list, so a user with no
    // workspaces costs one query in total.
    const [folders, workflows] = await Promise.all([
      this.folders.findByWorkspaceIds(workspaceIds),
      this.workflows.findByWorkspaceIds(workspaceIds),
    ]);

    done({
      workspaces: workspaces.length,
      folders: folders.length,
      workflows: workflows.length,
    });

    return { workspaces, folders, workflows, defaultWorkspace, defaultFolder };
  }
}
