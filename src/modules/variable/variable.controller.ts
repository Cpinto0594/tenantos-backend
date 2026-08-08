import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { VariableService } from '@application/variable/variable.service';
import type { VariableSnapshot } from '@domain/variable/variable.entity';

@ApiTags('variables')
@ApiBearerAuth()
@Controller('variables')
export class VariableController {
  constructor(private readonly service: VariableService) {}

  @Get()
  @ApiOperation({ summary: 'List all variables' })
  @ApiOkResponse({ description: 'Every row. Unpaginated until the rest of the CRUD surface lands.' })
  async listAll(): Promise<VariableSnapshot[]> {
    const items = await this.service.listAll();
    // Snapshots rather than entities: the envelope interceptor serialises
    // whatever it is handed, and an entity's shape is a domain decision that
    // should not silently become the wire contract.
    return items.map((item) => item.toSnapshot());
  }
}
