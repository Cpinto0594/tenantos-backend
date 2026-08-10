import { Injectable } from '@nestjs/common';
import type { Folder } from '@domain/folder/folder.entity';
import { FolderNameTakenError, FolderSlugTakenError } from '@domain/folder/folder.errors';
import type {
  CreateFolderInput,
  FolderRepositoryPort,
  WorkspaceFolderCounts,
} from '@domain/folder/folder.repository.port';
import { PrismaService } from '../prisma.service';
import { isUniqueViolation, toInfrastructureError } from '../prisma-error';
import { toFolderEntity } from './mappers/folders.mappers';

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

  async countByWorkspaceIds(workspaceIds: readonly string[]): Promise<WorkspaceFolderCounts[]> {
    if (workspaceIds.length === 0) return [];
    try {
      const counts = await this.db.folder.groupBy({
        by: ['workspaceId'],
        where: { workspaceId: { in: [...workspaceIds] } },
        _count: { workspaceId: true },
      });
      return counts.map((c) => ({ workspaceId: c.workspaceId, count: c._count.workspaceId }));
    } catch (error) {
      throw toInfrastructureError(error, 'folder.countByWorkspaceIds');
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

  async create(input: CreateFolderInput): Promise<Folder> {
    try {
      const row = await this.db.folder.create({
        data: {
          id: input.id,
          workspaceId: input.workspaceId,
          name: input.name,
          slug: input.slug,
          description: input.description,
          // `position` (`0`) and `isDefault` (`false`) are left to the column
          // defaults — this path never provisions the workspace's default
          // folder, see PrismaWorkspaceRepository.create.
        },
      });
      return toFolderEntity(row);
    } catch (error) {
      // Only the unique index arbitrates — a prior existence check would let
      // two concurrent creates both through.
      if (isUniqueViolation(error, 'name')) throw new FolderNameTakenError(input.name);
      if (isUniqueViolation(error, 'slug')) throw new FolderSlugTakenError(input.slug);
      throw toInfrastructureError(error, 'folder.create');
    }
  }
}
