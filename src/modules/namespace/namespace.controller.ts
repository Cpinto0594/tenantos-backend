import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NamespaceService } from '@application/namespace/namespace.service';
import type { NamespaceSnapshot } from '@application/namespace/namespace.types';
import { toWorkflowWithCurrentVersion } from '@application/workflow/workflow.views';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';

@ApiTags('namespaces')
@ApiBearerAuth()
@Controller('namespaces')
export class NamespaceController {
  constructor(private readonly service: NamespaceService) {}

  @Get('get')
  @ApiOperation({
    summary: 'Everything the signed-in user owns',
    description:
      'Their workspaces, plus every folder and workflow inside those workspaces. Scoped to the ' +
      'principal on the request — there is no way to ask for another user’s namespace.',
  })
  @ApiOkResponse({
    description:
      'Three flat lists. Folders carry `workspaceId` and workflows carry `workspaceId` and ' +
      '`folderId`, so the client builds whatever tree it wants. Unpaginated for now.',
  })
  async get(@CurrentUser('userId') userId: string): Promise<NamespaceSnapshot> {
    const namespace = await this.service.getForUser(userId);

    // Snapshots rather than entities: the envelope interceptor serialises
    // whatever it is handed, and an entity's shape is a domain decision that
    // should not silently become the wire contract.
    return {
      defaultWorkspace: namespace.defaultWorkspace?.toSnapshot() ?? null,
      defaultFolder: namespace.defaultFolder?.toSnapshot() ?? null,
      workspaces: namespace.workspaces.map((item) => item.toSnapshot()),
      folders: namespace.folders.map((item) => item.toSnapshot()),
      workflows: namespace.workflows.map(toWorkflowWithCurrentVersion),
    };
  }
}
