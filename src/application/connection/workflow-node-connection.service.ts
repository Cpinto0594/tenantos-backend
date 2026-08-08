import { Inject, Injectable } from '@nestjs/common';
import type { WorkflowNodeConnection } from '@domain/connection/workflow-node-connection.entity';
import {
  WORKFLOW_NODE_CONNECTION_REPOSITORY,
  type WorkflowNodeConnectionRepositoryPort,
} from '@domain/connection/workflow-node-connection.repository.port';
import { InlineLogger } from '@infrastructure/logging/inline-logger';

@Injectable()
export class WorkflowNodeConnectionService {
  constructor(
    @Inject(WORKFLOW_NODE_CONNECTION_REPOSITORY)
    private readonly repository: WorkflowNodeConnectionRepositoryPort,
    private readonly inline: InlineLogger,
  ) {}

  async listAll(): Promise<WorkflowNodeConnection[]> {
    const done = this.inline.start(WorkflowNodeConnectionService.name, 'listAll');
    const items = await this.repository.findAll();
    done({ count: items.length });
    return items;
  }
}
