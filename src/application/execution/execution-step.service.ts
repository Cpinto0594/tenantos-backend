import { Inject, Injectable } from '@nestjs/common';
import type { ExecutionStep } from '@domain/execution/execution-step.entity';
import {
  EXECUTION_STEP_REPOSITORY,
  type ExecutionStepRepositoryPort,
} from '@domain/execution/execution-step.repository.port';
import { InlineLogger } from '@infrastructure/logging/inline-logger';

@Injectable()
export class ExecutionStepService {
  constructor(
    @Inject(EXECUTION_STEP_REPOSITORY) private readonly repository: ExecutionStepRepositoryPort,
    private readonly inline: InlineLogger,
  ) {}

  async listAll(): Promise<ExecutionStep[]> {
    const done = this.inline.start(ExecutionStepService.name, 'listAll');
    const items = await this.repository.findAll();
    done({ count: items.length });
    return items;
  }
}
