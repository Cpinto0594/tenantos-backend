import { Inject, Injectable } from '@nestjs/common';
import type { Connection } from '@domain/connection/connection.entity';
import {
  CONNECTION_REPOSITORY,
  type ConnectionRepositoryPort,
} from '@domain/connection/connection.repository.port';
import { InlineLogger } from '@infrastructure/logging/inline-logger';

@Injectable()
export class ConnectionService {
  constructor(
    @Inject(CONNECTION_REPOSITORY) private readonly repository: ConnectionRepositoryPort,
    private readonly inline: InlineLogger,
  ) {}

  async listAll(): Promise<Connection[]> {
    const done = this.inline.start(ConnectionService.name, 'listAll');
    const items = await this.repository.findAll();
    done({ count: items.length });
    return items;
  }
}
