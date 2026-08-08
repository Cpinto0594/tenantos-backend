import { Injectable } from '@nestjs/common';
import type {
  Prisma,
  Workflow as PrismaWorkflow,
  WorkflowVersion as PrismaWorkflowVersion,
} from '@prisma/client';
import { WorkflowSlugTakenError } from '@domain/workflow/workflow.errors';
import type {
  CreatedWorkflow,
  CreateWorkflowInput,
  WorkflowRepositoryPort,
  WorkflowWithCurrentVersion,
} from '@domain/workflow/workflow.repository.port';
import { PrismaService } from '../prisma.service';
import { toWorkflowEntity, toWorkflowVersionEntity } from '../workflow-resource.mappers';
import { isUniqueViolation, toInfrastructureError } from '../prisma-error';

/** A workflow row as the queries below select it: with its current version joined. */
type WorkflowRowWithCurrentVersion = PrismaWorkflow & { currentVersion: PrismaWorkflowVersion | null };

function toEntities(row: WorkflowRowWithCurrentVersion): WorkflowWithCurrentVersion {
  return {
    workflow: toWorkflowEntity(row),
    version: row.currentVersion ? toWorkflowVersionEntity(row.currentVersion) : null,
  };
}

@Injectable()
export class PrismaWorkflowRepository implements WorkflowRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  /**
   * Every read on this repository joins the current version.
   *
   * `currentVersion` is a declared relation on `current_version_id`, so this is
   * a join Prisma resolves for the whole page — not the `versions` history
   * relation, which would return every revision and leave the caller to find
   * the current one.
   */
  private static readonly WITH_CURRENT_VERSION = {
    currentVersion: true,
  } as const satisfies Prisma.WorkflowInclude;

  async findAll(): Promise<WorkflowWithCurrentVersion[]> {
    try {
      const rows = await this.db.workflow.findMany({
        orderBy: { createdAt: 'desc' },
        include: PrismaWorkflowRepository.WITH_CURRENT_VERSION,
      });
      return rows.map(toEntities);
    } catch (error) {
      throw toInfrastructureError(error, 'workflow.findAll');
    }
  }

  async findByWorkspaceIds(workspaceIds: readonly string[]): Promise<WorkflowWithCurrentVersion[]> {
    // `IN ()` is not valid SQL and Prisma turns an empty `in` into a query that
    // matches nothing anyway — returning early skips a pointless round trip.
    if (workspaceIds.length === 0) return [];

    try {
      const rows = await this.db.workflow.findMany({
        where: { workspaceId: { in: [...workspaceIds] } },
        orderBy: { createdAt: 'desc' },
        include: PrismaWorkflowRepository.WITH_CURRENT_VERSION,
      });
      return rows.map(toEntities);
    } catch (error) {
      throw toInfrastructureError(error, 'workflow.findByWorkspaceIds');
    }
  }

  async findByFolderId(folderId: string): Promise<WorkflowWithCurrentVersion[]> {
    try {
      const rows = await this.db.workflow.findMany({
        where: { folderId },
        orderBy: { createdAt: 'desc' },
        include: PrismaWorkflowRepository.WITH_CURRENT_VERSION,
      });
      return rows.map(toEntities);
    } catch (error) {
      throw toInfrastructureError(error, 'workflow.findByFolderId');
    }
  }

  async create(input: CreateWorkflowInput): Promise<CreatedWorkflow> {
    try {
      return await this.prisma.runInTransaction(async () => {
        const row = await this.db.workflow.create({
          data: {
            id: input.id,
            workspaceId: input.workspaceId,
            folderId: input.folderId,
            name: input.name,
            slug: input.slug,
            description: input.description,
            createdBy: input.createdBy,
            settings: input.settings as Prisma.InputJsonValue,
            metadata: input.metadata as Prisma.InputJsonValue,
            active: true,
            // `currentVersionId` is deliberately *not* set here. It is now a
            // real foreign key to workflow_versions, and the version below does
            // not exist yet — writing it in this insert violates the
            // constraint. The update after the version insert is what points it,
            // and the transaction keeps the two from being observable apart.
            // `status` is left to the column default.
          },
        });

        const versionRow = await this.db.workflowVersion.create({
          data: {
            id: input.initialVersionId,
            workflowId: row.id,
            version: 1,
            createdBy: input.createdBy,
            // status (`draft`), workflowJson (`{}`) and createdAt take their
            // column defaults. `changeSummary` and `publishedAt` stay null: the
            // version number already says this is the first one, and nothing
            // has been published.
          },
        });
        const withVersion = await this.db.workflow.update({
          where: { id: row.id },
          data: { currentVersionId: input.initialVersionId },
        });

        // The updated row, not the one from the insert — that one still has a
        // null currentVersionId, and returning it would contradict the database.
        return {
          workflow: toWorkflowEntity(withVersion),
          version: toWorkflowVersionEntity(versionRow),
        };
      });
    } catch (error) {
      // The check-then-insert race is real and this is the half that closes it:
      // two concurrent creates of the same name both pass any prior lookup, and
      // only the unique index arbitrates.
      if (isUniqueViolation(error, 'slug')) throw new WorkflowSlugTakenError(input.slug);
      throw toInfrastructureError(error, 'workflow.create');
    }
  }
}
