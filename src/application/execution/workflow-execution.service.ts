import { Inject, Injectable } from '@nestjs/common';
import type { WorkflowExecution } from '@domain/execution/workflow-execution.entity';
import {
  WORKFLOW_EXECUTION_REPOSITORY,
  type WorkflowExecutionRepositoryPort,
} from '@domain/execution/workflow-execution.repository.port';
import { InlineLogger } from '@infrastructure/logging/inline-logger';

@Injectable()
export class WorkflowExecutionService {
  constructor(
    @Inject(WORKFLOW_EXECUTION_REPOSITORY) private readonly repository: WorkflowExecutionRepositoryPort,
    private readonly inline: InlineLogger,
  ) {}

  async listAll(): Promise<WorkflowExecution[]> {
    const done = this.inline.start(WorkflowExecutionService.name, 'listAll');
    const items = await this.repository.findAll();
    done({ count: items.length });
    return items;
  }
}
