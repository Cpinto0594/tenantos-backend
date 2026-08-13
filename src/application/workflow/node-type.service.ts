import { Inject, Injectable } from '@nestjs/common';
import type { NodeType } from '@domain/workflow/node-type.entity';
import { NodeTypeNotFoundError } from '@domain/workflow/node-type.errors';
import {
  NODE_TYPE_REPOSITORY,
  type NodeTypeRepositoryPort,
} from '@domain/workflow/node-type.repository.port';
import { InlineLogger } from '@infrastructure/logging/inline-logger';

@Injectable()
export class NodeTypeService {
  constructor(
    @Inject(NODE_TYPE_REPOSITORY) private readonly repository: NodeTypeRepositoryPort,
    private readonly inline: InlineLogger,
  ) {}

  async listAll(): Promise<NodeType[]> {
    const done = this.inline.start(NodeTypeService.name, 'listAll');
    const items = await this.repository.findAllEnabled();
    done({ count: items.length });
    return items;
  }

  async getByName(name: string): Promise<NodeType> {
    const done = this.inline.start(NodeTypeService.name, 'getByName');
    const item = await this.repository.findByName(name);
    if (!item) throw new NodeTypeNotFoundError(name);
    done({ id: item.id });
    return item;
  }
}
