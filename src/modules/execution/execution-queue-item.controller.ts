import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExecutionQueueItemService } from '@application/execution/execution-queue-item.service';
import type { ExecutionQueueItemSnapshot } from '@domain/execution/execution-queue-item.entity';

@ApiTags('execution-queue')
@ApiBearerAuth()
@Controller('execution-queue')
export class ExecutionQueueItemController {
  constructor(private readonly service: ExecutionQueueItemService) {}

  @Get()
  @ApiOperation({ summary: 'List all queued executions' })
  @ApiOkResponse({ description: 'Every row. Unpaginated until the rest of the CRUD surface lands.' })
  async listAll(): Promise<ExecutionQueueItemSnapshot[]> {
    const items = await this.service.listAll();
    // Snapshots rather than entities: the envelope interceptor serialises
    // whatever it is handed, and an entity's shape is a domain decision that
    // should not silently become the wire contract.
    return items.map((item) => item.toSnapshot());
  }
}
