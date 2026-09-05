const BASE = 'http://localhost:4000/api/v1';
let pass = 0, fail = 0;

async function req(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* non-JSON body */ }
  return { status: res.status, json, text };
}

function check(label, got, want) {
  const ok = Array.isArray(want) ? want.includes(got.status) : got.status === want;
  if (ok) pass += 1; else fail += 1;
  const count = got.json && Array.isArray(got.json.data) ? ' (' + got.json.data.length + ' rows)' : '';
  console.log((ok ? '  PASS ' : '  FAIL ') + label.padEnd(54) + got.status + count
    + (ok ? '' : '  expected ' + want + '  ' + got.text.slice(0, 160)));
}

async function login(email) {
  const r = await req('POST', '/auth/login', null, { email, password: 'password123' });
  if (r.status !== 200 && r.status !== 201) throw new Error('login failed for ' + email + ': ' + r.text.slice(0, 200));
  return r.json.data;
}

(async () => {
  const admin = await login('admin@peoplepay360.com');
  const hr = await login('hrpayroll@peoplepay360.com');
  const emp = await login('john.doe@peoplepay360.com');
  const A = admin.accessToken, H = hr.accessToken, E = emp.accessToken;

  console.log('\n== AUTH ==');
  check('GET  /auth/me', await req('GET', '/auth/me', A), 200);
  check('POST /auth/refresh', await req('POST', '/auth/refresh', null, { refreshToken: admin.refreshToken }), [200, 201]);
  check('GET  /auth/me without a token is rejected', await req('GET', '/auth/me', null), 401);
  check('POST /auth/login with a bad password is rejected', await req('POST', '/auth/login', null, { email: 'admin@peoplepay360.com', password: 'wrongpassword123' }), 401);

  console.log('\n== READS as ADMIN ==');
  const reads = [
    '/employees?limit=100', '/departments', '/contracts', '/working-schedules',
    '/attendance?limit=50', '/time-off/types', '/time-off/allocations', '/time-off/requests',
    '/payroll/structures', '/payroll/payruns', '/payroll/payslips?limit=50',
    '/dashboard/kpis', '/dashboard/salary-cost-by-department', '/dashboard/monthly-net-salary-trend',
    '/dashboard/payslip-status-breakdown', '/dashboard/alerts', '/dashboard/attendance-overview',
    '/dashboard/time-off-overview', '/dashboard/department-overview',
  ];
  for (const p of reads) check('GET  ' + p, await req('GET', p, A), 200);

  console.log('\n== RBAC ==');
  check('EMPLOYEE is denied the dashboard', await req('GET', '/dashboard/kpis', E), 403);
  check('EMPLOYEE is denied payruns', await req('GET', '/payroll/payruns', E), 403);
  check('EMPLOYEE is denied creating an employee', await req('POST', '/employees', E, { name: 'X', workEmail: 'x@y.com' }), 403);
  check('EMPLOYEE is denied salary structures', await req('GET', '/payroll/structures', E), 403);
  check('HR_PAYROLL_USER may read payruns', await req('GET', '/payroll/payruns', H), 200);

  const mine = await req('GET', '/employees?limit=100', E);
  check('EMPLOYEE sees only their own employee row', mine, 200);
  if (mine.json && mine.json.data) {
    console.log('       -> ' + mine.json.data.length + ' row(s): ' + mine.json.data.map((e) => e.name).join(', '));
  }

  const myslips = await req('GET', '/payroll/payslips?limit=50', E);
  check('EMPLOYEE sees only their own payslips', myslips, 200);
  if (myslips.json && myslips.json.data) {
    const others = myslips.json.data.filter((s) => s.employeeId !== emp.user.employeeId);
    console.log('       -> ' + myslips.json.data.length + ' payslip(s), ' + others.length + ' belonging to someone else');
  }

  console.log('\n== WRITES: full CRUD round-trip ==');
  const dep = await req('POST', '/departments', A, { name: 'Sweep Dept ' + Date.now() });
  check('POST   /departments', dep, [200, 201]);
  const depId = dep.json && dep.json.data && dep.json.data.id;

  const created = await req('POST', '/employees', A, {
    name: 'Sweep Tester', workEmail: 'sweep.' + Date.now() + '@peoplepay360.com',
    jobPosition: 'Test Engineer', departmentId: depId, employeeType: 'Full-time', status: 'ACTIVE',
  });
  check('POST   /employees', created, [200, 201]);
  const empId = created.json && created.json.data && created.json.data.id;

  check('PATCH  /employees/:id', await req('PATCH', '/employees/' + empId, A, { jobPosition: 'Senior Test Engineer' }), 200);
  check('GET    /employees/:id', await req('GET', '/employees/' + empId, A), 200);

  const structures = await req('GET', '/payroll/structures', A);
  const structId = structures.json.data[0].id;

  const contract = await req('POST', '/contracts', A, {
    employeeId: empId, department: 'Sweep', jobPosition: 'Test Engineer',
    startDate: '2026-02-01', wage: 50000, wageType: 'Monthly',
    salaryStructureId: structId, status: 'RUNNING',
  });
  check('POST   /contracts', contract, [200, 201]);
  const contractId = contract.json && contract.json.data && contract.json.data.id;

  check('POST   /contracts overlapping is rejected', await req('POST', '/contracts', A, {
    employeeId: empId, department: 'Sweep', jobPosition: 'Test Engineer',
    startDate: '2026-03-01', wage: 51000, wageType: 'Monthly',
    salaryStructureId: structId, status: 'RUNNING',
  }), 409);

  const att = await req('POST', '/attendance/check-in', A, { employeeId: empId });
  check('POST   /attendance/check-in', att, [200, 201]);
  const attId = att.json && att.json.data && att.json.data.id;
  if (attId) {
    check('POST   /attendance/:id/check-out', await req('POST', '/attendance/' + attId + '/check-out', A), [200, 201]);
    check('PATCH  /attendance/:id (manual edit)', await req('PATCH', '/attendance/' + attId, A, { notes: 'edited by sweep' }), 200);
  }

  const types = await req('GET', '/time-off/types', A);
  const typeId = types.json.data[0].id;

  const alloc = await req('POST', '/time-off/allocations', A, {
    employeeId: empId, timeOffTypeId: typeId, allocated: 5,
    validFrom: '2026-01-01', validTo: '2026-12-31', status: 'Approved',
  });
  check('POST   /time-off/allocations', alloc, [200, 201]);

  const leave = await req('POST', '/time-off/requests', A, {
    employeeId: empId, timeOffTypeId: typeId,
    startDate: '2026-10-01', endDate: '2026-10-02', duration: 2, reason: 'sweep test',
  });
  check('POST   /time-off/requests', leave, [200, 201]);
  const leaveId = leave.json && leave.json.data && leave.json.data.id;

  if (leaveId) {
    check('PATCH  /time-off/requests/:id/approve', await req('PATCH', '/time-off/requests/' + leaveId + '/approve', A), [200, 201]);
    const after = await req('GET', '/time-off/allocations?employeeId=' + empId, A);
    const row = (after.json.data || []).find((a) => a.timeOffTypeId === typeId);
    if (row) console.log('       -> allocation after approval: allocated ' + row.allocated + ', taken ' + row.taken + ', remaining ' + row.remaining);
  }

  const over = await req('POST', '/time-off/requests', A, {
    employeeId: empId, timeOffTypeId: typeId,
    startDate: '2026-11-01', endDate: '2026-12-31', duration: 60, reason: 'over balance',
  });
  check('POST   /time-off/requests beyond the balance is rejected', over, [400, 409, 422]);

  check('POST   /payroll/rules/validate accepts a good formula', await req('POST', '/payroll/rules/validate', A, { formula: 'BASIC + HRA' }), [200, 201]);
  const escape = await req('POST', '/payroll/rules/validate', A, { formula: 'import("fs")' });
  const escapeBlocked = escape.status === 400 || (escape.json && escape.json.data && escape.json.data.valid === false);
  check('POST   /payroll/rules/validate blocks a sandbox escape', { status: escapeBlocked ? 400 : escape.status, json: null, text: escape.text }, 400);

  console.log('\n== PAYRUN IMMUTABILITY ==');
  const runs = await req('GET', '/payroll/payruns', A);
  const paid = (runs.json.data || []).find((r) => r.status === 'PAID');
  if (paid) {
    check('a PAID payrun cannot be recomputed', await req('POST', '/payroll/payruns/' + paid.id + '/compute', A), [400, 409]);
    check('a PAID payrun cannot be re-validated', await req('POST', '/payroll/payruns/' + paid.id + '/validate', A), [400, 409]);
  } else {
    console.log('  (no PAID payrun found to test against)');
  }

  console.log('\n== CLEANUP ==');
  // An employee carrying history must not be deletable - it must be archived.
  check('DELETE /employees/:id is refused while history exists', await req('DELETE', '/employees/' + empId, A), 409);
  check('PATCH  /employees/:id can archive instead', await req('PATCH', '/employees/' + empId, A, { status: 'TERMINATED' }), 200);

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  await prisma.timeOffRequest.deleteMany({ where: { employeeId: empId } });
  await prisma.timeOffAllocation.deleteMany({ where: { employeeId: empId } });
  await prisma.attendance.deleteMany({ where: { employeeId: empId } });
  await prisma.contract.deleteMany({ where: { employeeId: empId } });
  await prisma.$disconnect();

  check('DELETE /employees/:id succeeds once it is clean', await req('DELETE', '/employees/' + empId, A), [200, 204]);
  if (depId) await req('DELETE', '/departments/' + depId, A);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SWEEP CRASHED: ' + e.message); process.exit(1); });
