import { Inject, Injectable } from '@nestjs/common';
import type { Variable } from '@domain/variable/variable.entity';
import { VARIABLE_REPOSITORY, type VariableRepositoryPort } from '@domain/variable/variable.repository.port';
import { InlineLogger } from '@infrastructure/logging/inline-logger';

@Injectable()
export class VariableService {
  constructor(
    @Inject(VARIABLE_REPOSITORY) private readonly repository: VariableRepositoryPort,
    private readonly inline: InlineLogger,
  ) {}

  async listAll(): Promise<Variable[]> {
    const done = this.inline.start(VariableService.name, 'listAll');
    const items = await this.repository.findAll();
    done({ count: items.length });
    return items;
  }
}
