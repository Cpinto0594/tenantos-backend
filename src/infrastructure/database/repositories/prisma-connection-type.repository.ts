import { Injectable } from '@nestjs/common';
import type { ConnectionType } from '@domain/connection/connection-type.entity';
import type { ConnectionTypeRepositoryPort } from '@domain/connection/connection-type.repository.port';
import { PrismaService } from '../prisma.service';
import { toConnectionTypeEntity } from './mappers/workflow.mappers';
import { toInfrastructureError } from '../prisma-error';

@Injectable()
export class PrismaConnectionTypeRepository implements ConnectionTypeRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async findAll(): Promise<ConnectionType[]> {
    try {
      const rows = await this.db.connectionType.findMany({
        orderBy: { name: 'asc' },
      });
      return rows.map(toConnectionTypeEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'connectionType.findAll');
    }
  }
}
