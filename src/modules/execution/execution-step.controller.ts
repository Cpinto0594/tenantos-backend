import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExecutionStepService } from '@application/execution/execution-step.service';
import type { ExecutionStepSnapshot } from '@domain/execution/execution-step.entity';

@ApiTags('execution-steps')
@ApiBearerAuth()
@Controller('execution-steps')
export class ExecutionStepController {
  constructor(private readonly service: ExecutionStepService) {}

  @Get()
  @ApiOperation({ summary: 'List all execution steps' })
  @ApiOkResponse({ description: 'Every row. Unpaginated until the rest of the CRUD surface lands.' })
  async listAll(): Promise<ExecutionStepSnapshot[]> {
    const items = await this.service.listAll();
    // Snapshots rather than entities: the envelope interceptor serialises
    // whatever it is handed, and an entity's shape is a domain decision that
    // should not silently become the wire contract.
    return items.map((item) => item.toSnapshot());
  }
}
