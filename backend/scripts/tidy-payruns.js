/**
 * Removes duplicate and stray payruns.
 *
 * Repeated demo runs left several payruns covering the same period — which is
 * exactly what the DUPLICATE_PAYSLIP guard now refuses to create, but the rows
 * predate it. For each period the payrun with the most payslips is kept, since
 * that is the real one; the stubs are deleted.
 *
 * Safe to re-run. It never touches a payrun that is alone in its period.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const runs = await prisma.payrun.findMany({
    include: { payslips: { select: { id: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const byPeriod = new Map();
  for (const run of runs) {
    const key = run.periodStart.toISOString().slice(0, 10) + '..' + run.periodEnd.toISOString().slice(0, 10);
    if (!byPeriod.has(key)) byPeriod.set(key, []);
    byPeriod.get(key).push(run);
  }

  let removed = 0;

  for (const [period, group] of byPeriod) {
    if (group.length < 2) continue;

    // Keep the fullest run; a one-payslip stub is the accident.
    group.sort((a, b) => b.payslips.length - a.payslips.length);
    const [keep, ...drop] = group;

    console.log(period + ': keeping "' + keep.name + '" (' + keep.payslips.length + ' payslips)');

    for (const run of drop) {
      await prisma.payslipLine.deleteMany({ where: { payslip: { payrunId: run.id } } });
      await prisma.payslip.deleteMany({ where: { payrunId: run.id } });
      await prisma.payrun.delete({ where: { id: run.id } });
      console.log('  removed "' + run.name + '" (' + run.payslips.length + ' payslips)');
      removed += 1;
    }
  }

  const left = await prisma.payrun.findMany({
    orderBy: { periodStart: 'asc' },
    include: { payslips: { select: { status: true } } },
  });

  console.log('\n' + removed + ' duplicate payrun(s) removed. Remaining:');
  for (const run of left) {
    console.log('  ' + run.name.padEnd(18) + run.status.padEnd(10) + run.payslips.length + ' payslip(s)');
  }
})()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
