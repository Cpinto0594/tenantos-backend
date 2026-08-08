import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ScheduleService } from '@application/schedule/schedule.service';
import type { ScheduleSnapshot } from '@domain/schedule/schedule.entity';

@ApiTags('schedules')
@ApiBearerAuth()
@Controller('schedules')
export class ScheduleController {
  constructor(private readonly service: ScheduleService) {}

  @Get()
  @ApiOperation({ summary: 'List all schedules' })
  @ApiOkResponse({ description: 'Every row. Unpaginated until the rest of the CRUD surface lands.' })
  async listAll(): Promise<ScheduleSnapshot[]> {
    const items = await this.service.listAll();
    // Snapshots rather than entities: the envelope interceptor serialises
    // whatever it is handed, and an entity's shape is a domain decision that
    // should not silently become the wire contract.
    return items.map((item) => item.toSnapshot());
  }
}
