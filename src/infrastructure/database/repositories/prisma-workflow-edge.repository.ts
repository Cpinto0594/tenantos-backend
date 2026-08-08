import { Injectable } from '@nestjs/common';
import type { WorkflowEdge } from '@domain/workflow/workflow-edge.entity';
import type { WorkflowEdgeRepositoryPort } from '@domain/workflow/workflow-edge.repository.port';
import { PrismaService } from '../prisma.service';
import { toWorkflowEdgeEntity } from '../workflow-resource.mappers';
import { toInfrastructureError } from '../prisma-error';

@Injectable()
export class PrismaWorkflowEdgeRepository implements WorkflowEdgeRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async findAll(): Promise<WorkflowEdge[]> {
    try {
      const rows = await this.db.workflowEdge.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toWorkflowEdgeEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'workflowEdge.findAll');
    }
  }
}
