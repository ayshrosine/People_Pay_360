/**
 * Merges departments that share a name.
 *
 * The demo seed introduced its own ids for names the base seed had already
 * created, which left the dashboard rendering two "Engineering" rows. The
 * department carrying the most employees wins, so the fewest rows have to move.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const departments = await prisma.department.findMany({
    include: { _count: { select: { employees: true } } },
  });
  departments.sort((a, b) => b._count.employees - a._count.employees);
  const byName = new Map();
  for (const d of departments) {
    if (!byName.has(d.name)) byName.set(d.name, []);
    byName.get(d.name).push(d);
  }

  let merged = 0;
  for (const [name, group] of byName) {
    if (group.length < 2) continue;
    const [keep, ...drop] = group;
    for (const dup of drop) {
      const moved = await prisma.employee.updateMany({
        where: { departmentId: dup.id },
        data: { departmentId: keep.id },
      });
      await prisma.department.delete({ where: { id: dup.id } });
      console.log('merged ' + name + ': ' + dup.id + ' -> ' + keep.id + ' (' + moved.count + ' employees moved)');
      merged += 1;
    }
  }

  console.log(merged === 0 ? 'no duplicate departments' : merged + ' duplicate department(s) merged');
  const left = await prisma.department.findMany({ orderBy: { name: 'asc' } });
  console.log('departments now: ' + left.map((d) => d.name).join(', '));
})().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
