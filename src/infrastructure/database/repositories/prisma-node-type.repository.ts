import { Injectable } from '@nestjs/common';
import type { NodeType } from '@domain/workflow/node-type.entity';
import type { NodeTypeRepositoryPort } from '@domain/workflow/node-type.repository.port';
import { PrismaService } from '../prisma.service';
import { toNodeTypeEntity } from './mappers/workflow.mappers';
import { toInfrastructureError } from '../prisma-error';

@Injectable()
export class PrismaNodeTypeRepository implements NodeTypeRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async findAll(): Promise<NodeType[]> {
    try {
      const rows = await this.db.nodeType.findMany({
        orderBy: { name: 'asc' },
      });
      return rows.map(toNodeTypeEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'nodeType.findAll');
    }
  }

  async findAllEnabled(): Promise<NodeType[]> {
    try {
      const rows = await this.db.nodeType.findMany({
        where: { enabled: true },
        orderBy: { name: 'asc' },
      });
      return rows.map(toNodeTypeEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'nodeType.findAllEnabled');
    }
  }

  async findByName(name: string): Promise<NodeType | null> {
    try {
      const row = await this.db.nodeType.findFirst({
        where: { name },
        orderBy: { version: 'desc' },
      });
      return row ? toNodeTypeEntity(row) : null;
    } catch (error) {
      throw toInfrastructureError(error, 'nodeType.findByName');
    }
  }
}
