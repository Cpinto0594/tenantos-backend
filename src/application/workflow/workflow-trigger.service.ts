import { Inject, Injectable } from '@nestjs/common';
import type { WorkflowTrigger } from '@domain/workflow/workflow-trigger.entity';
import {
  WORKFLOW_TRIGGER_REPOSITORY,
  type WorkflowTriggerRepositoryPort,
} from '@domain/workflow/workflow-trigger.repository.port';
import { InlineLogger } from '@infrastructure/logging/inline-logger';

@Injectable()
export class WorkflowTriggerService {
  constructor(
    @Inject(WORKFLOW_TRIGGER_REPOSITORY) private readonly repository: WorkflowTriggerRepositoryPort,
    private readonly inline: InlineLogger,
  ) {}

  async listAll(): Promise<WorkflowTrigger[]> {
    const done = this.inline.start(WorkflowTriggerService.name, 'listAll');
    const items = await this.repository.findAll();
    done({ count: items.length });
    return items;
  }
}
