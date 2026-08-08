import { Inject, Injectable } from '@nestjs/common';
import type { ExecutionQueueItem } from '@domain/execution/execution-queue-item.entity';
import {
  EXECUTION_QUEUE_ITEM_REPOSITORY,
  type ExecutionQueueItemRepositoryPort,
} from '@domain/execution/execution-queue-item.repository.port';
import { InlineLogger } from '@infrastructure/logging/inline-logger';

@Injectable()
export class ExecutionQueueItemService {
  constructor(
    @Inject(EXECUTION_QUEUE_ITEM_REPOSITORY) private readonly repository: ExecutionQueueItemRepositoryPort,
    private readonly inline: InlineLogger,
  ) {}

  async listAll(): Promise<ExecutionQueueItem[]> {
    const done = this.inline.start(ExecutionQueueItemService.name, 'listAll');
    const items = await this.repository.findAll();
    done({ count: items.length });
    return items;
  }
}
