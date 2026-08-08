import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConnectionService } from '@application/connection/connection.service';
import type { ConnectionSnapshot } from '@domain/connection/connection.entity';

@ApiTags('connections')
@ApiBearerAuth()
@Controller('connections')
export class ConnectionController {
  constructor(private readonly service: ConnectionService) {}

  @Get()
  @ApiOperation({ summary: 'List all connections' })
  @ApiOkResponse({ description: 'Every row. Unpaginated until the rest of the CRUD surface lands.' })
  async listAll(): Promise<ConnectionSnapshot[]> {
    const items = await this.service.listAll();
    // Snapshots rather than entities: the envelope interceptor serialises
    // whatever it is handed, and an entity's shape is a domain decision that
    // should not silently become the wire contract.
    return items.map((item) => item.toSnapshot());
  }
}
