import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WorkflowExecutionService } from '@application/execution/workflow-execution.service';
import type { WorkflowExecutionSnapshot } from '@domain/execution/workflow-execution.entity';

@ApiTags('workflow-executions')
@ApiBearerAuth()
@Controller('workflow-executions')
export class WorkflowExecutionController {
  constructor(private readonly service: WorkflowExecutionService) {}

  @Get()
  @ApiOperation({ summary: 'List all workflow executions' })
  @ApiOkResponse({ description: 'Every row. Unpaginated until the rest of the CRUD surface lands.' })
  async listAll(): Promise<WorkflowExecutionSnapshot[]> {
    const items = await this.service.listAll();
    // Snapshots rather than entities: the envelope interceptor serialises
    // whatever it is handed, and an entity's shape is a domain decision that
    // should not silently become the wire contract.
    return items.map((item) => item.toSnapshot());
  }
}
