import { Injectable } from '@nestjs/common';
import type { WorkflowNodeConnection } from '@domain/connection/workflow-node-connection.entity';
import type { WorkflowNodeConnectionRepositoryPort } from '@domain/connection/workflow-node-connection.repository.port';
import { PrismaService } from '../prisma.service';
import { toWorkflowNodeConnectionEntity } from './mappers/workflow.mappers';
import { toInfrastructureError } from '../prisma-error';

@Injectable()
export class PrismaWorkflowNodeConnectionRepository implements WorkflowNodeConnectionRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async findAll(): Promise<WorkflowNodeConnection[]> {
    try {
      const rows = await this.db.workflowNodeConnection.findMany({
        orderBy: { nodeId: 'asc' },
      });
      return rows.map(toWorkflowNodeConnectionEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'workflowNodeConnection.findAll');
    }
  }
}
