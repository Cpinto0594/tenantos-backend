import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WorkflowTriggerService } from '@application/workflow/workflow-trigger.service';
import type { WorkflowTriggerSnapshot } from '@domain/workflow/workflow-trigger.entity';

@ApiTags('workflow-triggers')
@ApiBearerAuth()
@Controller('workflow-triggers')
export class WorkflowTriggerController {
  constructor(private readonly service: WorkflowTriggerService) {}

  @Get()
  @ApiOperation({ summary: 'List all workflow triggers' })
  @ApiOkResponse({ description: 'Every row. Unpaginated until the rest of the CRUD surface lands.' })
  async listAll(): Promise<WorkflowTriggerSnapshot[]> {
    const items = await this.service.listAll();
    // Snapshots rather than entities: the envelope interceptor serialises
    // whatever it is handed, and an entity's shape is a domain decision that
    // should not silently become the wire contract.
    return items.map((item) => item.toSnapshot());
  }
}
