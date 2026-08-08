import { Injectable } from '@nestjs/common';
import type { Schedule } from '@domain/schedule/schedule.entity';
import type { ScheduleRepositoryPort } from '@domain/schedule/schedule.repository.port';
import { PrismaService } from '../prisma.service';
import { toScheduleEntity } from '../workflow-resource.mappers';
import { toInfrastructureError } from '../prisma-error';

@Injectable()
export class PrismaScheduleRepository implements ScheduleRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async findAll(): Promise<Schedule[]> {
    try {
      const rows = await this.db.schedule.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toScheduleEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'schedule.findAll');
    }
  }
}
