import { Inject, Injectable } from '@nestjs/common';
import type { WorkflowNode } from '@domain/workflow/workflow-node.entity';
import {
  WORKFLOW_NODE_REPOSITORY,
  type WorkflowNodeRepositoryPort,
} from '@domain/workflow/workflow-node.repository.port';
import { InlineLogger } from '@infrastructure/logging/inline-logger';

@Injectable()
export class WorkflowNodeService {
  constructor(
    @Inject(WORKFLOW_NODE_REPOSITORY) private readonly repository: WorkflowNodeRepositoryPort,
    private readonly inline: InlineLogger,
  ) {}

  async listAll(): Promise<WorkflowNode[]> {
    const done = this.inline.start(WorkflowNodeService.name, 'listAll');
    const items = await this.repository.findAll();
    done({ count: items.length });
    return items;
  }
}
