import { Injectable } from '@nestjs/common';
import type { WorkflowExecution } from '@domain/execution/workflow-execution.entity';
import type { WorkflowExecutionRepositoryPort } from '@domain/execution/workflow-execution.repository.port';
import { PrismaService } from '../prisma.service';
import { toWorkflowExecutionEntity } from '../workflow-resource.mappers';
import { toInfrastructureError } from '../prisma-error';

@Injectable()
export class PrismaWorkflowExecutionRepository implements WorkflowExecutionRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async findAll(): Promise<WorkflowExecution[]> {
    try {
      const rows = await this.db.workflowExecution.findMany({
        orderBy: { startedAt: 'desc' },
      });
      return rows.map(toWorkflowExecutionEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'workflowExecution.findAll');
    }
  }
}
