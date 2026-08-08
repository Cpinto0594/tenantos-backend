import { Global, Module } from '@nestjs/common';
import { REFRESH_TOKEN_REPOSITORY } from '@domain/auth/auth.ports';
import { USER_REPOSITORY } from '@domain/user/user.repository.port';
import { WORKSPACE_REPOSITORY } from '@domain/workspace/workspace.repository.port';
import { FOLDER_REPOSITORY } from '@domain/folder/folder.repository.port';
import { WORKFLOW_REPOSITORY } from '@domain/workflow/workflow.repository.port';
import { WORKFLOW_VERSION_REPOSITORY } from '@domain/workflow/workflow-version.repository.port';
import { WORKFLOW_NODE_REPOSITORY } from '@domain/workflow/workflow-node.repository.port';
import { WORKFLOW_NODE_SETTINGS_REPOSITORY } from '@domain/workflow/workflow-node-settings.repository.port';
import { WORKFLOW_EDGE_REPOSITORY } from '@domain/workflow/workflow-edge.repository.port';
import { WORKFLOW_TRIGGER_REPOSITORY } from '@domain/workflow/workflow-trigger.repository.port';
import { VARIABLE_REPOSITORY } from '@domain/variable/variable.repository.port';
import { CONNECTION_REPOSITORY } from '@domain/connection/connection.repository.port';
import { WORKFLOW_NODE_CONNECTION_REPOSITORY } from '@domain/connection/workflow-node-connection.repository.port';
import { CONNECTION_TYPE_REPOSITORY } from '@domain/connection/connection-type.repository.port';
import { WEBHOOK_REPOSITORY } from '@domain/webhook/webhook.repository.port';
import { SCHEDULE_REPOSITORY } from '@domain/schedule/schedule.repository.port';
import { EXECUTION_QUEUE_ITEM_REPOSITORY } from '@domain/execution/execution-queue-item.repository.port';
import { WORKFLOW_EXECUTION_REPOSITORY } from '@domain/execution/workflow-execution.repository.port';
import { EXECUTION_STEP_REPOSITORY } from '@domain/execution/execution-step.repository.port';
import { PrismaService } from './prisma.service';
import { PrismaRefreshTokenRepository } from './repositories/prisma-refresh-token.repository';
import { PrismaUserRepository } from './repositories/prisma-user.repository';
import { PrismaWorkspaceRepository } from './repositories/prisma-workspace.repository';
import { PrismaFolderRepository } from './repositories/prisma-folder.repository';
import { PrismaWorkflowRepository } from './repositories/prisma-workflow.repository';
import { PrismaWorkflowVersionRepository } from './repositories/prisma-workflow-version.repository';
import { PrismaWorkflowNodeRepository } from './repositories/prisma-workflow-node.repository';
import { PrismaWorkflowNodeSettingsRepository } from './repositories/prisma-workflow-node-settings.repository';
import { PrismaWorkflowEdgeRepository } from './repositories/prisma-workflow-edge.repository';
import { PrismaWorkflowTriggerRepository } from './repositories/prisma-workflow-trigger.repository';
import { PrismaVariableRepository } from './repositories/prisma-variable.repository';
import { PrismaConnectionRepository } from './repositories/prisma-connection.repository';
import { PrismaWorkflowNodeConnectionRepository } from './repositories/prisma-workflow-node-connection.repository';
import { PrismaConnectionTypeRepository } from './repositories/prisma-connection-type.repository';
import { PrismaWebhookRepository } from './repositories/prisma-webhook.repository';
import { PrismaScheduleRepository } from './repositories/prisma-schedule.repository';
import { PrismaExecutionQueueItemRepository } from './repositories/prisma-execution-queue-item.repository';
import { PrismaWorkflowExecutionRepository } from './repositories/prisma-workflow-execution.repository';
import { PrismaExecutionStepRepository } from './repositories/prisma-execution-step.repository';

/**
 * Binds the domain's repository *ports* to their Prisma *adapters*.
 *
 * This module is the only place in the application that names both sides. A use
 * case injects `USER_REPOSITORY` and receives something satisfying
 * `UserRepositoryPort`; it cannot reach PrismaUserRepository even by accident,
 * because that class is not exported from here.
 *
 * Global because repositories are needed by most feature modules and the
 * bindings are process-wide singletons; re-importing this module everywhere
 * would be ceremony with no benefit.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: PrismaRefreshTokenRepository },

    // --- Workflow resources -------------------------------------------------
    { provide: WORKSPACE_REPOSITORY, useClass: PrismaWorkspaceRepository },
    { provide: FOLDER_REPOSITORY, useClass: PrismaFolderRepository },
    { provide: WORKFLOW_REPOSITORY, useClass: PrismaWorkflowRepository },
    { provide: WORKFLOW_VERSION_REPOSITORY, useClass: PrismaWorkflowVersionRepository },
    { provide: WORKFLOW_NODE_REPOSITORY, useClass: PrismaWorkflowNodeRepository },
    { provide: WORKFLOW_NODE_SETTINGS_REPOSITORY, useClass: PrismaWorkflowNodeSettingsRepository },
    { provide: WORKFLOW_EDGE_REPOSITORY, useClass: PrismaWorkflowEdgeRepository },
    { provide: WORKFLOW_TRIGGER_REPOSITORY, useClass: PrismaWorkflowTriggerRepository },
    { provide: VARIABLE_REPOSITORY, useClass: PrismaVariableRepository },
    { provide: CONNECTION_REPOSITORY, useClass: PrismaConnectionRepository },
    { provide: WORKFLOW_NODE_CONNECTION_REPOSITORY, useClass: PrismaWorkflowNodeConnectionRepository },
    { provide: CONNECTION_TYPE_REPOSITORY, useClass: PrismaConnectionTypeRepository },
    { provide: WEBHOOK_REPOSITORY, useClass: PrismaWebhookRepository },
    { provide: SCHEDULE_REPOSITORY, useClass: PrismaScheduleRepository },
    { provide: EXECUTION_QUEUE_ITEM_REPOSITORY, useClass: PrismaExecutionQueueItemRepository },
    { provide: WORKFLOW_EXECUTION_REPOSITORY, useClass: PrismaWorkflowExecutionRepository },
    { provide: EXECUTION_STEP_REPOSITORY, useClass: PrismaExecutionStepRepository },
  ],
  exports: [
    PrismaService,
    USER_REPOSITORY,
    REFRESH_TOKEN_REPOSITORY,
    WORKSPACE_REPOSITORY,
    FOLDER_REPOSITORY,
    WORKFLOW_REPOSITORY,
    WORKFLOW_VERSION_REPOSITORY,
    WORKFLOW_NODE_REPOSITORY,
    WORKFLOW_NODE_SETTINGS_REPOSITORY,
    WORKFLOW_EDGE_REPOSITORY,
    WORKFLOW_TRIGGER_REPOSITORY,
    VARIABLE_REPOSITORY,
    CONNECTION_REPOSITORY,
    WORKFLOW_NODE_CONNECTION_REPOSITORY,
    CONNECTION_TYPE_REPOSITORY,
    WEBHOOK_REPOSITORY,
    SCHEDULE_REPOSITORY,
    EXECUTION_QUEUE_ITEM_REPOSITORY,
    WORKFLOW_EXECUTION_REPOSITORY,
    EXECUTION_STEP_REPOSITORY,
  ],
})
export class DatabaseModule {}
