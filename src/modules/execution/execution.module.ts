import { Module } from '@nestjs/common';
import { ExecutionQueueItemService } from '@application/execution/execution-queue-item.service';
import { WorkflowExecutionService } from '@application/execution/workflow-execution.service';
import { ExecutionStepService } from '@application/execution/execution-step.service';
import { ExecutionQueueItemController } from './execution-queue-item.controller';
import { WorkflowExecutionController } from './workflow-execution.controller';
import { ExecutionStepController } from './execution-step.controller';

/**
 * The execution queue, runs, and their steps.
 *
 * Only the read side exists so far. The repository bindings live in
 * DatabaseModule, which stays the single place naming both a port and its
 * Prisma adapter.
 */
@Module({
  controllers: [ExecutionQueueItemController, WorkflowExecutionController, ExecutionStepController],
  providers: [ExecutionQueueItemService, WorkflowExecutionService, ExecutionStepService],
})
export class ExecutionModule {}
