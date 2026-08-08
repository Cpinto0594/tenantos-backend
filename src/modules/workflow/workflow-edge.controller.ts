import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WorkflowEdgeService } from '@application/workflow/workflow-edge.service';
import type { WorkflowEdgeSnapshot } from '@domain/workflow/workflow-edge.entity';

@ApiTags('workflow-edges')
@ApiBearerAuth()
@Controller('workflow-edges')
export class WorkflowEdgeController {
  constructor(private readonly service: WorkflowEdgeService) {}

  @Get()
  @ApiOperation({ summary: 'List all workflow edges' })
  @ApiOkResponse({ description: 'Every row. Unpaginated until the rest of the CRUD surface lands.' })
  async listAll(): Promise<WorkflowEdgeSnapshot[]> {
    const items = await this.service.listAll();
    // Snapshots rather than entities: the envelope interceptor serialises
    // whatever it is handed, and an entity's shape is a domain decision that
    // should not silently become the wire contract.
    return items.map((item) => item.toSnapshot());
  }
}
