import { Module } from '@nestjs/common';
import { VariableService } from '@application/variable/variable.service';
import { VariableController } from './variable.controller';

/**
 * Workspace variables.
 *
 * Only the read side exists so far. The repository bindings live in
 * DatabaseModule, which stays the single place naming both a port and its
 * Prisma adapter.
 */
@Module({
  controllers: [VariableController],
  providers: [VariableService],
})
export class VariableModule {}
