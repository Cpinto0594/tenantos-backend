import { Injectable } from '@nestjs/common';
import type { Variable } from '@domain/variable/variable.entity';
import { VariableNameTakenError, VariableNotFoundError } from '@domain/variable/variable.errors';
import type {
  CreateVariableInput,
  FolderVariablesCounts,
  UpdateVariableInput,
  VariableRepositoryPort,
  WorkspaceVariablesCounts,
} from '@domain/variable/variable.repository.port';
import { PrismaService } from '../prisma.service';
import { isRecordNotFound, isUniqueViolation, toInfrastructureError } from '../prisma-error';
import { toVariableEntity } from './mappers/variables.mappers';

@Injectable()
export class PrismaVariableRepository implements VariableRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async findAll(): Promise<Variable[]> {
    try {
      const rows = await this.db.variable.findMany({
        orderBy: { name: 'asc' },
      });
      return rows.map(toVariableEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'variable.findAll');
    }
  }

  async countByWorkspaceIds(workspaceIds: readonly string[]): Promise<WorkspaceVariablesCounts[]> {
    if (workspaceIds.length === 0) return [];
    try {
      const counts = await this.db.variable.groupBy({
        by: ['workspaceId'],
        where: { workspaceId: { in: [...workspaceIds] } },
        _count: { workspaceId: true },
      });
      return counts.map((c) => ({ workspaceId: c.workspaceId, count: c._count.workspaceId }));
    } catch (error) {
      throw toInfrastructureError(error, 'variable.countByWorkspaceIds');
    }
  }

  async countByFolderIds(folderIds: readonly string[]): Promise<FolderVariablesCounts[]> {
    if (folderIds.length === 0) return [];
    try {
      const counts = await this.db.variable.groupBy({
        by: ['folderId'],
        where: { folderId: { in: [...folderIds] } },
        _count: { folderId: true },
      });
      return counts.map((c) => ({ folderId: c.folderId, count: c._count.folderId }));
    } catch (error) {
      throw toInfrastructureError(error, 'variable.countByFolderIds');
    }
  }

  async findByWorkspaceId(workspaceId: string): Promise<Variable[]> {
    try {
      const rows = await this.db.variable.findMany({
        where: { workspaceId },
        orderBy: { name: 'asc' },
      });
      return rows.map(toVariableEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'variable.findByWorkspaceId');
    }
  }

  async findByFolderId(folderId: string): Promise<Variable[]> {
    try {
      const rows = await this.db.variable.findMany({
        where: { folderId },
        orderBy: { name: 'asc' },
      });
      return rows.map(toVariableEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'variable.findByFolderId');
    }
  }

  async create(input: CreateVariableInput): Promise<Variable> {
    try {
      const row = await this.db.variable.create({
        data: {
          id: input.id,
          workspaceId: input.workspaceId,
          folderId: input.folderId,
          name: input.name,
          value: input.value,
          encrypted: input.encrypted,
        },
      });
      return toVariableEntity(row);
    } catch (error) {
      // Only the unique index arbitrates — a prior existence check would let
      // two concurrent creates both through.
      if (isUniqueViolation(error, 'name')) throw new VariableNameTakenError(input.name);
      throw toInfrastructureError(error, 'variable.create');
    }
  }

  async update(id: string, folderId: string, input: UpdateVariableInput): Promise<Variable> {
    try {
      const row = await this.db.variable.update({
        // `folderId` alongside the unique `id` scopes the write to the
        // caller's folder without a separate existence check — a row in
        // another folder simply does not match and P2025 fires below.
        where: { id, folderId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.value !== undefined ? { value: input.value } : {}),
        },
      });
      return toVariableEntity(row);
    } catch (error) {
      if (isRecordNotFound(error)) throw new VariableNotFoundError(id);
      if (isUniqueViolation(error, 'name') && input.name) throw new VariableNameTakenError(input.name);
      throw toInfrastructureError(error, 'variable.update');
    }
  }

  async delete(id: string, folderId: string): Promise<void> {
    try {
      await this.db.variable.delete({ where: { id, folderId } });
    } catch (error) {
      if (isRecordNotFound(error)) throw new VariableNotFoundError(id);
      throw toInfrastructureError(error, 'variable.delete');
    }
  }
}
