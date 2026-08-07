-- Drops the `user_status` native enum in favour of a plain varchar column.
-- The permitted values now live in @domain/shared/enums and are enforced on the
-- read path (prisma.mappers.toUserStatus) rather than by the database.
--
-- Hand-written rather than generated: `prisma migrate dev` would drop and
-- recreate the column, discarding every existing status.
--
-- Order matters. The current default is itself of type `user_status`, so it has
-- to be dropped before the column type can change, and the type cannot be
-- dropped while anything still depends on it. `users_status_idx` is rebuilt
-- automatically by the ALTER.

ALTER TABLE "users" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "users" ALTER COLUMN "status" TYPE VARCHAR(20) USING "status"::text;

ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

DROP TYPE "user_status";
