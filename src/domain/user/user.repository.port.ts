import type { CursorPage, CursorPageRequest, OffsetPage, OffsetPageRequest } from '@shared/http/pagination';
import type { UserStatus } from '@domain/shared/enums';
import type { Email } from './email.vo';
import type { User } from './user.entity';

/** Injection token. Symbols cannot collide the way string tokens can. */
export const USER_REPOSITORY = Symbol('UserRepository');

export interface UserFilters {
  readonly status?: UserStatus;
  readonly tenantId?: string;
  readonly isPlatformAdmin?: boolean;
  /** Case-insensitive match against email, first and last name. */
  readonly search?: string;
  /** Off by default — soft-deleted users are invisible unless explicitly asked for. */
  readonly includeDeleted?: boolean;
}

/**
 * The persistence contract for the user aggregate.
 *
 * Declared in the domain and implemented in infrastructure — the dependency
 * points inward, so the domain compiles with no knowledge of Prisma and unit
 * tests inject an in-memory fake (see test/fakes).
 *
 * Note there is no `update(fields)`: callers load the aggregate, invoke its
 * methods, and `save` it. Partial updates through the repository would let
 * callers bypass every invariant the entity enforces.
 */
export interface UserRepositoryPort {
  findById(id: string, options?: { includeDeleted?: boolean }): Promise<User | null>;

  findByEmail(email: Email, options?: { includeDeleted?: boolean }): Promise<User | null>;

  existsByEmail(email: Email): Promise<boolean>;

  /** Offset pagination — for admin tables with page numbers. */
  findMany(request: OffsetPageRequest, filters: UserFilters): Promise<OffsetPage<User>>;

  /** Keyset pagination — for iterating collections of unbounded size. */
  findManyByCursor(request: CursorPageRequest, filters: UserFilters): Promise<CursorPage<User>>;

  create(user: User): Promise<User>;

  /**
   * Optimistic-locking write. Rejects with ConcurrentModificationError when the
   * row's `version` no longer matches the one the aggregate was loaded at.
   */
  save(user: User): Promise<User>;

  /**
   * Records a login timestamp without participating in optimistic locking —
   * see User.recordSuccessfulLogin.
   */
  touchLastLogin(userId: string, at: Date): Promise<void>;

  /**
   * Cheap projection for the JWT strategy, which runs on every authenticated
   * request and needs three columns, not the aggregate.
   */
  findAuthSnapshot(id: string): Promise<{
    id: string;
    tokenVersion: number;
    status: UserStatus;
    isPlatformAdmin: boolean;
    deletedAt: Date | null;
  } | null>;
}
