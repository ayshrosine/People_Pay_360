/**
 * Row-level scope audit.
 *
 * Permission answers "may this role use this endpoint". This asks the second,
 * separate question: "which rows does it hand back?" It signs in as a plain
 * employee and a department head, then reports every list endpoint that returns
 * a record belonging to somebody else.
 */
const BASE = 'http://localhost:4000/api/v1';

async function req(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* html */ }
  return { status: res.status, json, text };
}

async function login(email) {
  const r = await req('POST', '/auth/login', null, { email, password: 'password123' });
  if (r.status !== 200 && r.status !== 201) throw new Error('login failed: ' + email + ' ' + r.text.slice(0, 160));
  return r.json.data;
}

/** Endpoints that return per-employee records, and how to read the owner. */
const OWNED = [
  { path: '/employees?limit=200', owner: (r) => r.id },
  { path: '/contracts', owner: (r) => r.employeeId },
  { path: '/attendance?limit=500', owner: (r) => r.employeeId },
  { path: '/time-off/allocations', owner: (r) => r.employeeId },
  { path: '/time-off/requests', owner: (r) => r.employeeId },
  { path: '/payroll/payslips?limit=200', owner: (r) => r.employeeId },
];

/** Reference data everyone may read; listed so the report is complete. */
const REFERENCE = ['/departments', '/working-schedules', '/time-off/types'];

async function audit(label, session, allowedOwners) {
  const token = session.accessToken;
  console.log('\n=== ' + label + ' (employeeId ' + session.user.employeeId + ') ===');

  let leaks = 0;
  for (const endpoint of OWNED) {
    const res = await req('GET', endpoint.path, token);
    if (res.status === 403) {
      console.log('  n/a  ' + endpoint.path.padEnd(34) + '403 forbidden (fine)');
      continue;
    }
    if (res.status !== 200) {
      console.log('  ??   ' + endpoint.path.padEnd(34) + res.status + ' ' + res.text.slice(0, 80));
      continue;
    }
    const rows = res.json.data || [];
    const foreign = rows.filter((r) => !allowedOwners.has(endpoint.owner(r)));
    if (foreign.length) leaks += 1;
    console.log(
      (foreign.length ? '  LEAK ' : '  ok   ') +
        endpoint.path.padEnd(34) +
        String(rows.length).padStart(4) + ' row(s), ' +
        foreign.length + ' belonging to someone else',
    );
  }

  for (const path of REFERENCE) {
    const res = await req('GET', path, token);
    const n = res.status === 200 ? (res.json.data || []).length : res.status;
    console.log('  ref  ' + path.padEnd(34) + n + ' (shared reference data)');
  }

  return leaks;
}

/**
 * Direct object references: scoping a list but not the record behind it just
 * moves the leak to a guessable URL. Each of these fetches somebody else's
 * record by id and expects to be refused.
 */
async function auditDirectAccess(label, session, foreign) {
  const token = session.accessToken;
  console.log('\n=== ' + label + ' · fetching another employee\'s records by id ===');

  let leaks = 0;
  for (const target of foreign) {
    if (!target.id) {
      console.log('  skip ' + target.path.padEnd(40) + '(no record to try)');
      continue;
    }
    const res = await req('GET', target.path + target.id, token);
    const blocked = res.status === 403 || res.status === 404;
    if (!blocked) leaks += 1;
    console.log(
      (blocked ? '  ok   ' : '  LEAK ') +
        (target.path + ':id').padEnd(40) +
        res.status +
        (blocked ? ' refused' : '  RETURNED SOMEONE ELSE\'S RECORD'),
    );
  }
  return leaks;
}

(async () => {
  const admin = await login('admin@odoopnx.com');

  // A plain employee: nobody's manager, heads no department.
  const employees = (await req('GET', '/employees?limit=200', admin.accessToken)).json.data;
  const departments = (await req('GET', '/departments', admin.accessToken)).json.data;
  const headIds = new Set(departments.map((d) => d.headId).filter(Boolean));

  let plain = null;
  for (const e of employees) {
    if (headIds.has(e.id)) continue;
    try {
      const s = await login(e.workEmail);
      plain = { session: s, employee: e };
      break;
    } catch { /* no login for this employee */ }
  }

  let head = null;
  for (const d of departments) {
    if (!d.head) continue;
    try {
      head = { session: await login(d.head.workEmail), department: d };
      break;
    } catch { /* no login */ }
  }

  let leaks = 0;

  if (plain) {
    leaks += await audit(
      'PLAIN EMPLOYEE · ' + plain.employee.name,
      plain.session,
      new Set([plain.session.user.employeeId]),
    );
  } else {
    console.log('\n(no plain employee with a login found)');
  }

  if (head) {
    // A head may legitimately see their whole department.
    const members = employees.filter((e) => e.departmentId === head.department.id).map((e) => e.id);
    leaks += await audit(
      'DEPARTMENT HEAD · ' + head.department.head.name + ' (' + head.department.name + ')',
      head.session,
      new Set([head.session.user.employeeId, ...members]),
    );
  } else {
    console.log('\n(no department head with a login found)');
  }

  // Pick records that belong to nobody the plain employee may see.
  if (plain) {
    const A = admin.accessToken;
    const mine = plain.session.user.employeeId;
    const other = employees.find((e) => e.id !== mine);

    const contracts = (await req('GET', '/contracts', A)).json.data || [];
    const allocations = (await req('GET', '/time-off/allocations', A)).json.data || [];
    const requests = (await req('GET', '/time-off/requests', A)).json.data || [];
    const attendance = (await req('GET', '/attendance?limit=200', A)).json.data || [];
    const payslips = (await req('GET', '/payroll/payslips?limit=200', A)).json.data || [];

    const notMine = (rows) => (rows.find((r) => r.employeeId !== mine) || {}).id;

    leaks += await auditDirectAccess('PLAIN EMPLOYEE · ' + plain.employee.name, plain.session, [
      { path: '/employees/', id: other && other.id },
      { path: '/contracts/', id: notMine(contracts) },
      { path: '/time-off/allocations/', id: notMine(allocations) },
      { path: '/time-off/requests/', id: notMine(requests) },
      { path: '/attendance/', id: notMine(attendance) },
      { path: '/payroll/payslips/', id: notMine(payslips) },
    ]);
  }

  console.log('\n' + (leaks === 0 ? 'No scope leaks.' : leaks + ' endpoint(s) leaking other people\'s rows.'));
  process.exit(leaks ? 1 : 0);
})().catch((e) => { console.error('CRASHED: ' + e.message); process.exit(1); });
