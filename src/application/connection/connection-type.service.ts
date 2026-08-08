import { Inject, Injectable } from '@nestjs/common';
import type { ConnectionType } from '@domain/connection/connection-type.entity';
import {
  CONNECTION_TYPE_REPOSITORY,
  type ConnectionTypeRepositoryPort,
} from '@domain/connection/connection-type.repository.port';
import { InlineLogger } from '@infrastructure/logging/inline-logger';

@Injectable()
export class ConnectionTypeService {
  constructor(
    @Inject(CONNECTION_TYPE_REPOSITORY) private readonly repository: ConnectionTypeRepositoryPort,
    private readonly inline: InlineLogger,
  ) {}

  async listAll(): Promise<ConnectionType[]> {
    const done = this.inline.start(ConnectionTypeService.name, 'listAll');
    const items = await this.repository.findAll();
    done({ count: items.length });
    return items;
  }
}
