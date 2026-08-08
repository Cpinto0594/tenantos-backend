import { Injectable } from '@nestjs/common';
import type { ExecutionStep } from '@domain/execution/execution-step.entity';
import type { ExecutionStepRepositoryPort } from '@domain/execution/execution-step.repository.port';
import { PrismaService } from '../prisma.service';
import { toExecutionStepEntity } from '../workflow-resource.mappers';
import { toInfrastructureError } from '../prisma-error';

@Injectable()
export class PrismaExecutionStepRepository implements ExecutionStepRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async findAll(): Promise<ExecutionStep[]> {
    try {
      const rows = await this.db.executionStep.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toExecutionStepEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'executionStep.findAll');
    }
  }
}
