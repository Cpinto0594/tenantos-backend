import { Prisma } from '@prisma/client';

const workflowWithVersionValidator = Prisma.validator<Prisma.WorkflowDefaultArgs>()({
  include: { version: true },
});

export type WorkflowWithRelations = Prisma.WorkflowGetPayload<typeof workflowWithVersionValidator>;

export const WITH_CURRENT_VERSION = {
  version: true,
} as const satisfies Prisma.WorkflowInclude;
