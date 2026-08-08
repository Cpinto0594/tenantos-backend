import { Module } from '@nestjs/common';
import { ScheduleService } from '@application/schedule/schedule.service';
import { ScheduleController } from './schedule.controller';

/**
 * Schedule trigger surfaces.
 *
 * Only the read side exists so far. The repository bindings live in
 * DatabaseModule, which stays the single place naming both a port and its
 * Prisma adapter.
 */
@Module({
  controllers: [ScheduleController],
  providers: [ScheduleService],
})
export class ScheduleModule {}
