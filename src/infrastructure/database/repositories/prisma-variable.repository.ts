import { Injectable } from '@nestjs/common';
import type { Variable } from '@domain/variable/variable.entity';
import { VariableNameTakenError } from '@domain/variable/variable.errors';
import type { CreateVariableInput, VariableRepositoryPort } from '@domain/variable/variable.repository.port';
import { PrismaService } from '../prisma.service';
import { toVariableEntity } from '../workflow-resource.mappers';
import { isUniqueViolation, toInfrastructureError } from '../prisma-error';

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
}
