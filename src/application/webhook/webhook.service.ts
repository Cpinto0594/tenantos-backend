import { Inject, Injectable } from '@nestjs/common';
import type { Webhook } from '@domain/webhook/webhook.entity';
import { WEBHOOK_REPOSITORY, type WebhookRepositoryPort } from '@domain/webhook/webhook.repository.port';
import { InlineLogger } from '@infrastructure/logging/inline-logger';

@Injectable()
export class WebhookService {
  constructor(
    @Inject(WEBHOOK_REPOSITORY) private readonly repository: WebhookRepositoryPort,
    private readonly inline: InlineLogger,
  ) {}

  async listAll(): Promise<Webhook[]> {
    const done = this.inline.start(WebhookService.name, 'listAll');
    const items = await this.repository.findAll();
    done({ count: items.length });
    return items;
  }
}
