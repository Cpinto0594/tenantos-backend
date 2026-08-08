import { Injectable } from '@nestjs/common';
import type { WorkflowNodeSettings } from '@domain/workflow/workflow-node-settings.entity';
import type { WorkflowNodeSettingsRepositoryPort } from '@domain/workflow/workflow-node-settings.repository.port';
import { PrismaService } from '../prisma.service';
import { toWorkflowNodeSettingsEntity } from '../workflow-resource.mappers';
import { toInfrastructureError } from '../prisma-error';

@Injectable()
export class PrismaWorkflowNodeSettingsRepository implements WorkflowNodeSettingsRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async findAll(): Promise<WorkflowNodeSettings[]> {
    try {
      const rows = await this.db.workflowNodeSettings.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toWorkflowNodeSettingsEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'workflowNodeSettings.findAll');
    }
  }
}
