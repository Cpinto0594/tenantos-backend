import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Connection } from '@domain/connection/connection.entity';
import { CredentialNameTakenError } from '@domain/connection/connection.errors';
import type {
  ConnectionRepositoryPort,
  CreateConnectionInput,
} from '@domain/connection/connection.repository.port';
import { PrismaService } from '../prisma.service';
import { toConnectionEntity } from '../workflow-resource.mappers';
import { isUniqueViolation, toInfrastructureError } from '../prisma-error';

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
}
