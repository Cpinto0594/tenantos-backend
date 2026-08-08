import { Inject, Injectable } from '@nestjs/common';
import type { WorkflowNodeSettings } from '@domain/workflow/workflow-node-settings.entity';
import {
  WORKFLOW_NODE_SETTINGS_REPOSITORY,
  type WorkflowNodeSettingsRepositoryPort,
} from '@domain/workflow/workflow-node-settings.repository.port';
import { InlineLogger } from '@infrastructure/logging/inline-logger';

@Injectable()
export class WorkflowNodeSettingsService {
  constructor(
    @Inject(WORKFLOW_NODE_SETTINGS_REPOSITORY)
    private readonly repository: WorkflowNodeSettingsRepositoryPort,
    private readonly inline: InlineLogger,
  ) {}

  async listAll(): Promise<WorkflowNodeSettings[]> {
    const done = this.inline.start(WorkflowNodeSettingsService.name, 'listAll');
    const items = await this.repository.findAll();
    done({ count: items.length });
    return items;
  }
}
