import { Injectable } from '@nestjs/common';
import type { WorkflowVersion } from '@domain/workflow/workflow-version.entity';
import type { WorkflowVersionRepositoryPort } from '@domain/workflow/workflow-version.repository.port';
import { PrismaService } from '../prisma.service';
import { toWorkflowVersionEntity } from '../workflow-resource.mappers';
import { toInfrastructureError } from '../prisma-error';

@Injectable()
export class PrismaWorkflowVersionRepository implements WorkflowVersionRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async findAll(): Promise<WorkflowVersion[]> {
    try {
      const rows = await this.db.workflowVersion.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toWorkflowVersionEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'workflowVersion.findAll');
    }
  }
}
