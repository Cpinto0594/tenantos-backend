import { Inject, Injectable } from '@nestjs/common';
import type { WorkflowEdge } from '@domain/workflow/workflow-edge.entity';
import {
  WORKFLOW_EDGE_REPOSITORY,
  type WorkflowEdgeRepositoryPort,
} from '@domain/workflow/workflow-edge.repository.port';
import { InlineLogger } from '@infrastructure/logging/inline-logger';

@Injectable()
export class WorkflowEdgeService {
  constructor(
    @Inject(WORKFLOW_EDGE_REPOSITORY) private readonly repository: WorkflowEdgeRepositoryPort,
    private readonly inline: InlineLogger,
  ) {}

  async listAll(): Promise<WorkflowEdge[]> {
    const done = this.inline.start(WorkflowEdgeService.name, 'listAll');
    const items = await this.repository.findAll();
    done({ count: items.length });
    return items;
  }
}
