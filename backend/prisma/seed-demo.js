/**
 * Representative demo data, layered on top of the base seed.
 *
 * Master data only - no payslips are written here. Payruns are created through
 * the real API afterwards so every payslip line is genuinely produced by the
 * salary-rule engine rather than hand-written, which is the whole point of the
 * payroll module.
 *
 * Safe to re-run: everything keys off a deterministic id or a natural key.
 */
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

const prisma = new PrismaClient();

const DEPARTMENTS = [
  { id: 'dept-engineering', name: 'Engineering' },
  { id: 'dept-sales', name: 'Sales' },
  { id: 'dept-hr', name: 'Human Resources' },
  { id: 'dept-finance', name: 'Finance' },
  { id: 'dept-support', name: 'Support' },
];

const SCHEDULES = [
  {
    id: 'schedule-standard-demo', name: 'Standard 40 Hours/Week', scheduleType: 'Fixed',
    days: [0, 1, 2, 3, 4], start: '09:00', end: '18:00', brk: 60,
  },
  {
    id: 'schedule-night-demo', name: 'Night Shift 40 Hours/Week', scheduleType: 'Fixed',
    days: [0, 1, 2, 3, 4], start: '22:00', end: '07:00', brk: 60,
  },
  {
    id: 'schedule-parttime-demo', name: 'Part-time 20 Hours/Week', scheduleType: 'Flexible',
    days: [0, 1, 2, 3], start: '09:00', end: '14:00', brk: 0,
  },
];

// Employees 1-3 come from the base seed; 4-12 are added here. `sched` lands on
// the contract, not the employee: a schedule is a term of employment.
const EMPLOYEES = [
  { id: 'employee-4', name: 'Priya Sharma', pos: 'Backend Engineer', dept: 'dept-engineering', type: 'Full-time', wage: 62000, sched: 'schedule-standard-demo', bank: '5512340098', ifsc: 'HDFC0001234' },
  { id: 'employee-5', name: 'Arjun Nair', pos: 'Frontend Engineer', dept: 'dept-engineering', type: 'Full-time', wage: 58000, sched: 'schedule-standard-demo', bank: '5512340099', ifsc: 'HDFC0001234' },
  { id: 'employee-6', name: 'Meera Iyer', pos: 'QA Engineer', dept: 'dept-engineering', type: 'Full-time', wage: 48000, sched: 'schedule-standard-demo', bank: '5512340100', ifsc: 'ICIC0004321' },
  { id: 'employee-7', name: 'Rohan Verma', pos: 'Account Executive', dept: 'dept-sales', type: 'Full-time', wage: 52000, sched: 'schedule-standard-demo', bank: '5512340101', ifsc: 'ICIC0004321' },
  { id: 'employee-8', name: 'Ananya Desai', pos: 'Sales Development', dept: 'dept-sales', type: 'Full-time', wage: 41000, sched: 'schedule-standard-demo', bank: null, ifsc: null },
  { id: 'employee-9', name: 'Vikram Rao', pos: 'Support Engineer', dept: 'dept-support', type: 'Full-time', wage: 39000, sched: 'schedule-night-demo', bank: '5512340103', ifsc: 'SBIN0009876' },
  { id: 'employee-10', name: 'Kavya Menon', pos: 'Support Specialist', dept: 'dept-support', type: 'Part-time', wage: 24000, sched: 'schedule-parttime-demo', bank: '5512340104', ifsc: 'SBIN0009876' },
  { id: 'employee-11', name: 'Sanjay Gupta', pos: 'Financial Analyst', dept: 'dept-finance', type: 'Full-time', wage: 56000, sched: 'schedule-standard-demo', bank: '5512340105', ifsc: 'AXIS0005555' },
  { id: 'employee-12', name: 'Divya Krishnan', pos: 'HR Generalist', dept: 'dept-hr', type: 'Full-time', wage: 44000, sched: 'schedule-standard-demo', bank: '5512340106', ifsc: 'AXIS0005555' },
];

const slug = (name) => name.toLowerCase().replace(/[^a-z]+/g, '.');

function weeklyHours(schedule) {
  const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  // Night shifts wrap past midnight, so add a day when the end precedes the start.
  let span = mins(schedule.end) - mins(schedule.start);
  if (span <= 0) span += 24 * 60;
  return (schedule.days.length * (span - schedule.brk)) / 60;
}

async function main() {
  console.log('Seeding representative demo data...\n');

  // Match on name, not id: the base seed already owns some of these names under
  // different ids, and creating a second row would leave the dashboard showing
  // two "Engineering" departments.
  const departmentIds = new Map();
  for (const d of DEPARTMENTS) {
    const existing = await prisma.department.findFirst({ where: { name: d.name } });
    const row = existing ?? (await prisma.department.create({ data: d }));
    departmentIds.set(d.id, row.id);
  }
  console.log('departments        ' + DEPARTMENTS.length + ' (reused where they already existed)');

  for (const s of SCHEDULES) {
    const total = weeklyHours(s);
    await prisma.workingSchedule.upsert({
      where: { id: s.id },
      update: { name: s.name, scheduleType: s.scheduleType, totalWeeklyHours: total },
      create: {
        id: s.id, name: s.name, scheduleType: s.scheduleType,
        totalWeeklyHours: total, company: 'OXP Pvt Ltd', timezone: 'Asia/Kolkata', status: 'Active',
        lines: {
          create: s.days.map((dayOfWeek) => ({
            dayOfWeek, startTime: s.start, endTime: s.end, breakMinutes: s.brk,
          })),
        },
      },
    });
  }
  console.log('working schedules  ' + SCHEDULES.length);

  const structure = await prisma.salaryStructure.findFirst({ where: { isActive: true } });
  if (!structure) throw new Error('No active salary structure - run the base seed first.');

  const manager = await prisma.employee.findUnique({ where: { id: 'employee-1' } });

  for (const e of EMPLOYEES) {
    await prisma.employee.upsert({
      where: { id: e.id },
      update: { departmentId: departmentIds.get(e.dept), employeeType: e.type },
      create: {
        id: e.id, name: e.name, workEmail: slug(e.name) + '@odoopnx.com',
        jobPosition: e.pos, departmentId: departmentIds.get(e.dept),
        employeeType: e.type, status: 'ACTIVE', phone: '+91 90000 00000',
        bankAccount: e.bank, bankIfsc: e.ifsc,
        managerId: manager && manager.id !== e.id ? manager.id : null,
      },
    });

    // Exactly one RUNNING contract each - the database exclusion constraint
    // forbids two RUNNING contracts with overlapping dates for one employee.
    await prisma.contract.upsert({
      where: { id: 'contract-' + e.id },
      update: { wage: e.wage, salaryStructureId: structure.id, status: 'RUNNING' },
      create: {
        id: 'contract-' + e.id, employeeId: e.id,
        department: DEPARTMENTS.find((d) => d.id === e.dept).name,
        jobPosition: e.pos,
        startDate: new Date('2026-01-01'), endDate: null,
        wage: e.wage, wageType: 'Monthly',
        salaryStructureId: structure.id, workingScheduleId: e.sched,
        status: 'RUNNING',
      },
    });
  }
  console.log('employees          +' + EMPLOYEES.length + ' (one RUNNING contract each)');

  // A self-service login for one of the new employees.
  const password = await argon2.hash('password123');
  await prisma.user.upsert({
    where: { email: 'priya.sharma@odoopnx.com' },
    update: { employeeId: 'employee-4' },
    create: {
      email: 'priya.sharma@odoopnx.com', passwordHash: password,
      role: 'EMPLOYEE', employeeId: 'employee-4', isActive: true,
    },
  });

  // Attendance far enough back to cover every historical payrun period —
  // including the earliest showcase months — otherwise those periods compute
  // as zero worked days and a demo payrun pays nothing.
  const allEmployees = await prisma.employee.findMany({ where: { status: 'ACTIVE' } });
  await prisma.attendance.deleteMany({ where: { notes: 'seed:demo' } });

  const attendance = [];
  const today = new Date();
  for (let back = 1; back <= 260; back += 1) {
    const day = new Date(today);
    day.setDate(day.getDate() - back);
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue; // weekends are not working days

    for (const emp of allEmployees) {
      // A deterministic pseudo-random draw keeps re-runs stable.
      const roll = (back * 31 + emp.id.length * 17 + emp.name.charCodeAt(0)) % 100;
      if (roll < 4) continue; // no record at all

      const start = new Date(day);
      let status = 'PRESENT';
      let hours = 8;

      if (roll < 9) {
        start.setHours(9, 0, 0, 0);
        attendance.push({
          employeeId: emp.id, checkIn: start, checkOut: start,
          workedHours: 0, status: 'ABSENT', notes: 'seed:demo',
        });
        continue;
      }

      if (roll < 20) { status = 'LATE'; start.setHours(10, 12, 0, 0); hours = 7.3; }
      else if (roll < 30) { status = 'OVERTIME'; start.setHours(9, 0, 0, 0); hours = 10.5; }
      else if (roll < 34) { status = 'MISSING_CHECKOUT'; start.setHours(9, 5, 0, 0); }
      else { start.setHours(9, 2, 0, 0); hours = 8.1; }

      const end = status === 'MISSING_CHECKOUT' ? null : new Date(start.getTime() + hours * 3600000);
      attendance.push({
        employeeId: emp.id, checkIn: start, checkOut: end,
        workedHours: end ? hours : null, status,
        isManualEdit: roll >= 96, notes: 'seed:demo',
      });
    }
  }
  await prisma.attendance.createMany({ data: attendance });
  console.log('attendance         ' + attendance.length + ' records over the last ~9 months');

  // Time off: allocations for everyone, requests in every state.
  const types = await prisma.timeOffType.findMany();
  const paid = types.find((t) => /paid|annual/i.test(t.name)) || types[0];
  const sick = types.find((t) => /sick/i.test(t.name)) || types[types.length - 1];

  for (const emp of allEmployees) {
    for (const type of [paid, sick]) {
      if (!type) continue;
      const allocated = type.id === paid.id ? 20 : 10;
      await prisma.timeOffAllocation.upsert({
        where: { id: 'alloc-' + emp.id + '-' + type.id },
        update: {},
        create: {
          id: 'alloc-' + emp.id + '-' + type.id, employeeId: emp.id, timeOffTypeId: type.id,
          allocated, taken: 0, remaining: allocated,
          validFrom: new Date('2026-01-01'), validTo: new Date('2026-12-31'),
          status: 'Approved',
        },
      });
    }
  }

  await prisma.timeOffRequest.deleteMany({ where: { reason: { startsWith: 'seed:' } } });
  const requests = [];
  const states = ['APPROVED', 'APPROVED', 'TO_APPROVE', 'REFUSED'];
  allEmployees.slice(0, 8).forEach((emp, index) => {
    const start = new Date(today);
    start.setDate(start.getDate() - (20 - index * 2));
    const days = (index % 3) + 1;
    const end = new Date(start);
    end.setDate(end.getDate() + days - 1);
    requests.push({
      employeeId: emp.id, timeOffTypeId: index % 2 ? sick.id : paid.id,
      startDate: start, endDate: end, duration: days,
      status: states[index % states.length],
      reason: 'seed: ' + (index % 2 ? 'Medical leave' : 'Family vacation'),
      approvedAt: states[index % states.length] === 'APPROVED' ? new Date() : null,
    });
  });
  await prisma.timeOffRequest.createMany({ data: requests });

  // Approved leave must actually consume the allocation it was drawn from.
  for (const req of requests.filter((r) => r.status === 'APPROVED')) {
    const alloc = await prisma.timeOffAllocation.findFirst({
      where: { employeeId: req.employeeId, timeOffTypeId: req.timeOffTypeId, status: 'Approved' },
    });
    if (alloc) {
      await prisma.timeOffAllocation.update({
        where: { id: alloc.id },
        data: { taken: { increment: req.duration }, remaining: { decrement: req.duration } },
      });
    }
  }
  console.log('time off           ' + requests.length + ' requests, allocations debited on approval');

  console.log('\nDemo master data ready. Payruns are created through the API so');
  console.log('every payslip line comes from the salary-rule engine.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
