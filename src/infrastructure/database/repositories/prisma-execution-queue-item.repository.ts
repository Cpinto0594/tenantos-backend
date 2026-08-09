import { Injectable } from '@nestjs/common';
import type { ExecutionQueueItem } from '@domain/execution/execution-queue-item.entity';
import type { ExecutionQueueItemRepositoryPort } from '@domain/execution/execution-queue-item.repository.port';
import { PrismaService } from '../prisma.service';
import { toExecutionQueueItemEntity } from './mappers/workflow.mappers';
import { toInfrastructureError } from '../prisma-error';

@Injectable()
export class PrismaExecutionQueueItemRepository implements ExecutionQueueItemRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async findAll(): Promise<ExecutionQueueItem[]> {
    try {
      const rows = await this.db.executionQueueItem.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toExecutionQueueItemEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'executionQueueItem.findAll');
    }
  }
}
