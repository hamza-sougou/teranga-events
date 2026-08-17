// Bootstraps the first Super Admin account. isSuperAdmin must never be
// settable through a public API route — this script is the only path.
// Run with `npm run db:seed` (backend/), after setting SUPER_ADMIN_EMAIL /
// SUPER_ADMIN_PASSWORD in backend/.env.
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set in backend/.env');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // `email` isn't a Prisma-unique field (only the functional lower(email)
  // index in db/schema.sql enforces uniqueness at the DB level), so this
  // has to be a manual find-then-create/update rather than `upsert`.
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { isSuperAdmin: true, passwordHash },
      })
    : await prisma.user.create({
        data: {
          email,
          passwordHash,
          fullName: 'Super Admin',
          isSuperAdmin: true,
        },
      });

  console.log(`Super admin ready: ${user.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
