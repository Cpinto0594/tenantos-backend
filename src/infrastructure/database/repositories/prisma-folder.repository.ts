import { Injectable } from '@nestjs/common';
import type { Folder } from '@domain/folder/folder.entity';
import type { FolderRepositoryPort } from '@domain/folder/folder.repository.port';
import { PrismaService } from '../prisma.service';
import { toFolderEntity } from '../workflow-resource.mappers';
import { toInfrastructureError } from '../prisma-error';

@Injectable()
export class PrismaFolderRepository implements FolderRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async findAll(): Promise<Folder[]> {
    try {
      const rows = await this.db.folder.findMany({
        orderBy: { position: 'asc' },
      });
      return rows.map(toFolderEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'folder.findAll');
    }
  }

  async findByWorkspaceIds(workspaceIds: readonly string[]): Promise<Folder[]> {
    // `IN ()` is not valid SQL and Prisma turns an empty `in` into a query that
    // matches nothing anyway — returning early skips a pointless round trip.
    if (workspaceIds.length === 0) return [];

    try {
      const rows = await this.db.folder.findMany({
        where: { workspaceId: { in: [...workspaceIds] } },
        // Position is per-workspace, so it only orders within a group; the
        // workspace key first makes the whole list deterministic.
        orderBy: [{ workspaceId: 'asc' }, { position: 'asc' }],
      });
      return rows.map(toFolderEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'folder.findByWorkspaceIds');
    }
  }

  async findById(id: string): Promise<Folder | null> {
    try {
      const row = await this.db.folder.findUnique({ where: { id } });
      return row ? toFolderEntity(row) : null;
    } catch (error) {
      throw toInfrastructureError(error, 'folder.findById');
    }
  }

  async findByWorkspaceIdAndDefault(workspaceId: string): Promise<Folder | null> {
    try {
      const row = await this.db.folder.findFirst({
        where: { workspaceId, isDefault: true },
      });
      return row ? toFolderEntity(row) : null;
    } catch (error) {
      throw toInfrastructureError(error, 'folder.findByWorkspaceIdAndDefault');
    }
  }
}
