import { Injectable } from '@nestjs/common';
import type { WorkflowNode } from '@domain/workflow/workflow-node.entity';
import type { WorkflowNodeRepositoryPort } from '@domain/workflow/workflow-node.repository.port';
import { PrismaService } from '../prisma.service';
import { toWorkflowNodeEntity } from '../workflow-resource.mappers';
import { toInfrastructureError } from '../prisma-error';

@Injectable()
export class PrismaWorkflowNodeRepository implements WorkflowNodeRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async findAll(): Promise<WorkflowNode[]> {
    try {
      const rows = await this.db.workflowNode.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toWorkflowNodeEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'workflowNode.findAll');
    }
  }
}
