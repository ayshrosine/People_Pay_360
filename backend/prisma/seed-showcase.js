/**
 * Showcase data: one live example of every state the product can be in.
 *
 * The other seeds build a plausible company; this one makes sure nothing is
 * invisible. Almost every payrun had been marked paid, which meant the whole
 * payroll workflow — compute, validate, mark paid, send — had no button left
 * to press and no unpaid work to look at.
 *
 * Payruns are driven through the real API so every figure still comes out of
 * the salary-rule engine. Everything else is written directly.
 *
 * Safe to re-run: it skips periods that already have a payrun and keys the rest
 * off deterministic ids.
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const BASE = process.env.API_URL || 'http://localhost:4000/api/v1';
const ADMIN = { email: 'admin@odoopnx.com', password: 'password123' };

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const monthStart = (y, m) => new Date(y, m, 1);
const monthEnd = (y, m) => new Date(y, m + 1, 0);

let token = null;

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: Object.assign(
      { 'Content-Type': 'application/json' },
      token ? { Authorization: 'Bearer ' + token } : {},
    ),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* html error page */ }
  if (!res.ok) throw new Error(method + ' ' + path + ' → ' + res.status + ' ' + text.slice(0, 200));
  return json?.data ?? json;
}

/** Compute now returns immediately, so wait for the payrun to settle. */
async function waitForCompute(payrunId) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const run = await api('GET', '/payroll/payruns/' + payrunId);
    if (run.status !== 'COMPUTING' && run.status !== 'DRAFT') return run;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('payrun ' + payrunId + ' never finished computing');
}

async function buildPayrun({ year, month, structureId, upTo }) {
  const start = monthStart(year, month);
  const end = monthEnd(year, month);
  const name = MONTHS[month] + ' ' + year;

  // Overlap, not equality: a payrun created through the API stores UTC
  // midnight while `new Date(y, m, 1)` is local midnight, so comparing the two
  // directly never matches and a second payrun gets created for the month.
  const existing = await prisma.payrun.findFirst({
    where: { periodStart: { lte: end }, periodEnd: { gte: start } },
  });
  if (existing) {
    console.log('  ' + name.padEnd(16) + 'already covered by "' + existing.name + '" (' + existing.status + '), left alone');
    return existing;
  }

  const scope = await api('POST', '/payroll/payruns/preview-scope', {
    salaryStructureId: structureId,
    periodStart: iso(start),
    periodEnd: iso(end),
  });

  if (scope.length === 0) {
    console.log('  ' + name.padEnd(16) + 'nobody payable, skipped');
    return null;
  }

  const run = await api('POST', '/payroll/payruns', {
    name,
    salaryStructureId: structureId,
    periodStart: iso(start),
    periodEnd: iso(end),
    employeeIds: scope.map((e) => e.id),
  });

  if (upTo === 'DRAFT') {
    console.log('  ' + name.padEnd(16) + 'DRAFT      ' + scope.length + ' employee(s) — waiting to be computed');
    return run;
  }

  await api('POST', '/payroll/payruns/' + run.id + '/compute');
  const computed = await waitForCompute(run.id);

  if (upTo === 'COMPUTED') {
    const blocked = (computed.payslips ?? []).filter(
      (p) => Array.isArray(p.warnings) && p.warnings.some((w) => w.severity === 'blocking'),
    );
    console.log(
      '  ' + name.padEnd(16) + 'COMPUTED   ' + (computed.payslips ?? []).length + ' payslip(s)' +
        (blocked.length ? ', ' + blocked.length + ' blocked from validation' : ''),
    );
    return computed;
  }

  // Validating the whole run fails while anyone is blocked, so validate the
  // clean payslips individually — which is what an operator would do.
  const clean = (computed.payslips ?? []).filter(
    (p) => !(Array.isArray(p.warnings) && p.warnings.some((w) => w.severity === 'blocking')),
  );

  if (clean.length === 0) {
    console.log('  ' + name.padEnd(16) + 'COMPUTED   everyone blocked, cannot validate');
    return computed;
  }

  await api('POST', '/payroll/payruns/' + run.id + '/payslips/validate', {
    payslipIds: clean.map((p) => p.id),
  });

  if (upTo === 'VALIDATED') {
    console.log('  ' + name.padEnd(16) + 'VALIDATED  ' + clean.length + ' payslip(s) — awaiting payment');
    return api('GET', '/payroll/payruns/' + run.id);
  }

  if (upTo === 'PARTIALLY_PAID') {
    const half = clean.slice(0, Math.max(1, Math.floor(clean.length / 2)));
    await api('POST', '/payroll/payruns/' + run.id + '/payslips/mark-paid', {
      payslipIds: half.map((p) => p.id),
    });
    await api('POST', '/payroll/payruns/' + run.id + '/payslips/send', {
      payslipIds: half.map((p) => p.id),
    });
    console.log(
      '  ' + name.padEnd(16) + 'PART PAID  ' + half.length + ' of ' + clean.length +
        ' paid and sent, the rest still owed',
    );
    return api('GET', '/payroll/payruns/' + run.id);
  }

  return computed;
}

async function main() {
  console.log('Seeding showcase data…\n');

  const auth = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ADMIN),
  }).then((r) => r.json());
  token = auth?.data?.accessToken;
  if (!token) throw new Error('could not sign in — is the API running?');

  // ── Duplicate payruns left behind by test runs ───────────────────────────
  // Two payruns over one period would pay somebody twice. `create` refuses that
  // now, but rows made before the guard existed are still here. For each month
  // the fullest run is the real one; the rest are leftovers.
  const all = await prisma.payrun.findMany({ include: { payslips: { select: { id: true } } } });
  const byMonth = new Map();
  for (const run of all) {
    const key = run.periodStart.toISOString().slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(run);
  }

  let removed = 0;
  for (const group of byMonth.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => b.payslips.length - a.payslips.length);
    for (const run of group.slice(1)) {
      await prisma.payslipLine.deleteMany({ where: { payslip: { payrunId: run.id } } });
      await prisma.payslip.deleteMany({ where: { payrunId: run.id } });
      await prisma.payrun.delete({ where: { id: run.id } });
      removed += 1;
    }
  }
  if (removed) console.log('cleanup        removed ' + removed + ' duplicate payrun(s)');

  // ── Leave types: there must be a genuinely PAID one ──────────────────────
  // `affectsPayroll: true` means the leave reduces pay. Both seeded types were
  // set that way, so "approved paid leave still counts as worked" — a core
  // payroll rule — was never actually exercised.
  console.log('LEAVE TYPES');
  const annual = await prisma.timeOffType.findFirst({ where: { name: { contains: 'Annual' } } });
  if (annual) {
    await prisma.timeOffType.update({ where: { id: annual.id }, data: { affectsPayroll: false } });
    console.log('  Annual Leave    now PAID — counts towards worked days');
  }
  const sick = await prisma.timeOffType.findFirst({ where: { name: { contains: 'Sick' } } });
  if (sick) {
    await prisma.timeOffType.update({ where: { id: sick.id }, data: { affectsPayroll: false } });
    console.log('  Sick Leave      now PAID');
  }

  const unpaid = await prisma.timeOffType.upsert({
    where: { id: 'type-unpaid-leave' },
    update: { affectsPayroll: true },
    create: {
      id: 'type-unpaid-leave',
      name: 'Unpaid Leave',
      unit: 'DAYS',
      requiresAllocation: false,
      requiresApproval: true,
      // The whole point: these days do not earn salary.
      affectsPayroll: true,
      colorHex: '#f59e0b',
    },
  });
  console.log('  Unpaid Leave    created — does NOT count towards worked days');

  await prisma.timeOffType.upsert({
    where: { id: 'type-comp-off' },
    update: {},
    create: {
      id: 'type-comp-off',
      name: 'Compensatory Off',
      unit: 'DAYS',
      requiresAllocation: true,
      requiresApproval: true,
      affectsPayroll: false,
      colorHex: '#22c55e',
    },
  });
  console.log('  Comp Off        created — paid, drawn from an allocation');

  // ── Unpaid leave actually taken, so payroll has something to dock ────────
  const employees = await prisma.employee.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    take: 6,
  });

  await prisma.timeOffRequest.deleteMany({ where: { reason: { startsWith: 'showcase:' } } });

  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const requests = [
    { employee: employees[0], type: unpaid, from: -45, days: 3, status: 'APPROVED', why: 'unpaid leave already taken — reduces their pay' },
    { employee: employees[1], type: unpaid, from: 5, days: 2, status: 'TO_APPROVE', why: 'unpaid leave awaiting a decision' },
    { employee: employees[2], type: annual, from: 10, days: 4, status: 'TO_APPROVE', why: 'paid leave awaiting a decision' },
    { employee: employees[3], type: sick, from: -8, days: 1, status: 'APPROVED', why: 'paid sick leave, already counted as worked' },
    { employee: employees[4], type: annual, from: 20, days: 5, status: 'TO_APPROVE', why: 'a long request for the department head' },
  ].filter((r) => r.employee && r.type);

  console.log('\nLEAVE REQUESTS');
  for (const entry of requests) {
    const start = day(entry.from);
    const end = day(entry.from + entry.days - 1);
    await prisma.timeOffRequest.create({
      data: {
        employeeId: entry.employee.id,
        timeOffTypeId: entry.type.id,
        startDate: start,
        endDate: end,
        duration: entry.days,
        status: entry.status,
        reason: 'showcase: ' + entry.why,
        approvedAt: entry.status === 'APPROVED' ? new Date() : null,
      },
    });
    console.log('  ' + entry.status.padEnd(12) + entry.employee.name.padEnd(20) + entry.type.name.padEnd(16) + entry.days + 'd');
  }

  // ── Someone still clocked in, so the widget has a live state ─────────────
  await prisma.attendance.deleteMany({ where: { notes: 'showcase:open' } });
  if (employees[0]) {
    const openedAt = new Date();
    openedAt.setHours(9, 5, 0, 0);
    await prisma.attendance.create({
      data: {
        employeeId: employees[0].id,
        checkIn: openedAt,
        checkOut: null,
        status: 'PRESENT',
        notes: 'showcase:open',
      },
    });
    console.log('\nATTENDANCE     ' + employees[0].name + ' is still clocked in today');
  }

  // ── Payruns across every status ─────────────────────────────────────────
  const structure = await prisma.salaryStructure.findFirst({ where: { isActive: true } });

  console.log('\nPAYRUNS (through the real API, so figures come from the rule engine)');
  // Periods chosen to have attendance behind them, so the numbers are real.
  // Months chosen so each is free and has attendance behind it, so the figures
  // are real rather than a pro-rated zero.
  await buildPayrun({ year: 2026, month: 1, structureId: structure.id, upTo: 'PARTIALLY_PAID' }); // February
  await buildPayrun({ year: 2026, month: 2, structureId: structure.id, upTo: 'DRAFT' });          // March
  await buildPayrun({ year: 2026, month: 3, structureId: structure.id, upTo: 'COMPUTED' });       // April
  await buildPayrun({ year: 2026, month: 4, structureId: structure.id, upTo: 'VALIDATED' });      // May

  // ── Summary ─────────────────────────────────────────────────────────────
  const runs = await prisma.payrun.findMany({
    orderBy: { periodStart: 'asc' },
    include: { payslips: true },
  });

  console.log('\nEvery payroll state is now represented:');
  for (const run of runs) {
    const by = run.payslips.reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    }, {});
    const sent = run.payslips.filter((p) => p.emailSentAt).length;
    const owed = run.payslips
      .filter((p) => p.status !== 'PAID')
      .reduce((sum, p) => sum + Number(p.netAmount), 0);

    console.log(
      '  ' + run.name.padEnd(16) + run.status.padEnd(11) +
        JSON.stringify(by).padEnd(30) +
        (sent ? sent + ' sent  ' : '        ') +
        (owed > 0 ? 'unpaid ₹' + owed.toLocaleString('en-IN') : ''),
    );
  }
}

main()
  .catch((e) => { console.error('\nFAILED: ' + e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
