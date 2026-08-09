import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { WorkflowNotFoundError, WorkflowSlugTakenError } from '@domain/workflow/workflow.errors';
import type {
  CreateWorkflowInput,
  UpdateWorkflowInput,
  WorkflowRepositoryPort,
} from '@domain/workflow/workflow.repository.port';
import { PrismaService } from '../prisma.service';
import { isRecordNotFound, isUniqueViolation, toInfrastructureError } from '../prisma-error';
import { Workflow } from '@domain/workflow/workflow.entity';
import { toWorkflowWithRelationsEntity } from './mappers/workflow.mappers';
import { WITH_CURRENT_VERSION } from '@application/workflow/workflow.views';

@Injectable()
export class PrismaWorkflowRepository implements WorkflowRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async findAll(): Promise<Workflow[]> {
    try {
      const rows = await this.db.workflow.findMany({
        orderBy: { createdAt: 'desc' },
        include: WITH_CURRENT_VERSION,
      });
      return rows.map(toWorkflowWithRelationsEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'workflow.findAll');
    }
  }

  async findByWorkspaceIds(workspaceIds: readonly string[]): Promise<Workflow[]> {
    // `IN ()` is not valid SQL and Prisma turns an empty `in` into a query that
    // matches nothing anyway — returning early skips a pointless round trip.
    if (workspaceIds.length === 0) return [];

    try {
      const rows = await this.db.workflow.findMany({
        where: { workspaceId: { in: [...workspaceIds] } },
        orderBy: { createdAt: 'desc' },
        include: WITH_CURRENT_VERSION,
      });
      return rows.map(toWorkflowWithRelationsEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'workflow.findByWorkspaceIds');
    }
  }

  async findByFolderId(folderId: string): Promise<Workflow[]> {
    try {
      const rows = await this.db.workflow.findMany({
        where: { folderId },
        orderBy: { createdAt: 'desc' },
        include: WITH_CURRENT_VERSION,
      });
      return rows.map(toWorkflowWithRelationsEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'workflow.findByFolderId');
    }
  }

  async create(input: CreateWorkflowInput): Promise<Workflow> {
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
        await this.db.workflow.update({
          where: { id: row.id },
          data: { currentVersionId: input.initialVersionId },
        });

        // The updated row, not the one from the insert — that one still has a
        // null currentVersionId, and returning it would contradict the database.
        return toWorkflowWithRelationsEntity({
          ...row,
          version: versionRow,
        });
      });
    } catch (error) {
      // The check-then-insert race is real and this is the half that closes it:
      // two concurrent creates of the same name both pass any prior lookup, and
      // only the unique index arbitrates.
      if (isUniqueViolation(error, 'slug')) throw new WorkflowSlugTakenError(input.slug);
      throw toInfrastructureError(error, 'workflow.create');
    }
  }

  async update(id: string, folderId: string, input: UpdateWorkflowInput): Promise<Workflow> {
    try {
      const row = await this.db.workflow.update({
        // `folderId` alongside the unique `id` scopes the write to the
        // caller's folder without a separate existence check — a row in
        // another folder simply does not match and P2025 fires below.
        where: { id, folderId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.settings !== undefined ? { settings: input.settings as Prisma.InputJsonValue } : {}),
          ...(input.metadata !== undefined ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
        },
        include: WITH_CURRENT_VERSION,
      });
      return toWorkflowWithRelationsEntity(row);
    } catch (error) {
      if (isRecordNotFound(error)) throw new WorkflowNotFoundError(id);
      if (isUniqueViolation(error, 'slug') && input.slug) throw new WorkflowSlugTakenError(input.slug);
      throw toInfrastructureError(error, 'workflow.update');
    }
  }

  async delete(id: string, folderId: string): Promise<void> {
    try {
      await this.db.workflow.delete({ where: { id, folderId } });
    } catch (error) {
      if (isRecordNotFound(error)) throw new WorkflowNotFoundError(id);
      throw toInfrastructureError(error, 'workflow.delete');
    }
  }
}
