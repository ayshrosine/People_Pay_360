/**
 * Moves every account and employee from the old product domain to the new one.
 *
 * The product is now "Odoo PNX", so `@peoplepay360.com` addresses are stale.
 * This *updates* the existing rows rather than letting the seed create a second
 * set — reseeding under a new domain would leave two of every demo user, with
 * the payroll history attached to the wrong one.
 *
 * Safe to re-run: rows already on the new domain are skipped.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const OLD = '@peoplepay360.com';
const NEW = '@odoopnx.com';

const swap = (address) => address.replace(new RegExp(OLD.replace('.', '\\.') + '$'), NEW);

(async () => {
  const employees = await prisma.employee.findMany({
    where: { workEmail: { endsWith: OLD } },
    select: { id: true, name: true, workEmail: true },
  });

  for (const employee of employees) {
    await prisma.employee.update({
      where: { id: employee.id },
      data: { workEmail: swap(employee.workEmail) },
    });
  }
  console.log(employees.length + ' employee work email(s) moved to ' + NEW);

  const users = await prisma.user.findMany({
    where: { email: { endsWith: OLD } },
    select: { id: true, email: true },
  });

  for (const user of users) {
    await prisma.user.update({
      where: { id: user.id },
      data: { email: swap(user.email) },
    });
  }
  console.log(users.length + ' login(s) moved to ' + NEW);

  const remaining =
    (await prisma.employee.count({ where: { workEmail: { endsWith: OLD } } })) +
    (await prisma.user.count({ where: { email: { endsWith: OLD } } }));

  console.log(remaining === 0 ? '\nNothing left on the old domain.' : '\n' + remaining + ' row(s) still on the old domain.');
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
