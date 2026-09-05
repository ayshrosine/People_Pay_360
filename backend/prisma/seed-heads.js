/**
 * Appoints a head for each department and gives them a login.
 *
 * A department head is an ordinary employee, not a role: their authority comes
 * from `Department.headId`, which lets them approve and refuse leave for their
 * own department and nobody else's.
 */
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();

(async () => {
  const departments = await prisma.department.findMany({
    include: {
      employees: {
        where: { status: 'ACTIVE' },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });

  const password = await argon2.hash('password123');
  let appointed = 0;

  for (const department of departments) {
    if (department.employees.length === 0) {
      console.log(department.name.padEnd(20) + 'no active employees, skipped');
      continue;
    }

    // Prefer whoever already leads it; otherwise the most senior-looking title,
    // falling back to the first member alphabetically so runs are stable.
    const existing = department.employees.find((e) => e.id === department.headId);
    const head =
      existing ??
      department.employees.find((e) => /manager|lead|head|senior|analyst/i.test(e.jobPosition ?? '')) ??
      department.employees[0];

    await prisma.department.update({
      where: { id: department.id },
      data: { headId: head.id },
    });

    // Heads need to sign in to approve anything. The role stays EMPLOYEE - the
    // authority is the relationship, not the role.
    await prisma.user.upsert({
      where: { email: head.workEmail },
      update: { employeeId: head.id, isActive: true },
      create: {
        email: head.workEmail,
        passwordHash: password,
        role: 'EMPLOYEE',
        employeeId: head.id,
        isActive: true,
      },
    });

    appointed += 1;
    console.log(
      department.name.padEnd(20) +
        'head: ' +
        head.name.padEnd(18) +
        head.workEmail +
        '  (' +
        department.employees.length +
        ' members)',
    );
  }

  console.log('\n' + appointed + ' department head(s) appointed. Password: password123');
  console.log('A head approves leave for their own department only, and never their own.');
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
