import { Global, Module } from '@nestjs/common';
import { REFRESH_TOKEN_REPOSITORY } from '@domain/auth/auth.ports';
import { USER_REPOSITORY } from '@domain/user/user.repository.port';
import { PrismaService } from './prisma.service';
import { PrismaRefreshTokenRepository } from './repositories/prisma-refresh-token.repository';
import { PrismaUserRepository } from './repositories/prisma-user.repository';

/**
 * Binds the domain's repository *ports* to their Prisma *adapters*.
 *
 * This module is the only place in the application that names both sides. A use
 * case injects `USER_REPOSITORY` and receives something satisfying
 * `UserRepositoryPort`; it cannot reach PrismaUserRepository even by accident,
 * because that class is not exported from here.
 *
 * Global because repositories are needed by most feature modules and the
 * bindings are process-wide singletons; re-importing this module everywhere
 * would be ceremony with no benefit.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: REFRESH_TOKEN_REPOSITORY, useClass: PrismaRefreshTokenRepository },
  ],
  exports: [PrismaService, USER_REPOSITORY, REFRESH_TOKEN_REPOSITORY],
})
export class DatabaseModule {}
