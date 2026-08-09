import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Workspace } from '@domain/workspace/workspace.entity';
import { WorkspaceSlugTakenError } from '@domain/workspace/workspace.errors';
import type {
  CreateWorkspaceInput,
  WorkspaceRepositoryPort,
} from '@domain/workspace/workspace.repository.port';
import { PrismaService } from '../prisma.service';
import { isUniqueViolation, toInfrastructureError } from '../prisma-error';
import { toWorkspaceEntity } from './mappers/worspace.mappers';

@Injectable()
export class PrismaWorkspaceRepository implements WorkspaceRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findByUserIdAndDefault(userId: string): Promise<Workspace | null> {
    return this.db.workspace
      .findFirst({
        where: { userId, isDefault: true },
      })
      .then((row) => (row ? toWorkspaceEntity(row) : null))
      .catch((error) => {
        throw toInfrastructureError(error, 'workspace.findByUserIdAndDefault');
      });
  }

  private get db() {
    return this.prisma.client;
  }

  async findAll(): Promise<Workspace[]> {
    try {
      const rows = await this.db.workspace.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toWorkspaceEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'workspace.findAll');
    }
  }

  async findByUserId(userId: string): Promise<Workspace[]> {
    try {
      const rows = await this.db.workspace.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toWorkspaceEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'workspace.findByUserId');
    }
  }

  async findById(id: string): Promise<Workspace | null> {
    try {
      const row = await this.db.workspace.findUnique({ where: { id } });
      return row ? toWorkspaceEntity(row) : null;
    } catch (error) {
      throw toInfrastructureError(error, 'workspace.findById');
    }
  }

  async create(input: CreateWorkspaceInput): Promise<Workspace> {
    try {
      const row = await this.db.workspace.create({
        data: {
          id: input.id,
          userId: input.userId,
          name: input.name,
          slug: input.slug,
          description: input.description,
          settings: input.settings as Prisma.InputJsonValue,
          // `status` (`active`) and `isDefault` (`false`) are left to the
          // column defaults — nothing in this path makes a workspace the
          // user's default.
        },
      });
      return toWorkspaceEntity(row);
    } catch (error) {
      // Only the unique index arbitrates — a prior existence check would let
      // two concurrent creates both through.
      if (isUniqueViolation(error, 'slug')) throw new WorkspaceSlugTakenError(input.slug);
      throw toInfrastructureError(error, 'workspace.create');
    }
  }
}
