import { Module } from '@nestjs/common';
import { WorkspaceService } from '@application/workspace/workspace.service';
import { WorkspaceController } from './workspace.controller';

/**
 * Workspaces.
 *
 * Only the read side exists so far. The repository bindings live in
 * DatabaseModule, which stays the single place naming both a port and its
 * Prisma adapter.
 */
@Module({
  controllers: [WorkspaceController],
  providers: [WorkspaceService],
})
export class WorkspaceModule {}
