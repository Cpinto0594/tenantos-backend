/* eslint-disable no-console */
import { PrismaClient, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

/**
 * Development seed. Idempotent — every write is an upsert keyed on a natural
 * key, so running it twice is a no-op rather than a duplicate-key crash.
 *
 * Refuses to run against production. A seed script that can be pointed at a
 * live database is a loaded gun, and "I thought DATABASE_URL was staging" is
 * how it goes off.
 */
const prisma = new PrismaClient();

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'Password123!';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database. Unset NODE_ENV=production to override.');
  }

  console.log(`Seeding ${redact(process.env.DATABASE_URL ?? '')}`);

  // Cheap parameters: the seed hashes several passwords and we are not
  // protecting anything real here.
  const passwordHash = await argon2.hash(SEED_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const platformAdmin = await prisma.user.upsert({
    where: { email: 'admin@tenantos.local' },
    update: {},
    create: {
      email: 'admin@tenantos.local',
      passwordHash,
      firstName: 'Platform',
      lastName: 'Admin',
      status: UserStatus.ACTIVE,
      isPlatformAdmin: true,
    },
  });

  const owner = await prisma.user.upsert({
    where: { email: 'owner@acme.local' },
    update: {},
    create: {
      email: 'owner@acme.local',
      passwordHash,
      firstName: 'Olivia',
      lastName: 'Owner',
      status: UserStatus.ACTIVE,
    },
  });

  const member = await prisma.user.upsert({
    where: { email: 'member@acme.local' },
    update: {},
    create: {
      email: 'member@acme.local',
      passwordHash,
      firstName: 'Mo',
      lastName: 'Member',
      status: UserStatus.ACTIVE,
    },
  });


  console.log('Seed complete:');
  console.table([
    { email: platformAdmin.email, role: 'platform admin', password: SEED_PASSWORD },
    { email: owner.email, role: 'OWNER of acme', password: SEED_PASSWORD },
    { email: member.email, role: 'MEMBER of acme, ADMIN of globex', password: SEED_PASSWORD },
  ]);
}

/** Never print credentials, even in a dev script — terminals get screenshotted. */
function redact(url: string): string {
  return url.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
