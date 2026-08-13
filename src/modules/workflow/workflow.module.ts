import { Module } from '@nestjs/common';
import { WorkflowService } from '@application/workflow/workflow.service';
import { WorkflowVersionService } from '@application/workflow/workflow-version.service';
import { WorkflowNodeService } from '@application/workflow/workflow-node.service';
import { WorkflowNodeSettingsService } from '@application/workflow/workflow-node-settings.service';
import { WorkflowEdgeService } from '@application/workflow/workflow-edge.service';
import { WorkflowTriggerService } from '@application/workflow/workflow-trigger.service';
import { NodeTypeService } from '@application/workflow/node-type.service';
import { WorkflowController } from './workflow.controller';
import { WorkflowVersionController } from './workflow-version.controller';
import { WorkflowNodeController } from './workflow-node.controller';
import { WorkflowNodeSettingsController } from './workflow-node-settings.controller';
import { WorkflowEdgeController } from './workflow-edge.controller';
import { WorkflowTriggerController } from './workflow-trigger.controller';
import { NodeTypeController } from './node-type.controller';

/**
 * Workflows, versions, nodes, edges and triggers.
 *
 * Only the read side exists so far. The repository bindings live in
 * DatabaseModule, which stays the single place naming both a port and its
 * Prisma adapter.
 */
@Module({
  controllers: [
    WorkflowController,
    WorkflowVersionController,
    WorkflowNodeController,
    WorkflowNodeSettingsController,
    WorkflowEdgeController,
    WorkflowTriggerController,
    NodeTypeController,
  ],
  providers: [
    WorkflowService,
    WorkflowVersionService,
    WorkflowNodeService,
    WorkflowNodeSettingsService,
    WorkflowEdgeService,
    WorkflowTriggerService,
    NodeTypeService,
  ],
})
export class WorkflowModule {}
