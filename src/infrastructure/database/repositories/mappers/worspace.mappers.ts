import type { Workspace as PrismaWorkspace } from '@prisma/client';
import { Workspace } from '@domain/workspace/workspace.entity';
import { asJsonObject } from './utils';

export function toWorkspaceEntity(row: PrismaWorkspace): Workspace {
  return Workspace.fromSnapshot({
    id: row.id,
    userId: row.userId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    status: row.status,
    isDefault: row.isDefault,
    settings: asJsonObject(row.settings),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
