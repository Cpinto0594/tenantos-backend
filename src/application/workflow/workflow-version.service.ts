import { Inject, Injectable } from '@nestjs/common';
import type { WorkflowVersion } from '@domain/workflow/workflow-version.entity';
import {
  WORKFLOW_VERSION_REPOSITORY,
  type WorkflowVersionRepositoryPort,
} from '@domain/workflow/workflow-version.repository.port';
import { InlineLogger } from '@infrastructure/logging/inline-logger';

@Injectable()
export class WorkflowVersionService {
  constructor(
    @Inject(WORKFLOW_VERSION_REPOSITORY) private readonly repository: WorkflowVersionRepositoryPort,
    private readonly inline: InlineLogger,
  ) {}

  async listAll(): Promise<WorkflowVersion[]> {
    const done = this.inline.start(WorkflowVersionService.name, 'listAll');
    const items = await this.repository.findAll();
    done({ count: items.length });
    return items;
  }
}
