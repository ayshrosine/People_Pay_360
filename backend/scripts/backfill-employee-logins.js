/**
 * Gives every employee without an account one they can sign in with.
 *
 * Creating an employee now provisions a login automatically, but records made
 * before that change have none — so they exist in the directory and cannot log
 * in, with no password to look up.
 *
 * The password comes from EMPLOYEE_DEFAULT_PASSWORD, falling back to
 * `password123`. Never run this against production data without setting it.
 *
 * Safe to re-run: employees who already have an account are skipped, and no
 * existing password is ever overwritten.
 */
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();
const PASSWORD = process.env.EMPLOYEE_DEFAULT_PASSWORD || 'password123';

(async () => {
  const employees = await prisma.employee.findMany({
    include: { user: true },
    orderBy: { name: 'asc' },
  });

  let created = 0;
  let linked = 0;
  let skipped = 0;

  for (const employee of employees) {
    if (employee.user) {
      skipped += 1;
      continue;
    }

    // Someone may already sign in with this address without being linked.
    const existing = await prisma.user.findUnique({ where: { email: employee.workEmail } });

    if (existing) {
      if (!existing.employeeId) {
        await prisma.user.update({
          where: { id: existing.id },
          data: { employeeId: employee.id },
        });
        linked += 1;
        console.log('  linked   ' + employee.name.padEnd(24) + employee.workEmail);
      } else {
        skipped += 1;
      }
      continue;
    }

    await prisma.user.create({
      data: {
        email: employee.workEmail,
        passwordHash: await argon2.hash(PASSWORD),
        role: 'EMPLOYEE',
        employeeId: employee.id,
        isActive: employee.status === 'ACTIVE',
      },
    });

    created += 1;
    console.log(
      '  created  ' +
        employee.name.padEnd(24) +
        employee.workEmail.padEnd(34) +
        (employee.status === 'ACTIVE' ? '' : '(inactive: ' + employee.status + ')'),
    );
  }

  console.log(
    '\n' + created + ' account(s) created, ' + linked + ' linked, ' + skipped + ' already had one.',
  );
  console.log('Password for the new accounts: ' + PASSWORD);
  console.log('Change it before this database holds anything real.');
})()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
