import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConcurrentModificationError, InvalidCursorError } from '@domain/shared/domain-error';
import type { UserStatus } from '@domain/shared/enums';
import type { Email } from '@domain/user/email.vo';
import { User } from '@domain/user/user.entity';
import { EmailAlreadyExistsError, UserNotFoundError } from '@domain/user/user.errors';
import type { UserFilters, UserRepositoryPort } from '@domain/user/user.repository.port';
import {
  Cursor,
  offsetToSkip,
  type CursorPage,
  type CursorPageRequest,
  type OffsetPage,
  type OffsetPageRequest,
  type SortDirection,
} from '@shared/http/pagination';
import { PrismaService } from '../prisma.service';
import { toUserEntity } from '../prisma.mappers';
import { isUniqueViolation, toInfrastructureError } from '../prisma-error';

/**
 * Columns a client may sort by, mapped to Prisma field names.
 *
 * An allowlist rather than passing `sortBy` through: `orderBy` takes a field
 * name, and letting the query string choose one is how a caller discovers they
 * can sort a user list by `passwordHash` and read the column one bit at a time.
 * Anything not listed falls back to `createdAt`.
 */
const SORTABLE_FIELDS = {
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  email: 'email',
  firstName: 'firstName',
  lastName: 'lastName',
  status: 'status',
  lastLoginAt: 'lastLoginAt',
} as const satisfies Record<string, keyof Prisma.UserOrderByWithRelationInput>;

type SortableField = (typeof SORTABLE_FIELDS)[keyof typeof SORTABLE_FIELDS];

@Injectable()
export class PrismaUserRepository implements UserRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  async findById(id: string, options?: { includeDeleted?: boolean }): Promise<User | null> {
    const row = await this.db.user.findUnique({ where: { id } });
    if (!row) return null;
    // Filtered here rather than in the `where`, because `findUnique` only
    // accepts unique fields — adding `deletedAt` to it would silently downgrade
    // the query to a scan on some Prisma versions.
    if (row.deletedAt !== null && !options?.includeDeleted) return null;
    return toUserEntity(row);
  }

  async findByEmail(email: Email, options?: { includeDeleted?: boolean }): Promise<User | null> {
    // `email.value` is already normalised by the value object; the column is
    // stored in the same normalised form, so this is an index equality probe and
    // not a case-insensitive comparison.
    const row = await this.db.user.findUnique({ where: { email: email.value } });
    if (!row) return null;
    if (row.deletedAt !== null && !options?.includeDeleted) return null;
    return toUserEntity(row);
  }

  /**
   * Deliberately counts soft-deleted rows too: the unique index is
   * unconditional, so a row that would collide must be reported as a collision
   * even if it is invisible to reads. In practice soft delete rewrites the
   * address to `<id>@deleted.invalid`, so a real address never matches one.
   */
  async existsByEmail(email: Email): Promise<boolean> {
    const row = await this.db.user.findUnique({
      where: { email: email.value },
      select: { id: true },
    });
    return row !== null;
  }

  async findMany(request: OffsetPageRequest, filters: UserFilters): Promise<OffsetPage<User>> {
    const where = this.toWhere(filters, request.search);
    const field = this.toSortField(request.sortBy);

    // Two round trips, not one transaction: a concurrent insert can make `total`
    // disagree with `items` by a row, and that is the accepted cost of offset
    // pagination. Wrapping them in a repeatable-read transaction would hold a
    // pooled connection open to fix a discrepancy no admin table notices.
    const [rows, total] = await Promise.all([
      this.db.user.findMany({
        where,
        // `id` breaks ties. Without it, two users sharing a `createdAt` can
        // appear on both page 1 and page 2, or on neither.
        orderBy: [{ [field]: request.sortDirection }, { id: request.sortDirection }],
        skip: offsetToSkip(request.page, request.limit),
        take: request.limit,
      }),
      this.db.user.count({ where }),
    ]);

    return {
      items: rows.map(toUserEntity),
      total,
      page: request.page,
      limit: request.limit,
    };
  }

  /**
   * Keyset pagination over `(createdAt, id)` — the exact composite index
   * declared on the model, so the seek is an index lookup at any depth instead
   * of an OFFSET that walks and throws away every preceding row.
   */
  async findManyByCursor(request: CursorPageRequest, filters: UserFilters): Promise<CursorPage<User>> {
    const where = this.toWhere(filters, request.search);
    const keyset = this.toKeysetCondition(request.cursor, request.sortDirection);

    // One extra row is the cheapest possible "is there a next page" answer: a
    // second COUNT over the same predicate would double the work of a query
    // whose whole point is to be constant-cost.
    const rows = await this.db.user.findMany({
      where: keyset ? { AND: [where, keyset] } : where,
      orderBy: [{ createdAt: request.sortDirection }, { id: request.sortDirection }],
      take: request.limit + 1,
    });

    const hasMore = rows.length > request.limit;
    const page = hasMore ? rows.slice(0, request.limit) : rows;
    const last = page.at(-1);

    return {
      items: page.map(toUserEntity),
      nextCursor: hasMore && last ? Cursor.encode(last.createdAt, last.id) : null,
      limit: request.limit,
    };
  }

  /**
   * The JWT strategy's query, and the reason this method exists at all: it runs
   * once per authenticated request, and loading the aggregate would drag the
   * password hash across the wire a few thousand times a minute for four fields
   * nobody reads.
   *
   * Returns deleted users rather than hiding them — the caller needs to tell
   * "no such account" from "account since deleted", and only it knows which
   * response each deserves.
   */
  async findAuthSnapshot(id: string): Promise<{
    id: string;
    tokenVersion: number;
    status: UserStatus;
    isPlatformAdmin: boolean;
    deletedAt: Date | null;
  } | null> {
    return this.db.user.findUnique({
      where: { id },
      select: {
        id: true,
        tokenVersion: true,
        status: true,
        isPlatformAdmin: true,
        deletedAt: true,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  async create(user: User): Promise<User> {
    const s = user.toSnapshot();
    try {
      const row = await this.db.user.create({
        data: {
          id: s.id,
          email: s.email,
          passwordHash: s.passwordHash,
          firstName: s.firstName,
          lastName: s.lastName,
          status: s.status,
          isPlatformAdmin: s.isPlatformAdmin,
          tokenVersion: s.tokenVersion,
          lastLoginAt: s.lastLoginAt,
          version: s.version,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          deletedAt: s.deletedAt,
        },
      });
      return toUserEntity(row);
    } catch (error) {
      // The check-then-insert race is real and this is the half that closes it:
      // `existsByEmail` can pass for two concurrent registrations, and only the
      // unique index arbitrates.
      if (isUniqueViolation(error, 'email')) throw new EmailAlreadyExistsError();
      throw toInfrastructureError(error, 'user.create');
    }
  }

  /**
   * Optimistic-locking write: the loaded `version` is part of the WHERE clause,
   * so a row someone else has written since is not matched and the update
   * affects zero rows.
   *
   * `updateMany` rather than `update` because `update` matches on the primary
   * key alone — the version has to be a filter, and a count of 0 is the signal.
   *
   * `lastLoginAt` is intentionally absent from `data`: `recordSuccessfulLogin`
   * mutates it outside the lock, and writing it here would let a concurrent
   * login roll a fresher timestamp back to whatever this entity was loaded with.
   */
  async save(user: User): Promise<User> {
    const s = user.toSnapshot();

    return this.prisma.runInTransaction(async () => {
      let result: Prisma.BatchPayload;
      try {
        result = await this.db.user.updateMany({
          where: { id: s.id, version: s.version },
          data: {
            email: s.email,
            passwordHash: s.passwordHash,
            firstName: s.firstName,
            lastName: s.lastName,
            status: s.status,
            isPlatformAdmin: s.isPlatformAdmin,
            tokenVersion: s.tokenVersion,
            deletedAt: s.deletedAt,
            // Explicit, so the entity's clock wins over `@updatedAt`. The two
            // agree in production; in tests, where `now` is injected, they do
            // not, and the entity is the one under test.
            updatedAt: s.updatedAt,
            version: { increment: 1 },
          },
        });
      } catch (error) {
        // Reachable through `changeEmail` and through soft delete, which
        // rewrites the address.
        if (isUniqueViolation(error, 'email')) throw new EmailAlreadyExistsError();
        throw toInfrastructureError(error, 'user.save');
      }

      if (result.count === 0) {
        // Zero rows has two causes and the caller handles them differently: a
        // 409 invites a re-read and retry, a 404 does not.
        const exists = await this.db.user.findUnique({ where: { id: s.id }, select: { id: true } });
        if (!exists) throw new UserNotFoundError(s.id);
        throw new ConcurrentModificationError('User', s.id);
      }

      // Re-read inside the same transaction so the returned aggregate carries
      // the incremented `version`. Returning the caller's entity would hand back
      // a value that is already stale for its next save.
      const row = await this.db.user.findUniqueOrThrow({ where: { id: s.id } });
      return toUserEntity(row);
    });
  }

  /**
   * Login telemetry, written outside the optimistic lock — see
   * `User.recordSuccessfulLogin`. Two sessions signing in at once would
   * otherwise collide on `version` and turn a successful login into a 409.
   *
   * `updateMany` swallows the not-found case: the account can be deleted between
   * authenticating and recording the timestamp, and failing the login at that
   * point would be reporting a bookkeeping miss as a credentials problem.
   *
   * `@updatedAt` still moves here. That is deliberate and harmless: `updatedAt`
   * is not part of the lock, `version` is.
   */
  async touchLastLogin(userId: string, at: Date): Promise<void> {
    try {
      await this.db.user.updateMany({ where: { id: userId }, data: { lastLoginAt: at } });
    } catch (error) {
      throw toInfrastructureError(error, 'user.touchLastLogin');
    }
  }

  // ---------------------------------------------------------------------------
  // Query construction
  // ---------------------------------------------------------------------------

  /**
   * `filters.search` and the request's own `search` mean the same thing; the
   * request-level one wins because it is the one the HTTP layer parsed.
   */
  private toWhere(filters: UserFilters, search?: string): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};

    // Soft-deleted rows are invisible unless asked for — the default every read
    // path relies on.
    if (!filters.includeDeleted) where.deletedAt = null;
    if (filters.status !== undefined) where.status = filters.status;
    if (filters.isPlatformAdmin !== undefined) where.isPlatformAdmin = filters.isPlatformAdmin;
    // Users are global, not tenant-scoped; "users of this tenant" is a question
    // about memberships, answered through the join model's index.
    if (filters.tenantId !== undefined) where.memberships = { some: { tenantId: filters.tenantId } };

    const term = (search ?? filters.search)?.trim();
    if (term) {
      // `contains` cannot use a b-tree index, so this is a scan. Acceptable at
      // admin-console scale; the fix when it stops being acceptable is a
      // trigram index or a tsvector column, not a different WHERE clause.
      where.OR = [
        { email: { contains: term, mode: 'insensitive' } },
        { firstName: { contains: term, mode: 'insensitive' } },
        { lastName: { contains: term, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private toSortField(sortBy?: string): SortableField {
    if (sortBy && sortBy in SORTABLE_FIELDS) {
      return SORTABLE_FIELDS[sortBy as keyof typeof SORTABLE_FIELDS];
    }
    return SORTABLE_FIELDS.createdAt;
  }

  /**
   * The seek predicate: everything strictly after the last row seen, in the
   * composite `(createdAt, id)` order.
   *
   * The tie-break arm is what makes this correct rather than merely plausible —
   * with `createdAt` alone, rows sharing a timestamp across a page boundary are
   * either skipped or served twice.
   */
  private toKeysetCondition(
    cursor: string | undefined,
    direction: SortDirection,
  ): Prisma.UserWhereInput | null {
    if (!cursor) return null;

    const decoded = Cursor.decode(cursor);
    if (!decoded) throw new InvalidCursorError();

    const comparison = direction === 'desc' ? 'lt' : 'gt';
    return {
      OR: [
        { createdAt: { [comparison]: decoded.createdAt } },
        { createdAt: decoded.createdAt, id: { [comparison]: decoded.id } },
      ],
    };
  }
}
