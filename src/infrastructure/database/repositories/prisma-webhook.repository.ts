import { Injectable } from '@nestjs/common';
import type { Webhook } from '@domain/webhook/webhook.entity';
import type { WebhookRepositoryPort } from '@domain/webhook/webhook.repository.port';
import { PrismaService } from '../prisma.service';
import { toWebhookEntity } from './mappers/workflow.mappers';
import { toInfrastructureError } from '../prisma-error';

@Injectable()
export class PrismaWebhookRepository implements WebhookRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async findAll(): Promise<Webhook[]> {
    try {
      const rows = await this.db.webhook.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toWebhookEntity);
    } catch (error) {
      throw toInfrastructureError(error, 'webhook.findAll');
    }
  }
}
