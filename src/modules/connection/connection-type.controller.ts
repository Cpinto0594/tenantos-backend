import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConnectionTypeService } from '@application/connection/connection-type.service';
import type { ConnectionTypeSnapshot } from '@domain/connection/connection-type.entity';

@ApiTags('connection-types')
@ApiBearerAuth()
@Controller('connection-types')
export class ConnectionTypeController {
  constructor(private readonly service: ConnectionTypeService) {}

  @Get()
  @ApiOperation({ summary: 'List all connection types' })
  @ApiOkResponse({ description: 'Every row. Unpaginated until the rest of the CRUD surface lands.' })
  async listAll(): Promise<ConnectionTypeSnapshot[]> {
    const items = await this.service.listAll();
    // Snapshots rather than entities: the envelope interceptor serialises
    // whatever it is handed, and an entity's shape is a domain decision that
    // should not silently become the wire contract.
    return items.map((item) => item.toSnapshot());
  }
}
