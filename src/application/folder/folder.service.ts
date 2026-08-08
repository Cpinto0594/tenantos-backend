import { Inject, Injectable } from '@nestjs/common';
import type { Folder } from '@domain/folder/folder.entity';
import { FOLDER_REPOSITORY, type FolderRepositoryPort } from '@domain/folder/folder.repository.port';
import { InlineLogger } from '@infrastructure/logging/inline-logger';

@Injectable()
export class FolderService {
  constructor(
    @Inject(FOLDER_REPOSITORY) private readonly repository: FolderRepositoryPort,
    private readonly inline: InlineLogger,
  ) {}

  async listAll(): Promise<Folder[]> {
    const done = this.inline.start(FolderService.name, 'listAll');
    const items = await this.repository.findAll();
    done({ count: items.length });
    return items;
  }
}
