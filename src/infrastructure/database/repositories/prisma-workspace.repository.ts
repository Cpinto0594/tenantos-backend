import { Injectable } from '@nestjs/common';
import type { Workspace } from '@domain/workspace/workspace.entity';
import type { WorkspaceRepositoryPort } from '@domain/workspace/workspace.repository.port';
import { PrismaService } from '../prisma.service';
import { toWorkspaceEntity } from '../workflow-resource.mappers';
import { toInfrastructureError } from '../prisma-error';

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
}
