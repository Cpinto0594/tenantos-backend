import { Injectable } from '@nestjs/common';
import type { WorkflowTrigger } from '@domain/workflow/workflow-trigger.entity';
import type { WorkflowTriggerRepositoryPort } from '@domain/workflow/workflow-trigger.repository.port';
import { PrismaService } from '../prisma.service';
import { toWorkflowTriggerEntity } from '../workflow-resource.mappers';
import { toInfrastructureError } from '../prisma-error';

@Injectable()
export class PrismaWorkflowTriggerRepository implements WorkflowTriggerRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async findAll(): Promise<WorkflowTrigger[]> {
    try {
      const rows = await this.db.workflowTrigger.findMany({
        orderBy: { id: 'asc' },
      });
      return rows.map(toWorkflowTriggerEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'workflowTrigger.findAll');
    }
  }
}
