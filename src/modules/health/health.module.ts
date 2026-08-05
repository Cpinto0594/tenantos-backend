import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './indicators/prisma.indicator';
import { RedisHealthIndicator } from './indicators/redis.indicator';

@Module({
  imports: [
    TerminusModule.forRoot({
      // Terminus logs a stack trace per failed check by default. During an
      // outage the probes run every few seconds across every replica, which
      // buries the actual error under thousands of duplicates.
      errorLogStyle: 'pretty',
    }),
  ],
  controllers: [HealthController],
  providers: [PrismaHealthIndicator, RedisHealthIndicator],
})
export class HealthModule {}
