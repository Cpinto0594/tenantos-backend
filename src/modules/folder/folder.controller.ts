import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FolderService } from '@application/folder/folder.service';
import type { FolderSnapshot } from '@domain/folder/folder.entity';

@ApiTags('folders')
@ApiBearerAuth()
@Controller('folders')
export class FolderController {
  constructor(private readonly service: FolderService) {}

  @Get()
  @ApiOperation({ summary: 'List all folders' })
  @ApiOkResponse({ description: 'Every row. Unpaginated until the rest of the CRUD surface lands.' })
  async listAll(): Promise<FolderSnapshot[]> {
    const items = await this.service.listAll();
    // Snapshots rather than entities: the envelope interceptor serialises
    // whatever it is handed, and an entity's shape is a domain decision that
    // should not silently become the wire contract.
    return items.map((item) => item.toSnapshot());
  }
}
