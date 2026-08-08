import type { Folder, FolderSnapshot } from '@domain/folder/folder.entity';
import type { WorkflowWithCurrentVersion } from '@domain/workflow/workflow.repository.port';
import type { WorkflowWithCurrentVersionView } from '@application/workflow/workflow.views';
import type { Workspace, WorkspaceSnapshot } from '@domain/workspace/workspace.entity';

/**
 * Everything a user owns, in one read.
 *
 * Three flat lists rather than a nested tree: a folder carries its
 * `workspaceId` and a workflow carries both `workspaceId` and `folderId`, so a
 * client can assemble whatever shape it needs without the server picking one
 * for it — and a workflow that sits directly in a workspace (`folderId: null`)
 * needs no special case in the payload.
 */
export interface Namespace {
  readonly defaultWorkspace: Workspace | null;
  readonly defaultFolder: Folder | null;
  readonly workspaces: Workspace[];
  readonly folders: Folder[];
  readonly workflows: WorkflowWithCurrentVersion[];
}

/** The wire form of {@link Namespace}. */
export interface NamespaceSnapshot {
  readonly defaultWorkspace: WorkspaceSnapshot | null;
  readonly defaultFolder: FolderSnapshot | null;
  readonly workspaces: WorkspaceSnapshot[];
  readonly folders: FolderSnapshot[];
  readonly workflows: WorkflowWithCurrentVersionView[];
}
