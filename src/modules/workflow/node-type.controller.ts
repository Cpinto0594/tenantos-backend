import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { NodeTypeService } from '@application/workflow/node-type.service';
import type { NodeTypeSnapshot } from '@domain/workflow/node-type.entity';

@ApiTags('node-types')
@ApiBearerAuth()
@Controller('node-types')
export class NodeTypeController {
  constructor(private readonly service: NodeTypeService) {}

  @Get()
  @ApiOperation({ summary: 'List all node types' })
  @ApiOkResponse({ description: 'Every row. Unpaginated until the rest of the CRUD surface lands.' })
  async listAll(): Promise<NodeTypeSnapshot[]> {
    const items = await this.service.listAll();
    // Snapshots rather than entities: the envelope interceptor serialises
    // whatever it is handed, and an entity's shape is a domain decision that
    // should not silently become the wire contract.
    return items.map((item) => item.toSnapshot());
  }

  @Get(':name')
  @ApiOperation({
    summary: 'Get a node type by name',
    description: '`name` is not unique across versions — the highest `version` for that name is returned.',
  })
  @ApiParam({ name: 'name' })
  @ApiOkResponse({ description: 'The node type.' })
  @ApiNotFoundResponse({ description: 'NODE_TYPE_NOT_FOUND — no node type is registered under that name.' })
  async getByName(@Param('name') name: string): Promise<NodeTypeSnapshot> {
    const item = await this.service.getByName(name);
    return item.toSnapshot();
  }
}
