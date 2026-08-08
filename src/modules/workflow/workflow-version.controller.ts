import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WorkflowVersionService } from '@application/workflow/workflow-version.service';
import type { WorkflowVersionSnapshot } from '@domain/workflow/workflow-version.entity';

@ApiTags('workflow-versions')
@ApiBearerAuth()
@Controller('workflow-versions')
export class WorkflowVersionController {
  constructor(private readonly service: WorkflowVersionService) {}

  @Get()
  @ApiOperation({ summary: 'List all workflow versions' })
  @ApiOkResponse({ description: 'Every row. Unpaginated until the rest of the CRUD surface lands.' })
  async listAll(): Promise<WorkflowVersionSnapshot[]> {
    const items = await this.service.listAll();
    // Snapshots rather than entities: the envelope interceptor serialises
    // whatever it is handed, and an entity's shape is a domain decision that
    // should not silently become the wire contract.
    return items.map((item) => item.toSnapshot());
  }
}
