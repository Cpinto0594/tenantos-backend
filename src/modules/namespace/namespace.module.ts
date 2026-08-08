import { Module } from '@nestjs/common';
import { NamespaceService } from '@application/namespace/namespace.service';
import { NamespaceController } from './namespace.controller';

/**
 * The signed-in user's namespace: one read spanning workspaces, folders and
 * workflows.
 *
 * A module of its own rather than another route on WorkspaceController, because
 * it is not a workspace operation — it reads across three resources and is
 * keyed by the principal, not by a workspace id. The repository bindings live
 * in DatabaseModule, which stays the single place naming both a port and its
 * Prisma adapter.
 */
@Module({
  controllers: [NamespaceController],
  providers: [NamespaceService],
})
export class NamespaceModule {}
