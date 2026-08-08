import { Inject, Injectable } from '@nestjs/common';
import {
  WORKFLOW_REPOSITORY,
  type WorkflowRepositoryPort,
  type WorkflowWithCurrentVersion,
} from '@domain/workflow/workflow.repository.port';
import { InlineLogger } from '@infrastructure/logging/inline-logger';

@Injectable()
export class WorkflowService {
  constructor(
    @Inject(WORKFLOW_REPOSITORY) private readonly repository: WorkflowRepositoryPort,
    private readonly inline: InlineLogger,
  ) {}

  async listAll(): Promise<WorkflowWithCurrentVersion[]> {
    const done = this.inline.start(WorkflowService.name, 'listAll');
    const items = await this.repository.findAll();
    done({ count: items.length });
    return items;
  }
}
