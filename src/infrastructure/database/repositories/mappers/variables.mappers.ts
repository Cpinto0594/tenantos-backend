import { Variable as PrismaVariable } from '@prisma/client';
import { Variable } from '@domain/variable/variable.entity';

export function toVariableEntity(row: PrismaVariable): Variable {
  return Variable.fromSnapshot({
    id: row.id,
    workspaceId: row.workspaceId,
    folderId: row.folderId,
    name: row.name,
    value: row.value,
    encrypted: row.encrypted,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
