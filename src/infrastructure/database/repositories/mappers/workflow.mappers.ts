import type {
  Workflow as PrismaWorkflow,
  WorkflowVersion as PrismaWorkflowVersion,
  WorkflowNode as PrismaWorkflowNode,
  WorkflowNodeSettings as PrismaWorkflowNodeSettings,
  WorkflowEdge as PrismaWorkflowEdge,
  WorkflowTrigger as PrismaWorkflowTrigger,
  Connection as PrismaConnection,
  WorkflowNodeConnection as PrismaWorkflowNodeConnection,
  ConnectionType as PrismaConnectionType,
  Webhook as PrismaWebhook,
  Schedule as PrismaSchedule,
  ExecutionQueueItem as PrismaExecutionQueueItem,
  WorkflowExecution as PrismaWorkflowExecution,
  ExecutionStep as PrismaExecutionStep,
} from '@prisma/client';
import { Workflow } from '@domain/workflow/workflow.entity';
import { WorkflowVersion } from '@domain/workflow/workflow-version.entity';
import { WorkflowNode } from '@domain/workflow/workflow-node.entity';
import { WorkflowNodeSettings } from '@domain/workflow/workflow-node-settings.entity';
import { WorkflowEdge } from '@domain/workflow/workflow-edge.entity';
import { WorkflowTrigger } from '@domain/workflow/workflow-trigger.entity';

import { Connection } from '@domain/connection/connection.entity';
import { WorkflowNodeConnection } from '@domain/connection/workflow-node-connection.entity';
import { ConnectionType } from '@domain/connection/connection-type.entity';
import { Webhook } from '@domain/webhook/webhook.entity';
import { Schedule } from '@domain/schedule/schedule.entity';
import { ExecutionQueueItem } from '@domain/execution/execution-queue-item.entity';
import { WorkflowExecution } from '@domain/execution/workflow-execution.entity';
import { ExecutionStep } from '@domain/execution/execution-step.entity';
import { asJsonObject, toMillis } from './utils';

export function toWorkflowEntity(row: PrismaWorkflow): Workflow {
  return Workflow.fromSnapshot({
    id: row.id,
    workspaceId: row.workspaceId,
    folderId: row.folderId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status,
    active: row.active,
    currentVersionId: row.currentVersionId,
    createdBy: row.createdBy,
    settings: asJsonObject(row.settings),
    metadata: asJsonObject(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toWorkflowWithRelationsEntity(
  row: PrismaWorkflow & { version: PrismaWorkflowVersion | null },
): Workflow {
  const workflow = toWorkflowEntity(row);
  const version = row.version ? toWorkflowVersionEntity(row.version) : null;
  return Workflow.fromSnapshot({ ...workflow, version });
}

export function toWorkflowVersionEntity(row: PrismaWorkflowVersion): WorkflowVersion {
  return WorkflowVersion.fromSnapshot({
    id: row.id,
    workflowId: row.workflowId,
    version: row.version,
    status: row.status,
    workflowJson: asJsonObject(row.workflowJson),
    changeSummary: row.changeSummary,
    createdBy: row.createdBy,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
  });
}

export function toWorkflowNodeEntity(row: PrismaWorkflowNode): WorkflowNode {
  return WorkflowNode.fromSnapshot({
    id: row.id,
    workflowVersionId: row.workflowVersionId,
    nodeKey: row.nodeKey,
    type: row.type,
    name: row.name,
    description: row.description,
    positionX: row.positionX,
    positionY: row.positionY,
    width: row.width,
    height: row.height,
    enabled: row.enabled,
    config: asJsonObject(row.config),
    metadata: asJsonObject(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toWorkflowNodeSettingsEntity(row: PrismaWorkflowNodeSettings): WorkflowNodeSettings {
  return WorkflowNodeSettings.fromSnapshot({
    id: row.id,
    nodeId: row.nodeId,
    timeoutMs: row.timeoutMs,
    retryEnabled: row.retryEnabled,
    retryCount: row.retryCount,
    retryDelayMs: row.retryDelayMs,
    retryStrategy: row.retryStrategy,
    continueOnError: row.continueOnError,
    alwaysExecute: row.alwaysExecute,
    executionCondition: row.executionCondition,
    concurrencyLimit: row.concurrencyLimit,
    cacheEnabled: row.cacheEnabled,
    cacheTtlSeconds: row.cacheTtlSeconds,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toWorkflowEdgeEntity(row: PrismaWorkflowEdge): WorkflowEdge {
  return WorkflowEdge.fromSnapshot({
    id: row.id,
    workflowVersionId: row.workflowVersionId,
    sourceNodeId: row.sourceNodeId,
    targetNodeId: row.targetNodeId,
    sourcePort: row.sourcePort,
    targetPort: row.targetPort,
    edgeType: row.edgeType,
    label: row.label,
    config: asJsonObject(row.config),
    createdAt: row.createdAt,
  });
}

export function toWorkflowTriggerEntity(row: PrismaWorkflowTrigger): WorkflowTrigger {
  return WorkflowTrigger.fromSnapshot({
    id: row.id,
    workflowId: row.workflowId,
    type: row.type,
    config: asJsonObject(row.config),
    enabled: row.enabled,
  });
}

export function toConnectionEntity(row: PrismaConnection): Connection {
  return Connection.fromSnapshot({
    id: row.id,
    workspaceId: row.workspaceId,
    folderId: row.folderId,
    name: row.name,
    type: row.type,
    provider: row.provider,
    credentials: asJsonObject(row.credentials),
    encrypted: row.encrypted,
    status: row.status,
    metadata: asJsonObject(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toWorkflowNodeConnectionEntity(row: PrismaWorkflowNodeConnection): WorkflowNodeConnection {
  return WorkflowNodeConnection.fromSnapshot({
    nodeId: row.nodeId,
    connectionId: row.connectionId,
    purpose: row.purpose,
  });
}

export function toConnectionTypeEntity(row: PrismaConnectionType): ConnectionType {
  return ConnectionType.fromSnapshot({
    id: row.id,
    name: row.name,
    type: row.type,
    provider: row.provider,
    schema: asJsonObject(row.schema),
    createdAt: row.createdAt,
  });
}

export function toWebhookEntity(row: PrismaWebhook): Webhook {
  return Webhook.fromSnapshot({
    id: row.id,
    workflowId: row.workflowId,
    triggerId: row.triggerId,
    name: row.name,
    path: row.path,
    method: row.method,
    authenticationType: row.authenticationType,
    authenticationConfig: asJsonObject(row.authenticationConfig),
    responseMode: row.responseMode,
    responseConfig: asJsonObject(row.responseConfig),
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toScheduleEntity(row: PrismaSchedule): Schedule {
  return Schedule.fromSnapshot({
    id: row.id,
    workflowId: row.workflowId,
    triggerId: row.triggerId,
    name: row.name,
    type: row.type,
    cronExpression: row.cronExpression,
    misfirePolicy: row.misfirePolicy,
    intervalValue: row.intervalValue,
    intervalUnit: row.intervalUnit,
    timezone: row.timezone,
    enabled: row.enabled,
    nextRunAt: row.nextRunAt,
    lastRunAt: row.lastRunAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toExecutionQueueItemEntity(row: PrismaExecutionQueueItem): ExecutionQueueItem {
  return ExecutionQueueItem.fromSnapshot({
    id: row.id,
    workflowId: row.workflowId,
    workflowVersionId: row.workflowVersionId,
    triggerType: row.triggerType,
    triggerId: row.triggerId,
    payload: asJsonObject(row.payload),
    priority: row.priority,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    availableAt: row.availableAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    lockedBy: row.lockedBy,
    lockedUntil: row.lockedUntil,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toWorkflowExecutionEntity(row: PrismaWorkflowExecution): WorkflowExecution {
  return WorkflowExecution.fromSnapshot({
    id: row.id,
    workflowId: row.workflowId,
    version: row.version,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    durationMs: toMillis(row.durationMs),
    triggerType: row.triggerType,
    input: row.input === null ? null : asJsonObject(row.input),
    output: row.output === null ? null : asJsonObject(row.output),
    errorMessage: row.errorMessage,
  });
}

export function toExecutionStepEntity(row: PrismaExecutionStep): ExecutionStep {
  return ExecutionStep.fromSnapshot({
    id: row.id,
    executionId: row.executionId,
    nodeId: row.nodeId,
    parentStepId: row.parentStepId,
    status: row.status,
    attempt: row.attempt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    durationMs: toMillis(row.durationMs),
    input: asJsonObject(row.input),
    output: asJsonObject(row.output),
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    metadata: asJsonObject(row.metadata),
    createdAt: row.createdAt,
  });
}
