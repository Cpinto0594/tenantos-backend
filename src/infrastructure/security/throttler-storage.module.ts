import { Module } from '@nestjs/common';
import { RedisThrottlerStorage } from './redis-throttler.storage';

/**
 * Exists so `ThrottlerModule.forRootAsync` can inject the storage.
 *
 * An async factory resolves its dependencies in the *dynamic module's* injector,
 * not in the module that declares it — so a provider listed in AppModule is
 * invisible to it. Wrapping the storage in its own module and importing that is
 * the supported way to hand a provider to a dynamic module's factory.
 */
@Module({
  providers: [RedisThrottlerStorage],
  exports: [RedisThrottlerStorage],
})
export class ThrottlerStorageModule {}
