import { Module } from '@nestjs/common';
import { FolderService } from '@application/folder/folder.service';
import { FolderController } from './folder.controller';

/**
 * Folders.
 *
 * Only the read side exists so far. The repository bindings live in
 * DatabaseModule, which stays the single place naming both a port and its
 * Prisma adapter.
 */
@Module({
  controllers: [FolderController],
  providers: [FolderService],
})
export class FolderModule {}
