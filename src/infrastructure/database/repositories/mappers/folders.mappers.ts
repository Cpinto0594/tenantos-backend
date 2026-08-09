import type { Folder as PrismaFolder } from '@prisma/client';
import { Folder } from '@domain/folder/folder.entity';


export function toFolderEntity(row: PrismaFolder): Folder {
  return Folder.fromSnapshot({
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
