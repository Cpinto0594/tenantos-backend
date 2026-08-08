import type { WorkflowVersionSnapshot } from '@domain/workflow/workflow-version.entity';
import type { WorkflowSnapshot } from '@domain/workflow/workflow.entity';
import type { CreatedWorkflow, WorkflowWithCurrentVersion } from '@domain/workflow/workflow.repository.port';

/**
 * The wire shapes for a workflow that carries its versions.
 *
 * In the application layer rather than beside a controller because three
 * transports need them — the workspace routes, the workflow list and the
 * namespace read — and a module importing another feature module's file to get
 * a type is how feature modules stop being separable. Application code may
 * depend on the domain, and every module already depends on application, so
 * this is the one place all three can reach without pointing sideways.
 */

/**
 * A workflow with the version `currentVersionId` names.
 *
 * Null when the workflow has none — rows that predate versions-on-create. Not
 * the newest version: the pointer is what a runner would execute, which is a
 * different row from the latest draft once anything is edited without being
 * published.
 */
export type WorkflowWithCurrentVersionView = WorkflowSnapshot & {
  version: WorkflowVersionSnapshot | null;
};

/**
 * The create response: exactly the one version that was just written.
 *
 * Singular and non-null, unlike the list shape, so a client of `POST` never
 * null-checks or searches an array for a version this API just made.
 */
export type WorkflowWithVersion = WorkflowSnapshot & {
  version: WorkflowVersionSnapshot;
};

export function toWorkflowWithCurrentVersion(
  item: WorkflowWithCurrentVersion,
): WorkflowWithCurrentVersionView {
  return {
    ...item.workflow.toSnapshot(),
    version: item.version?.toSnapshot() ?? null,
  };
}

export function toWorkflowWithVersion(created: CreatedWorkflow): WorkflowWithVersion {
  return {
    ...created.workflow.toSnapshot(),
    version: created.version.toSnapshot(),
  };
}
