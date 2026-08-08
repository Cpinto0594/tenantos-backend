import { Inject, Injectable } from '@nestjs/common';
import type { Schedule } from '@domain/schedule/schedule.entity';
import { SCHEDULE_REPOSITORY, type ScheduleRepositoryPort } from '@domain/schedule/schedule.repository.port';
import { InlineLogger } from '@infrastructure/logging/inline-logger';

@Injectable()
export class ScheduleService {
  constructor(
    @Inject(SCHEDULE_REPOSITORY) private readonly repository: ScheduleRepositoryPort,
    private readonly inline: InlineLogger,
  ) {}

  async listAll(): Promise<Schedule[]> {
    const done = this.inline.start(ScheduleService.name, 'listAll');
    const items = await this.repository.findAll();
    done({ count: items.length });
    return items;
  }
}
