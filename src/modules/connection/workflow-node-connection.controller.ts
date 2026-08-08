import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WorkflowNodeConnectionService } from '@application/connection/workflow-node-connection.service';
import type { WorkflowNodeConnectionSnapshot } from '@domain/connection/workflow-node-connection.entity';

@ApiTags('workflow-node-connections')
@ApiBearerAuth()
@Controller('workflow-node-connections')
export class WorkflowNodeConnectionController {
  constructor(private readonly service: WorkflowNodeConnectionService) {}

  @Get()
  @ApiOperation({ summary: 'List all workflow node connections' })
  @ApiOkResponse({ description: 'Every row. Unpaginated until the rest of the CRUD surface lands.' })
  async listAll(): Promise<WorkflowNodeConnectionSnapshot[]> {
    const items = await this.service.listAll();
    // Snapshots rather than entities: the envelope interceptor serialises
    // whatever it is handed, and an entity's shape is a domain decision that
    // should not silently become the wire contract.
    return items.map((item) => item.toSnapshot());
  }
}
