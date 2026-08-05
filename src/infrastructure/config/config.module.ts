import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import { validateEnv } from './env.schema';

/**
 * Global because *everything* needs config and threading an import through 20
 * modules to reach it is noise. This is one of exactly two globals in the app
 * (the other is the shared kernel) — the rest are imported explicitly so the
 * dependency graph stays readable.
 *
 * File precedence, first match wins:
 *   .env.{NODE_ENV}.local   — personal overrides, git-ignored
 *   .env.{NODE_ENV}         — committed per-environment defaults
 *   .env                    — local catch-all, git-ignored
 *
 * Real deployments set no files at all: variables come from the orchestrator,
 * and `ignoreEnvFile` is irrelevant because none of these files ship in the
 * image (.dockerignore excludes them).
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV ?? 'development'}.local`,
        `.env.${process.env.NODE_ENV ?? 'development'}`,
        '.env',
      ],
      // Zod runs here, before any provider is constructed. An invalid
      // environment throws during module init and the process exits non-zero —
      // the container never reports healthy, so a bad config never takes traffic.
      validate: validateEnv,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
