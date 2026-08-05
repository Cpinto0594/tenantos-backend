import { Injectable } from '@nestjs/common';
import { RefreshToken, type RevocationReason } from '@domain/auth/refresh-token.entity';
import type { RefreshTokenRepositoryPort } from '@domain/auth/auth.ports';
import { PrismaService } from '../prisma.service';
import { toRefreshTokenEntity } from '../prisma.mappers';
import { toInfrastructureError } from '../prisma-error';

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const row = await this.db.refreshToken.findUnique({ where: { tokenHash } });
    return row ? toRefreshTokenEntity(row) : null;
  }

  async create(token: RefreshToken): Promise<RefreshToken> {
    const s = token.toSnapshot();
    try {
      const row = await this.db.refreshToken.create({
        data: {
          id: s.id,
          userId: s.userId,
          familyId: s.familyId,
          tokenHash: s.tokenHash,
          expiresAt: s.expiresAt,
          userAgent: s.userAgent,
          ipAddress: s.ipAddress,
          createdAt: s.createdAt,
        },
      });
      return toRefreshTokenEntity(row);
    } catch (error) {
      throw toInfrastructureError(error, 'refreshToken.create');
    }
  }

  async save(token: RefreshToken): Promise<RefreshToken> {
    const s = token.toSnapshot();
    try {
      const row = await this.db.refreshToken.update({
        where: { id: s.id },
        // Only the revocation fields are mutable; everything else is set at
        // issue time and must never change.
        data: { revokedAt: s.revokedAt, revokedReason: s.revokedReason },
      });
      return toRefreshTokenEntity(row);
    } catch (error) {
      throw toInfrastructureError(error, 'refreshToken.save');
    }
  }

  /**
   * Single-use enforcement, as one conditional UPDATE.
   *
   * `revokedAt: null` in the filter is the compare half of a compare-and-swap:
   * Postgres serialises the row update, so of two concurrent refreshes with the
   * same token exactly one gets `count === 1`. The loser is reported as reuse,
   * which is the correct reading — the token was presented twice.
   */
  async consume(tokenId: string, reason: RevocationReason, at: Date): Promise<boolean> {
    const result = await this.db.refreshToken.updateMany({
      where: { id: tokenId, revokedAt: null },
      data: { revokedAt: at, revokedReason: reason },
    });
    return result.count === 1;
  }

  /**
   * The reuse-detection hammer: one UPDATE over the family index, so revoking a
   * compromised session is a single statement regardless of how many rotations
   * it went through.
   *
   * `revokedAt: null` in the filter preserves the original reason on rows that
   * were already revoked — losing a `reuse-detected` marker would erase the
   * evidence.
   */
  async revokeFamily(familyId: string, reason: RevocationReason, at: Date): Promise<number> {
    const result = await this.db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: at, revokedReason: reason },
    });
    return result.count;
  }

  async revokeAllForUser(userId: string, reason: RevocationReason, at: Date): Promise<number> {
    const result = await this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: at, revokedReason: reason },
    });
    return result.count;
  }

  async findActiveByUser(userId: string, now: Date): Promise<RefreshToken[]> {
    const rows = await this.db.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRefreshTokenEntity);
  }

  /**
   * Housekeeping. Expired rows are kept for a grace period rather than deleted
   * on expiry, because the reuse-detection path needs to recognise a token that
   * expired minutes ago as "known and revoked" instead of "never existed".
   */
  async deleteExpiredBefore(cutoff: Date): Promise<number> {
    const result = await this.db.refreshToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });
    return result.count;
  }
}
