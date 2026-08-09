import { Inject, Injectable } from '@nestjs/common';
import {
  WORKFLOW_REPOSITORY,
  type WorkflowRepositoryPort,
} from '@domain/workflow/workflow.repository.port';
import { InlineLogger } from '@infrastructure/logging/inline-logger';
import { Workflow } from '@domain/workflow/workflow.entity';

@Injectable()
export class WorkflowService {
  constructor(
    @Inject(WORKFLOW_REPOSITORY) private readonly repository: WorkflowRepositoryPort,
    private readonly inline: InlineLogger,
  ) {}

  async listAll(): Promise<Workflow[]> {
    const done = this.inline.start(WorkflowService.name, 'listAll');
    const items = await this.repository.findAll();
    done({ count: items.length });
    return items;
  }
}
