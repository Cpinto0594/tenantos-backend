import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WorkflowNodeSettingsService } from '@application/workflow/workflow-node-settings.service';
import type { WorkflowNodeSettingsSnapshot } from '@domain/workflow/workflow-node-settings.entity';

@ApiTags('workflow-node-settings')
@ApiBearerAuth()
@Controller('workflow-node-settings')
export class WorkflowNodeSettingsController {
  constructor(private readonly service: WorkflowNodeSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'List all workflow node settings' })
  @ApiOkResponse({ description: 'Every row. Unpaginated until the rest of the CRUD surface lands.' })
  async listAll(): Promise<WorkflowNodeSettingsSnapshot[]> {
    const items = await this.service.listAll();
    // Snapshots rather than entities: the envelope interceptor serialises
    // whatever it is handed, and an entity's shape is a domain decision that
    // should not silently become the wire contract.
    return items.map((item) => item.toSnapshot());
  }
}
