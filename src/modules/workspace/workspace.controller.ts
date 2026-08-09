import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { Workflow } from '@domain/workflow/workflow.entity';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
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
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateCredentialDto } from './dto/update-credential.dto';
import { UpdateVariableDto } from './dto/update-variable.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';

const NOT_FOUND_WORKSPACE = 'WORKSPACE_NOT_FOUND — no such workspace, or it is not yours.';
const NOT_FOUND_FOLDER = `${NOT_FOUND_WORKSPACE} FOLDER_NOT_FOUND — no such folder in that workspace.`;
const NOT_FOUND_WORKFLOW = `${NOT_FOUND_FOLDER} WORKFLOW_NOT_FOUND — no such workflow in that folder.`;
const NOT_FOUND_VARIABLE = `${NOT_FOUND_FOLDER} VARIABLE_NOT_FOUND — no such variable in that folder.`;
const NOT_FOUND_CREDENTIAL = `${NOT_FOUND_FOLDER} CREDENTIAL_NOT_FOUND — no such credential in that folder.`;

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

  @Post()
  @ApiOperation({
    summary: 'Provision a workspace',
    description: 'The slug is derived from `name` unless one is supplied. Owned by the caller.',
  })
  @ApiCreatedResponse({ description: 'The workspace as created.' })
  @ApiConflictResponse({ description: 'WORKSPACE_SLUG_TAKEN — you already have a workspace with that slug.' })
  async createWorkspace(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateWorkspaceDto,
  ): Promise<WorkspaceSnapshot> {
    const workspace = await this.service.createWorkspace(userId, dto);
    return workspace.toSnapshot();
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
  ): Promise<Workflow[]> {
    const items = await this.service.listFolderWorkflows(workspaceId, folderId, userId);
    return items;
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
  ): Promise<Workflow> {
    const created = await this.service.createWorkflow(workspaceId, folderId, userId, dto);
    return created;
  }

  @Patch(':workspaceId/folders/:folderId/workflows/:workflowId')
  @ApiOperation({
    summary: 'Update a workflow in a folder',
    description:
      'Every field is optional; only what is supplied is changed. This edits the workflow row ' +
      'itself — name, slug, description, settings, metadata — not its version content.',
  })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiParam({ name: 'folderId', format: 'uuid' })
  @ApiParam({ name: 'workflowId', format: 'uuid' })
  @ApiOkResponse({
    description: 'The workflow as updated, with its current version inlined under `version`.',
  })
  @ApiNotFoundResponse({ description: NOT_FOUND_WORKFLOW })
  @ApiConflictResponse({ description: 'WORKFLOW_SLUG_TAKEN — that slug is already used in this workspace.' })
  async updateWorkflow(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateWorkflowDto,
  ): Promise<Workflow> {
    const updated = await this.service.updateWorkflow(workspaceId, folderId, workflowId, userId, dto);
    return updated;
  }

  @Delete(':workspaceId/folders/:folderId/workflows/:workflowId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a workflow from a folder' })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiParam({ name: 'folderId', format: 'uuid' })
  @ApiParam({ name: 'workflowId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'The workflow was deleted.' })
  @ApiNotFoundResponse({ description: NOT_FOUND_WORKFLOW })
  async deleteWorkflow(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
    @Param('workflowId', ParseUUIDPipe) workflowId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<void> {
    await this.service.deleteWorkflow(workspaceId, folderId, workflowId, userId);
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

  @Patch(':workspaceId/folders/:folderId/variables/:variableId')
  @ApiOperation({ summary: 'Update a variable in a folder' })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiParam({ name: 'folderId', format: 'uuid' })
  @ApiParam({ name: 'variableId', format: 'uuid' })
  @ApiOkResponse({ description: 'The variable as updated.' })
  @ApiNotFoundResponse({ description: NOT_FOUND_VARIABLE })
  @ApiConflictResponse({
    description: 'VARIABLE_NAME_TAKEN — names are unique per workspace, not per folder.',
  })
  async updateVariable(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
    @Param('variableId', ParseUUIDPipe) variableId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateVariableDto,
  ): Promise<VariableSnapshot> {
    const variable = await this.service.updateVariable(workspaceId, folderId, variableId, userId, dto);
    return variable.toSnapshot();
  }

  @Delete(':workspaceId/folders/:folderId/variables/:variableId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a variable from a folder' })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiParam({ name: 'folderId', format: 'uuid' })
  @ApiParam({ name: 'variableId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'The variable was deleted.' })
  @ApiNotFoundResponse({ description: NOT_FOUND_VARIABLE })
  async deleteVariable(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
    @Param('variableId', ParseUUIDPipe) variableId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<void> {
    await this.service.deleteVariable(workspaceId, folderId, variableId, userId);
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

  @Patch(':workspaceId/folders/:folderId/credentials/:credentialId')
  @ApiOperation({
    summary: 'Update a credential in a folder',
    description:
      'Every field is optional; only what is supplied is changed. `credentials`, when supplied, ' +
      'replaces the stored payload wholesale — see UpdateCredentialDto.',
  })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiParam({ name: 'folderId', format: 'uuid' })
  @ApiParam({ name: 'credentialId', format: 'uuid' })
  @ApiOkResponse({ description: 'The credential as updated, without its secret payload.' })
  @ApiNotFoundResponse({ description: NOT_FOUND_CREDENTIAL })
  @ApiConflictResponse({
    description: 'CREDENTIAL_NAME_TAKEN — names are unique per workspace, not per folder.',
  })
  async updateCredential(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
    @Param('credentialId', ParseUUIDPipe) credentialId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateCredentialDto,
  ): Promise<CredentialSummary> {
    const connection = await this.service.updateCredential(workspaceId, folderId, credentialId, userId, dto);
    return toCredentialSummary(connection);
  }

  @Delete(':workspaceId/folders/:folderId/credentials/:credentialId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a credential from a folder' })
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @ApiParam({ name: 'folderId', format: 'uuid' })
  @ApiParam({ name: 'credentialId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'The credential was deleted.' })
  @ApiNotFoundResponse({ description: NOT_FOUND_CREDENTIAL })
  async deleteCredential(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('folderId', ParseUUIDPipe) folderId: string,
    @Param('credentialId', ParseUUIDPipe) credentialId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<void> {
    await this.service.deleteCredential(workspaceId, folderId, credentialId, userId);
  }
}
