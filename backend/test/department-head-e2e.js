/**
 * Department-head authority.
 *
 * A head is an ordinary EMPLOYEE whose power comes from `Department.headId`.
 * These checks prove the authority is real, and — more importantly — that it
 * stops exactly at the edge of their own department.
 */
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
  try { json = JSON.parse(text); } catch (e) { /* html error page */ }
  return { status: res.status, json, text };
}

function check(label, got, want) {
  const ok = Array.isArray(want) ? want.includes(got.status) : got.status === want;
  if (ok) pass += 1; else fail += 1;
  console.log((ok ? '  PASS ' : '  FAIL ') + label.padEnd(60) + got.status
    + (ok ? '' : '  expected ' + want + '  ' + got.text.slice(0, 200)));
  return ok;
}

async function login(email) {
  const r = await req('POST', '/auth/login', null, { email, password: 'password123' });
  if (r.status !== 200 && r.status !== 201) throw new Error('login failed for ' + email + ': ' + r.text.slice(0, 200));
  return r.json.data;
}

(async () => {
  const admin = await login('admin@peoplepay360.com');
  const A = admin.accessToken;

  const departments = (await req('GET', '/departments', A)).json.data;
  const withHead = departments.filter((d) => d.head);
  console.log('\n== SETUP ==');
  console.log('  ' + withHead.length + ' of ' + departments.length + ' departments have a head');
  for (const d of withHead) console.log('    ' + d.name.padEnd(18) + d.head.name);

  const engineering = departments.find((d) => d.name === 'Engineering');
  const other = departments.find((d) => d.head && d.id !== engineering.id);
  if (!engineering || !engineering.head || !other) throw new Error('need two headed departments to test against');

  const head = await login(engineering.head.workEmail);
  const H = head.accessToken;
  console.log('\n  signed in as head of Engineering: ' + engineering.head.name + ' (role ' + head.user.role + ')');

  console.log('\n== THE HEAD IS STILL AN ORDINARY EMPLOYEE ==');
  check('role is EMPLOYEE, not an elevated role', { status: head.user.role === 'EMPLOYEE' ? 200 : 500, text: head.user.role }, 200);
  check('still denied the payroll dashboard', await req('GET', '/dashboard/kpis', H), 403);
  check('still denied payruns', await req('GET', '/payroll/payruns', H), 403);
  check('still denied creating an employee', await req('POST', '/employees', H, { name: 'X', workEmail: 'x@y.com' }), 403);

  console.log('\n== SCOPED VISIBILITY ==');
  const employees = (await req('GET', '/employees?limit=200', A)).json.data;
  const mine = employees.filter((e) => e.departmentId === engineering.id && e.id !== engineering.head.id);
  const theirs = employees.filter((e) => e.departmentId === other.id);
  if (mine.length === 0 || theirs.length === 0) throw new Error('need staff in both departments');

  const visible = await req('GET', '/time-off/requests', H);
  check('head can list leave requests', visible, 200);
  const rows = visible.json.data || [];
  const outside = rows.filter(
    (r) => r.employee && r.employee.departmentId !== engineering.id && r.employeeId !== engineering.head.id,
  );
  check('sees only their own department (plus themselves)',
    { status: outside.length === 0 ? 200 : 500, text: outside.length + ' foreign row(s)' }, 200);
  console.log('       -> ' + rows.length + ' request(s) visible, ' + outside.length + ' from other departments');

  console.log('\n== APPROVING WITHIN THE DEPARTMENT ==');
  const types = (await req('GET', '/time-off/types', A)).json.data;
  const type = types[0];

  async function raise(employeeId, tag) {
    const alloc = await req('POST', '/time-off/allocations', A, {
      employeeId, timeOffTypeId: type.id, allocated: 5,
      validFrom: '2026-01-01', validTo: '2026-12-31', status: 'Approved',
    });
    if (alloc.status >= 400 && alloc.status !== 409) {
      // An allocation may already exist; that is fine.
    }
    const r = await req('POST', '/time-off/requests', A, {
      employeeId, timeOffTypeId: type.id,
      startDate: '2026-11-02', endDate: '2026-11-02', duration: 1, reason: 'head-test:' + tag,
    });
    if (r.status >= 400) throw new Error('could not raise request for ' + tag + ': ' + r.text.slice(0, 200));
    return r.json.data.id;
  }

  const insideId = await raise(mine[0].id, 'inside');
  const outsideId = await raise(theirs[0].id, 'outside');

  check('head approves a request in their own department',
    await req('PATCH', '/time-off/requests/' + insideId + '/approve', H), 200);

  const foreign = await req('PATCH', '/time-off/requests/' + outsideId + '/approve', H);
  check('head is refused a request in another department', foreign, 403);
  console.log('       -> ' + (foreign.json && foreign.json.code ? foreign.json.code : foreign.status));

  console.log('\n== A HEAD CANNOT DECIDE THEIR OWN LEAVE ==');
  const ownId = await raise(engineering.head.id, 'self');
  const own = await req('PATCH', '/time-off/requests/' + ownId + '/approve', H);
  check('head is refused their own request', own, 403);

  console.log('\n== A PLAIN EMPLOYEE HAS NONE OF THIS ==');
  // Not every employee has a login, so try each until one signs in.
  const candidates = employees.filter(
    (e) => e.departmentId === engineering.id && e.id !== engineering.head.id && e.workEmail,
  );
  let plainLogin = { status: 0 };
  for (const candidate of candidates) {
    const attempt = await req('POST', '/auth/login', null, {
      email: candidate.workEmail,
      password: 'password123',
    });
    if (attempt.status === 200 || attempt.status === 201) {
      plainLogin = attempt;
      console.log('  signed in as a non-head colleague: ' + candidate.name);
      break;
    }
  }
  if (plainLogin.status === 200 || plainLogin.status === 201) {
    const P = plainLogin.json.data.accessToken;
    check('a non-head employee cannot approve', await req('PATCH', '/time-off/requests/' + ownId + '/approve', P), 403);
    const theirRows = (await req('GET', '/time-off/requests', P)).json.data || [];
    const notTheirs = theirRows.filter((r) => r.employeeId !== plainLogin.json.data.user.employeeId);
    check('a non-head employee sees only their own requests',
      { status: notTheirs.length === 0 ? 200 : 500, text: notTheirs.length + ' foreign row(s)' }, 200);
  } else {
    console.log('  (no login for a plain employee in this department; skipped)');
  }

  console.log('\n== HEAD VALIDATION ==');
  check('an employee outside the department cannot lead it',
    await req('PATCH', '/departments/' + engineering.id, A, { headId: theirs[0].id }), 400);
  check('the real head is still in place',
    await req('PATCH', '/departments/' + engineering.id, A, { headId: engineering.head.id }), 200);

  console.log('\n== CLEANUP ==');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  await prisma.timeOffRequest.deleteMany({ where: { reason: { startsWith: 'head-test:' } } });
  await prisma.$disconnect();
  console.log('  test requests removed');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASHED: ' + e.message); process.exit(1); });
