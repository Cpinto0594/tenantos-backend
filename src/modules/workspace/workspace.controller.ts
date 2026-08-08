import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { WorkspaceService } from '@application/workspace/workspace.service';
import type { FolderSnapshot } from '@domain/folder/folder.entity';
import type { VariableSnapshot } from '@domain/variable/variable.entity';
import type { WorkspaceSnapshot } from '@domain/workspace/workspace.entity';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { type CredentialSummary, toCredentialSummary } from './credential-summary';
import { CreateCredentialDto } from './dto/create-credential.dto';
import { CreateVariableDto } from './dto/create-variable.dto';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import {
  type WorkflowWithVersion,
  type WorkflowWithCurrentVersionView,
  toWorkflowWithVersion,
  toWorkflowWithCurrentVersion,
} from '@application/workflow/workflow.views';

const NOT_FOUND_WORKSPACE = 'WORKSPACE_NOT_FOUND — no such workspace, or it is not yours.';
const NOT_FOUND_FOLDER = `${NOT_FOUND_WORKSPACE} FOLDER_NOT_FOUND — no such folder in that workspace.`;

@ApiTags('workspaces')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspaceController {
  constructor(private readonly service: WorkspaceService) {}

  @Get()
  @ApiOperation({ summary: 'List all workspaces' })
  @ApiOkResponse({ description: 'Every row. Unpaginated until the rest of the CRUD surface lands.' })
  async listAll(): Promise<WorkspaceSnapshot[]> {
    const items = await this.service.listAll();
    // Snapshots rather than entities: the envelope interceptor serialises
    // whatever it is handed, and an entity's shape is a domain decision that
    // should not silently become the wire contract.
    return items.map((item) => ({ ...item.toSnapshot(), userId: undefined }) as unknown as WorkspaceSnapshot);
  }

  @Get(':workspaceId/folders')
  @ApiOperation({ summary: 'List the folders in a workspace' })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiOkResponse({ description: 'Every folder in the workspace, by position. Unpaginated.' })
  @ApiNotFoundResponse({ description: NOT_FOUND_WORKSPACE })
  async listFolders(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<FolderSnapshot[]> {
    const items = await this.service.listFolders(workspaceId, userId);
    return items.map((item) => item.toSnapshot());
  }

  // --- Folder-scoped resources -----------------------------------------------
  // Workflows, variables and credentials all belong to a folder, so all six
  // routes below hang off one.
  //
  // Every one is scoped three ways: the workspace must be the caller's, the
  // folder must be in that workspace, and the query filters on the folder. The
  // first two live in WorkspaceService.assertFolder — without them,
  // `/workspaces/{mine}/folders/{theirs}/credentials` would read another
  // tenant's rows, since the foreign keys alone do not tie a folder to the
  // workspace in the path.
  //
  // A workspace or folder that exists but is not reachable by this caller
  // answers 404, not 403, so neither id can be probed for existence.

  @Get(':workspaceId/folders/:folderId/workflows')
  @ApiOperation({ summary: 'List the workflows in a folder' })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiParam({ name: 'folderId', format: 'uuid' })
  @ApiOkResponse({
    description:
      'Every workflow filed in the folder, newest first, each with the version `currentVersionId` ' +
      'names inlined under `version` — null only for rows predating versions-on-create. Unpaginated.',
  })
  @ApiNotFoundResponse({ description: NOT_FOUND_FOLDER })
  async listFolderWorkflows(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<WorkflowWithCurrentVersionView[]> {
    const items = await this.service.listFolderWorkflows(workspaceId, folderId, userId);
    return items.map(toWorkflowWithCurrentVersion);
  }

  @Post(':workspaceId/folders/:folderId/workflows')
  @ApiOperation({
    summary: 'Provision a workflow in a folder',
    description:
      'Creates the workflow row only — `draft`, inactive, and with no version yet. The slug is ' +
      'derived from `name` unless one is supplied.',
  })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiParam({ name: 'folderId', format: 'uuid' })
  @ApiCreatedResponse({
    description:
      'The workflow as created, with its version 1 inlined under `version`. `currentVersionId` ' +
      'equals `version.id`.',
  })
  @ApiNotFoundResponse({ description: NOT_FOUND_FOLDER })
  @ApiConflictResponse({ description: 'WORKFLOW_SLUG_TAKEN — that name is already used in this workspace.' })
  async createWorkflow(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateWorkflowDto,
  ): Promise<WorkflowWithVersion> {
    const created = await this.service.createWorkflow(workspaceId, folderId, userId, dto);
    return toWorkflowWithVersion(created);
  }

  @Get(':workspaceId/folders/:folderId/variables')
  @ApiOperation({ summary: 'List the variables in a folder' })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiParam({ name: 'folderId', format: 'uuid' })
  @ApiOkResponse({ description: 'Every variable in the folder, by name. Unpaginated.' })
  @ApiNotFoundResponse({ description: NOT_FOUND_FOLDER })
  async listFolderVariables(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<VariableSnapshot[]> {
    const items = await this.service.listFolderVariables(workspaceId, folderId, userId);
    return items.map((item) => item.toSnapshot());
  }

  @Post(':workspaceId/folders/:folderId/variables')
  @ApiOperation({ summary: 'Create a variable in a folder' })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiParam({ name: 'folderId', format: 'uuid' })
  @ApiCreatedResponse({ description: 'The variable as created.' })
  @ApiNotFoundResponse({ description: NOT_FOUND_FOLDER })
  @ApiConflictResponse({
    description: 'VARIABLE_NAME_TAKEN — names are unique per workspace, not per folder.',
  })
  async createVariable(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateVariableDto,
  ): Promise<VariableSnapshot> {
    const variable = await this.service.createVariable(workspaceId, folderId, userId, dto);
    return variable.toSnapshot();
  }

  @Get(':workspaceId/folders/:folderId/credentials')
  @ApiOperation({
    summary: 'List the credentials in a folder',
    description:
      'Connections, without their `credentials` payload — see CredentialSummary for why the secret ' +
      'material is not part of a list response.',
  })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiParam({ name: 'folderId', format: 'uuid' })
  @ApiOkResponse({ description: 'Every credential in the folder, newest first. Unpaginated.' })
  @ApiNotFoundResponse({ description: NOT_FOUND_FOLDER })
  async listFolderCredentials(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<CredentialSummary[]> {
    const items = await this.service.listFolderCredentials(workspaceId, folderId, userId);
    return items.map(toCredentialSummary);
  }

  @Post(':workspaceId/folders/:folderId/credentials')
  @ApiOperation({
    summary: 'Create a credential in a folder',
    description:
      'The `credentials` payload is write-only: the response is a CredentialSummary, which omits it. ' +
      'Note that it is stored unencrypted — the response reports `encrypted: false` rather than ' +
      'taking the column default, see WorkspaceService.createCredential.',
  })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiParam({ name: 'folderId', format: 'uuid' })
  @ApiCreatedResponse({ description: 'The credential as created, without its secret payload.' })
  @ApiNotFoundResponse({ description: NOT_FOUND_FOLDER })
  @ApiConflictResponse({
    description: 'CREDENTIAL_NAME_TAKEN — names are unique per workspace, not per folder.',
  })
  async createCredential(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateCredentialDto,
  ): Promise<CredentialSummary> {
    const connection = await this.service.createCredential(workspaceId, folderId, userId, dto);
    return toCredentialSummary(connection);
  }
}
