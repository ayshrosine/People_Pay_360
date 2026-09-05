/**
 * One-off migration: the working schedule now belongs to the contract.
 *
 * A schedule is a term of employment — it changes when someone moves to part
 * time, and payroll must know which schedule applied *during the pay period*.
 * Hanging it off the employee could only ever describe "now", which silently
 * rewrote history every time it changed.
 *
 * Run this BEFORE dropping `Employee.workingScheduleId`, or the link is lost.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const contracts = await prisma.contract.findMany({
    where: { workingScheduleId: null },
    include: { employee: { select: { id: true, name: true, workingScheduleId: true } } },
  });

  console.log(contracts.length + ' contract(s) without a working schedule');

  let moved = 0;
  let orphaned = 0;

  for (const contract of contracts) {
    const scheduleId = contract.employee?.workingScheduleId;
    if (!scheduleId) {
      orphaned += 1;
      console.log('  no schedule to inherit for ' + (contract.employee?.name ?? contract.employeeId));
      continue;
    }

    await prisma.contract.update({
      where: { id: contract.id },
      data: { workingScheduleId: scheduleId },
    });
    moved += 1;
    console.log('  ' + contract.employee.name.padEnd(22) + '-> schedule ' + scheduleId);
  }

  // Anything still unscheduled falls back to the default, so payroll always has
  // a roster to pro-rate against.
  if (orphaned > 0) {
    const fallback = await prisma.workingSchedule.findFirst({
      where: { status: 'Active' },
      orderBy: { totalWeeklyHours: 'desc' },
    });

    if (fallback) {
      const filled = await prisma.contract.updateMany({
        where: { workingScheduleId: null },
        data: { workingScheduleId: fallback.id },
      });
      console.log('  ' + filled.count + ' contract(s) fell back to "' + fallback.name + '"');
    }
  }

  const remaining = await prisma.contract.count({ where: { workingScheduleId: null } });
  console.log('\n' + moved + ' inherited from the employee; ' + remaining + ' still without a schedule');
  console.log(
    remaining === 0
      ? 'Safe to drop Employee.workingScheduleId.'
      : 'Resolve the remaining contracts before dropping the column.',
  );
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
