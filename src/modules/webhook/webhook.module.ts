import { Module } from '@nestjs/common';
import { WebhookService } from '@application/webhook/webhook.service';
import { WebhookController } from './webhook.controller';

/**
 * Webhook trigger surfaces.
 *
 * Only the read side exists so far. The repository bindings live in
 * DatabaseModule, which stays the single place naming both a port and its
 * Prisma adapter.
 */
@Module({
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
