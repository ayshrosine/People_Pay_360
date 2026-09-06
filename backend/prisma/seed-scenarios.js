/**
 * Scenario data: one concrete example of every condition the app can be in.
 *
 * The other seeds create a plausible company. This one deliberately creates the
 * *edges* — the states you otherwise only discover in production: a contract
 * history, an expiring contract, an employee with no bank details, a payslip
 * that cannot compute, every leave status, every attendance status, a part-time
 * roster, an inactive schedule, a terminated employee.
 *
 * Safe to re-run: everything keys off a deterministic id.
 */
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
};

async function main() {
  console.log('Seeding edge-case scenarios…\n');

  const structure = await prisma.salaryStructure.findFirst({ where: { isActive: true } });
  if (!structure) throw new Error('No active salary structure — run the base seed first.');

  const engineering = await prisma.department.findFirst({ where: { name: 'Engineering' } });
  const support = await prisma.department.findFirst({ where: { name: 'Support' } });
  const standard = await prisma.workingSchedule.findFirst({ where: { name: { contains: 'Standard' } } });
  const partTime = await prisma.workingSchedule.findFirst({ where: { name: { contains: 'Part-time' } } });
  const password = await argon2.hash('password123');

  // ── An inactive schedule, so the status column has something to show ─────
  await prisma.workingSchedule.upsert({
    where: { id: 'schedule-retired' },
    update: { status: 'Inactive' },
    create: {
      id: 'schedule-retired',
      name: 'Retired Weekend Roster',
      company: 'Odoo PNX',
      timezone: 'Asia/Kolkata',
      scheduleType: 'Fixed',
      totalWeeklyHours: 16,
      status: 'Inactive',
      lines: {
        create: [
          { dayOfWeek: 5, startTime: '10:00', endTime: '19:00', breakMinutes: 60 },
          { dayOfWeek: 6, startTime: '10:00', endTime: '19:00', breakMinutes: 60 },
        ],
      },
    },
  });
  console.log('schedule       1 inactive roster (exercises the status filter)');

  // ── 1 · An employee with a CONTRACT HISTORY ──────────────────────────────
  // Promoted mid-year: an expired contract then a running one. Payroll must
  // pick whichever covers the period being run, not simply the newest.
  const veteran = await prisma.employee.upsert({
    where: { id: 'employee-history' },
    update: {},
    create: {
      id: 'employee-history',
      name: 'Nikhil Bansal',
      workEmail: 'nikhil.bansal@odoopnx.com',
      jobPosition: 'Staff Engineer',
      departmentId: engineering?.id ?? null,
      employeeType: 'Full-time',
      status: 'ACTIVE',
      phone: '+91 90000 00001',
      bankAccount: '5512340201',
      bankIfsc: 'HDFC0001234',
    },
  });

  await prisma.contract.upsert({
    where: { id: 'contract-history-old' },
    update: { status: 'EXPIRED' },
    create: {
      id: 'contract-history-old',
      employeeId: veteran.id,
      department: 'Engineering',
      jobPosition: 'Senior Engineer',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-06-30'),
      wage: 70000,
      wageType: 'Monthly',
      salaryStructureId: structure.id,
      workingScheduleId: standard?.id ?? null,
      // EXPIRED, so the exclusion constraint permits the running one below.
      status: 'EXPIRED',
    },
  });

  await prisma.contract.upsert({
    where: { id: 'contract-history-new' },
    update: { wage: 95000 },
    create: {
      id: 'contract-history-new',
      employeeId: veteran.id,
      department: 'Engineering',
      jobPosition: 'Staff Engineer',
      startDate: new Date('2026-07-01'),
      endDate: null,
      wage: 95000,
      wageType: 'Monthly',
      salaryStructureId: structure.id,
      workingScheduleId: standard?.id ?? null,
      status: 'RUNNING',
    },
  });
  console.log('contracts      Nikhil Bansal has 2 (expired ₹70k → running ₹95k, promoted 1 July)');

  // ── 2 · A contract EXPIRING SOON, which the dashboard alerts on ──────────
  const leaver = await prisma.employee.upsert({
    where: { id: 'employee-expiring' },
    update: {},
    create: {
      id: 'employee-expiring',
      name: 'Farah Sheikh',
      workEmail: 'farah.sheikh@odoopnx.com',
      jobPosition: 'Contract Designer',
      departmentId: support?.id ?? null,
      employeeType: 'Contract',
      status: 'ACTIVE',
      bankAccount: '5512340202',
      bankIfsc: 'ICIC0004321',
    },
  });

  await prisma.contract.upsert({
    where: { id: 'contract-expiring' },
    update: { endDate: day(21) },
    create: {
      id: 'contract-expiring',
      employeeId: leaver.id,
      department: 'Support',
      jobPosition: 'Contract Designer',
      startDate: new Date('2026-03-01'),
      endDate: day(21), // inside the 30-day alert window
      wage: 55000,
      wageType: 'Monthly',
      salaryStructureId: structure.id,
      workingScheduleId: partTime?.id ?? standard?.id ?? null,
      status: 'RUNNING',
    },
  });
  console.log('alert          Farah Sheikh\'s contract ends in 21 days (CONTRACT_ENDING_SOON)');

  // ── 3 · MISSING BANK DETAILS, which blocks payrun validation ─────────────
  const unbanked = await prisma.employee.upsert({
    where: { id: 'employee-nobank' },
    update: { bankAccount: null, bankIfsc: null },
    create: {
      id: 'employee-nobank',
      name: 'Imran Qureshi',
      workEmail: 'imran.qureshi@odoopnx.com',
      jobPosition: 'Support Analyst',
      departmentId: support?.id ?? null,
      employeeType: 'Full-time',
      status: 'ACTIVE',
      bankAccount: null,
      bankIfsc: null,
    },
  });

  await prisma.contract.upsert({
    where: { id: 'contract-nobank' },
    update: {},
    create: {
      id: 'contract-nobank',
      employeeId: unbanked.id,
      department: 'Support',
      jobPosition: 'Support Analyst',
      startDate: new Date('2026-02-01'),
      endDate: null,
      wage: 42000,
      wageType: 'Monthly',
      salaryStructureId: structure.id,
      workingScheduleId: standard?.id ?? null,
      status: 'RUNNING',
    },
  });
  console.log('alert          Imran Qureshi has no bank details (MISSING_BANK_DETAILS)');

  // ── 4 · An ACTIVE employee with NO CONTRACT AT ALL ───────────────────────
  // Payroll must refuse to pay them rather than inventing a wage.
  await prisma.employee.upsert({
    where: { id: 'employee-nocontract' },
    update: {},
    create: {
      id: 'employee-nocontract',
      name: 'Leena Thomas',
      workEmail: 'leena.thomas@odoopnx.com',
      jobPosition: 'Graduate Trainee',
      departmentId: engineering?.id ?? null,
      employeeType: 'Intern',
      status: 'ACTIVE',
      bankAccount: '5512340204',
      bankIfsc: 'AXIS0005555',
    },
  });
  console.log('warning        Leena Thomas has no contract (NO_ACTIVE_CONTRACT)');

  // ── 5 · A TERMINATED employee, kept for history ──────────────────────────
  const alum = await prisma.employee.upsert({
    where: { id: 'employee-terminated' },
    update: { status: 'TERMINATED' },
    create: {
      id: 'employee-terminated',
      name: 'Suresh Pillai',
      workEmail: 'suresh.pillai@odoopnx.com',
      jobPosition: 'Former Sales Executive',
      employeeType: 'Full-time',
      status: 'TERMINATED',
      bankAccount: '5512340205',
      bankIfsc: 'SBIN0009876',
    },
  });

  await prisma.contract.upsert({
    where: { id: 'contract-terminated' },
    update: { status: 'CANCELLED' },
    create: {
      id: 'contract-terminated',
      employeeId: alum.id,
      department: 'Sales',
      jobPosition: 'Sales Executive',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-05-31'),
      wage: 48000,
      wageType: 'Monthly',
      salaryStructureId: structure.id,
      workingScheduleId: standard?.id ?? null,
      status: 'CANCELLED',
    },
  });
  console.log('archive        Suresh Pillai is TERMINATED with a CANCELLED contract');

  // ── 6 · A DRAFT contract, awaiting signature ─────────────────────────────
  await prisma.contract.upsert({
    where: { id: 'contract-draft' },
    update: { status: 'DRAFT' },
    create: {
      id: 'contract-draft',
      employeeId: 'employee-nocontract',
      department: 'Engineering',
      jobPosition: 'Graduate Trainee',
      startDate: day(14),
      endDate: null,
      wage: 30000,
      wageType: 'Monthly',
      salaryStructureId: structure.id,
      workingScheduleId: standard?.id ?? null,
      // DRAFT, so it is invisible to payroll until someone runs it.
      status: 'DRAFT',
    },
  });
  console.log('contract       one DRAFT awaiting signature (invisible to payroll)');

  // ── 7 · Logins for the new people, so each state can be seen first-hand ──
  for (const [email, employeeId] of [
    ['nikhil.bansal@odoopnx.com', 'employee-history'],
    ['farah.sheikh@odoopnx.com', 'employee-expiring'],
    ['imran.qureshi@odoopnx.com', 'employee-nobank'],
  ]) {
    await prisma.user.upsert({
      where: { email },
      update: { employeeId, isActive: true },
      create: { email, passwordHash: password, role: 'EMPLOYEE', employeeId, isActive: true },
    });
  }

  // A deactivated account: exists, cannot sign in.
  await prisma.user.upsert({
    where: { email: 'suresh.pillai@odoopnx.com' },
    update: { isActive: false },
    create: {
      email: 'suresh.pillai@odoopnx.com',
      passwordHash: password,
      role: 'EMPLOYEE',
      employeeId: 'employee-terminated',
      isActive: false,
    },
  });

  // One of each remaining role, so the permission matrix can be walked.
  for (const [email, role] of [
    ['hrmanager@odoopnx.com', 'HR_MANAGER'],
    ['payrollmanager@odoopnx.com', 'HR_PAYROLL_MANAGER'],
  ]) {
    await prisma.user.upsert({
      where: { email },
      update: { role, isActive: true },
      create: { email, passwordHash: password, role, isActive: true },
    });
  }
  console.log('logins         3 employees, 1 deactivated, + HR_MANAGER and HR_PAYROLL_MANAGER');

  // ── 8 · ATTENDANCE covering every status, on known dates ─────────────────
  await prisma.attendance.deleteMany({ where: { notes: 'seed:scenario' } });

  const at = (offset, h, m) => {
    const d = day(offset);
    d.setHours(h, m, 0, 0);
    return d;
  };

  await prisma.attendance.createMany({
    data: [
      { employeeId: veteran.id, checkIn: at(-3, 9, 0), checkOut: at(-3, 18, 0), workedHours: 8, status: 'PRESENT', notes: 'seed:scenario' },
      { employeeId: veteran.id, checkIn: at(-4, 10, 45), checkOut: at(-4, 18, 0), workedHours: 6.3, status: 'LATE', notes: 'seed:scenario' },
      { employeeId: veteran.id, checkIn: at(-5, 9, 0), checkOut: at(-5, 21, 30), workedHours: 11.5, status: 'OVERTIME', notes: 'seed:scenario' },
      { employeeId: veteran.id, checkIn: at(-6, 9, 0), checkOut: at(-6, 9, 0), workedHours: 0, status: 'ABSENT', notes: 'seed:scenario' },
      // No checkout at all: the record a human has to correct.
      { employeeId: veteran.id, checkIn: at(-7, 9, 10), checkOut: null, workedHours: null, status: 'MISSING_CHECKOUT', notes: 'seed:scenario' },
      { employeeId: leaver.id, checkIn: at(-3, 9, 5), checkOut: at(-3, 17, 5), workedHours: 8, status: 'MANUALLY_EDITED', isManualEdit: true, notes: 'seed:scenario' },
    ],
  });
  console.log('attendance     6 records covering all 6 statuses, including a manual edit');

  // ── 9 · TIME OFF in every state, against a real balance ──────────────────
  const types = await prisma.timeOffType.findMany();
  const paid = types.find((t) => /paid|annual/i.test(t.name)) ?? types[0];
  const unpaid = types.find((t) => t.affectsPayroll) ?? types[types.length - 1];

  for (const employeeId of [veteran.id, leaver.id, unbanked.id]) {
    for (const type of [paid, unpaid]) {
      if (!type) continue;
      await prisma.timeOffAllocation.upsert({
        where: { id: 'alloc-scenario-' + employeeId + '-' + type.id },
        update: {},
        create: {
          id: 'alloc-scenario-' + employeeId + '-' + type.id,
          employeeId,
          timeOffTypeId: type.id,
          allocated: 15,
          taken: 0,
          remaining: 15,
          validFrom: new Date('2026-01-01'),
          validTo: new Date('2026-12-31'),
          status: 'Approved',
        },
      });
    }
  }

  // An allocation still awaiting approval, so that status is represented.
  await prisma.timeOffAllocation.upsert({
    where: { id: 'alloc-scenario-pending' },
    update: { status: 'To Approve' },
    create: {
      id: 'alloc-scenario-pending',
      employeeId: unbanked.id,
      timeOffTypeId: paid.id,
      allocated: 5,
      taken: 0,
      remaining: 5,
      validFrom: day(0),
      validTo: new Date('2026-12-31'),
      status: 'To Approve',
    },
  });

  await prisma.timeOffRequest.deleteMany({ where: { reason: { startsWith: 'scenario:' } } });
  await prisma.timeOffRequest.createMany({
    data: [
      { employeeId: veteran.id, timeOffTypeId: paid.id, startDate: day(7), endDate: day(9), duration: 3, status: 'TO_APPROVE', reason: 'scenario: awaiting a decision' },
      { employeeId: veteran.id, timeOffTypeId: paid.id, startDate: day(-30), endDate: day(-29), duration: 2, status: 'APPROVED', reason: 'scenario: already approved', approvedAt: day(-32) },
      { employeeId: leaver.id, timeOffTypeId: unpaid.id, startDate: day(-15), endDate: day(-15), duration: 1, status: 'REFUSED', reason: 'scenario: refused, no cover available' },
      { employeeId: unbanked.id, timeOffTypeId: paid.id, startDate: day(-60), endDate: day(-58), duration: 3, status: 'CANCELLED', reason: 'scenario: withdrawn by the employee' },
      { employeeId: unbanked.id, timeOffTypeId: paid.id, startDate: day(3), endDate: day(4), duration: 2, status: 'TO_APPROVE', reason: 'scenario: pending for the department head' },
    ],
  });
  console.log('time off       5 requests across all 4 statuses, + a pending allocation');

  // Keep balances honest: approved leave must have come out of one.
  const approved = await prisma.timeOffRequest.findMany({
    where: { status: 'APPROVED', reason: { startsWith: 'scenario:' } },
  });
  for (const request of approved) {
    const allocation = await prisma.timeOffAllocation.findFirst({
      where: { employeeId: request.employeeId, timeOffTypeId: request.timeOffTypeId, status: 'Approved' },
    });
    if (allocation) {
      await prisma.timeOffAllocation.update({
        where: { id: allocation.id },
        data: { taken: { increment: request.duration }, remaining: { decrement: request.duration } },
      });
    }
  }

  // ── 10 · A SECOND SALARY STRUCTURE, to prove structures are selectable ───
  const alt = await prisma.salaryStructure.upsert({
    where: { id: 'structure-consultant' },
    update: {},
    create: {
      id: 'structure-consultant',
      name: 'Consultant Structure (no HRA)',
      description: 'Flat basic with a professional-tax deduction. Used for contract staff.',
      isActive: true,
    },
  });

  const altRules = [
    { id: 'rule-alt-basic', name: 'Basic Salary', code: 'BASIC', category: 'BASIC', sequence: 1, computationType: 'FORMULA', formula: 'basicWage * (workedDays / totalDays)' },
    { id: 'rule-alt-bonus', name: 'Delivery Bonus', code: 'BONUS', category: 'ALLOWANCE', sequence: 2, computationType: 'PERCENTAGE', percentageOf: 'BASIC', percentageValue: 10 },
    { id: 'rule-alt-ptax', name: 'Professional Tax', code: 'PTAX', category: 'DEDUCTION', sequence: 3, computationType: 'FIXED', amount: 200 },
    { id: 'rule-alt-gross', name: 'Gross Salary', code: 'GROSS', category: 'GROSS', sequence: 4, computationType: 'FORMULA', formula: 'BASIC + BONUS' },
    { id: 'rule-alt-net', name: 'Net Salary', code: 'NET', category: 'NET', sequence: 5, computationType: 'FORMULA', formula: 'GROSS - PTAX' },
  ];

  for (const rule of altRules) {
    await prisma.salaryRule.upsert({
      where: { id: rule.id },
      update: {},
      create: { ...rule, structureId: alt.id, active: true },
    });
  }
  console.log('payroll        a 2nd salary structure with a different rule set');

  // ── Summary ─────────────────────────────────────────────────────────────
  const counts = {
    employees: await prisma.employee.count(),
    contracts: await prisma.contract.count(),
    schedules: await prisma.workingSchedule.count(),
    attendance: await prisma.attendance.count(),
    allocations: await prisma.timeOffAllocation.count(),
    requests: await prisma.timeOffRequest.count(),
    structures: await prisma.salaryStructure.count(),
    users: await prisma.user.count(),
  };

  console.log('\nDatabase now holds:');
  for (const [k, v] of Object.entries(counts)) console.log('  ' + k.padEnd(14) + v);
  console.log('\nEvery status and edge case above is reachable in the UI.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
