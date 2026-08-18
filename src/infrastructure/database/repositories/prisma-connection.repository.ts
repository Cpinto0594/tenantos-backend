import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Connection } from '@domain/connection/connection.entity';
import { CredentialNameTakenError, CredentialNotFoundError } from '@domain/connection/connection.errors';
import type {
  ConnectionRepositoryPort,
  CreateConnectionInput,
  FolderConnectionsCounts,
  UpdateConnectionInput,
  WorkspaceConnectionsCounts,
} from '@domain/connection/connection.repository.port';
import { PrismaService } from '../prisma.service';
import { toConnectionEntity } from './mappers/workflow.mappers';
import { isRecordNotFound, isUniqueViolation, toInfrastructureError } from '../prisma-error';

@Injectable()
export class PrismaConnectionRepository implements ConnectionRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async findAll(): Promise<Connection[]> {
    try {
      const rows = await this.db.connection.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toConnectionEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'connection.findAll');
    }
  }

  async countByWorkspaceIds(workspaceIds: readonly string[]): Promise<WorkspaceConnectionsCounts[]> {
    if (workspaceIds.length === 0) return [];
    try {
      const counts = await this.db.connection.groupBy({
        by: ['workspaceId'],
        where: { workspaceId: { in: [...workspaceIds] } },
        _count: { workspaceId: true },
      });
      return counts.map((c) => ({ workspaceId: c.workspaceId, count: c._count.workspaceId }));
    } catch (error) {
      throw toInfrastructureError(error, 'connection.countByWorkspaceIds');
    }
  }

  async countByFolderIds(folderIds: readonly string[]): Promise<FolderConnectionsCounts[]> {
    if (folderIds.length === 0) return [];
    try {
      const counts = await this.db.connection.groupBy({
        by: ['folderId'],
        where: { folderId: { in: [...folderIds] } },
        _count: { folderId: true },
      });
      return counts.map((c) => ({ folderId: c.folderId, count: c._count.folderId }));
    } catch (error) {
      throw toInfrastructureError(error, 'connection.countByFolderIds');
    }
  }

  async findByWorkspaceId(workspaceId: string): Promise<Connection[]> {
    try {
      const rows = await this.db.connection.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toConnectionEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'connection.findByWorkspaceId');
    }
  }

  async findByFolderId(folderId: string): Promise<Connection[]> {
    try {
      const rows = await this.db.connection.findMany({
        where: { folderId },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toConnectionEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'connection.findByFolderId');
    }
  }

  async create(input: CreateConnectionInput): Promise<Connection> {
    try {
      const row = await this.db.connection.create({
        data: {
          id: input.id,
          workspaceId: input.workspaceId,
          folderId: input.folderId,
          name: input.name,
          type: input.type,
          provider: input.provider,
          credentials: input.credentials as Prisma.InputJsonValue,
          encrypted: input.encrypted,
          metadata: input.metadata as Prisma.InputJsonValue,
          // `status` is left to the column default (`active`).
        },
      });
      return toConnectionEntity(row);
    } catch (error) {
      if (isUniqueViolation(error, 'name')) throw new CredentialNameTakenError(input.name);
      throw toInfrastructureError(error, 'connection.create');
    }
  }

  async update(id: string, folderId: string, input: UpdateConnectionInput): Promise<Connection> {
    try {
      const row = await this.db.connection.update({
        // `folderId` alongside the unique `id` scopes the write to the
        // caller's folder without a separate existence check — a row in
        // another folder simply does not match and P2025 fires below.
        where: { id, folderId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.provider !== undefined ? { provider: input.provider } : {}),
          ...(input.credentials !== undefined
            ? { credentials: input.credentials as Prisma.InputJsonValue }
            : {}),
          ...(input.metadata !== undefined ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
        },
      });
      return toConnectionEntity(row);
    } catch (error) {
      if (isRecordNotFound(error)) throw new CredentialNotFoundError(id);
      if (isUniqueViolation(error, 'name') && input.name) throw new CredentialNameTakenError(input.name);
      throw toInfrastructureError(error, 'connection.update');
    }
  }

  async delete(id: string, folderId: string): Promise<void> {
    try {
      await this.db.connection.delete({ where: { id, folderId } });
    } catch (error) {
      if (isRecordNotFound(error)) throw new CredentialNotFoundError(id);
      throw toInfrastructureError(error, 'connection.delete');
    }
  }
}
