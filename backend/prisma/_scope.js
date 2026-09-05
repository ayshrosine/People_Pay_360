const BASE = 'http://localhost:4000/api/v1';

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

(async () => {
  const login = await req('POST', '/auth/login', null, { email: 'john.doe@peoplepay360.com', password: 'password123' });
  const { accessToken, user } = login.json.data;
  console.log('signed in as ' + user.email + ' | role ' + user.role + ' | employeeId ' + user.employeeId);

  const slips = await req('GET', '/payroll/payslips?limit=100', accessToken);
  const rows = slips.json.data || [];
  console.log('\npayslips visible: ' + rows.length);
  const owners = new Set(rows.map((r) => r.employeeId));
  console.log('distinct employeeIds in the result: ' + owners.size);
  console.log('all belong to the caller: ' + (owners.size === 1 && owners.has(user.employeeId)));
  console.log('sample row employeeId: ' + rows[0].employeeId + ' | name: ' + (rows[0].employee ? rows[0].employee.name : 'n/a'));

  // Direct object reference: can they fetch someone else's payslip by id?
  const admin = await req('POST', '/auth/login', null, { email: 'admin@peoplepay360.com', password: 'password123' });
  const all = await req('GET', '/payroll/payslips?limit=100', admin.json.data.accessToken);
  const foreign = (all.json.data || []).find((p) => p.employeeId !== user.employeeId);
  const attempt = await req('GET', '/payroll/payslips/' + foreign.id, accessToken);
  console.log('\nfetching another employee\'s payslip by id -> ' + attempt.status
    + (attempt.status === 403 || attempt.status === 404 ? '  (blocked, correct)' : '  LEAK'));

  const att = await req('GET', '/attendance?limit=200', accessToken);
  const attOwners = new Set((att.json.data || []).map((r) => r.employeeId));
  console.log('attendance rows ' + (att.json.data || []).length + ' from ' + attOwners.size + ' employee(s) -> '
    + (attOwners.size <= 1 ? 'scoped, correct' : 'LEAK'));

  const emps = await req('GET', '/employees?limit=100', accessToken);
  const bank = (emps.json.data || []).map((e) => e.bankAccount).filter(Boolean);
  console.log('employee rows ' + (emps.json.data || []).length + ' | bank details exposed: ' + bank.length);

  const me = await req('GET', '/auth/me', accessToken);
  console.log('passwordHash present in /auth/me: ' + JSON.stringify(me.json).includes('passwordHash'));
})().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
