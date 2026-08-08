import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WorkflowNodeService } from '@application/workflow/workflow-node.service';
import type { WorkflowNodeSnapshot } from '@domain/workflow/workflow-node.entity';

@ApiTags('workflow-nodes')
@ApiBearerAuth()
@Controller('workflow-nodes')
export class WorkflowNodeController {
  constructor(private readonly service: WorkflowNodeService) {}

  @Get()
  @ApiOperation({ summary: 'List all workflow nodes' })
  @ApiOkResponse({ description: 'Every row. Unpaginated until the rest of the CRUD surface lands.' })
  async listAll(): Promise<WorkflowNodeSnapshot[]> {
    const items = await this.service.listAll();
    // Snapshots rather than entities: the envelope interceptor serialises
    // whatever it is handed, and an entity's shape is a domain decision that
    // should not silently become the wire contract.
    return items.map((item) => item.toSnapshot());
  }
}
