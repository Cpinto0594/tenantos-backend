import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WorkflowService } from '@application/workflow/workflow.service';
import { Workflow } from '@domain/workflow/workflow.entity';

@ApiTags('workflows')
@ApiBearerAuth()
@Controller('workflows')
export class WorkflowController {
  constructor(private readonly service: WorkflowService) {}

  @Get()
  @ApiOperation({ summary: 'List all workflows' })
  @ApiOkResponse({
    description:
      'Every row, each with its current version under `version`. Unpaginated until the rest of ' +
      'the CRUD surface lands.',
  })
  async listAll(): Promise<Workflow[]> {
    const items = await this.service.listAll();
    // Snapshots rather than entities: the envelope interceptor serialises
    // whatever it is handed, and an entity's shape is a domain decision that
    // should not silently become the wire contract.
    return items;
  }
}
