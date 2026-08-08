import { Module } from '@nestjs/common';
import { ConnectionService } from '@application/connection/connection.service';
import { WorkflowNodeConnectionService } from '@application/connection/workflow-node-connection.service';
import { ConnectionTypeService } from '@application/connection/connection-type.service';
import { ConnectionController } from './connection.controller';
import { WorkflowNodeConnectionController } from './workflow-node-connection.controller';
import { ConnectionTypeController } from './connection-type.controller';

/**
 * Connections, their types, and node bindings.
 *
 * Only the read side exists so far. The repository bindings live in
 * DatabaseModule, which stays the single place naming both a port and its
 * Prisma adapter.
 */
@Module({
  controllers: [ConnectionController, WorkflowNodeConnectionController, ConnectionTypeController],
  providers: [ConnectionService, WorkflowNodeConnectionService, ConnectionTypeService],
})
export class ConnectionModule {}
