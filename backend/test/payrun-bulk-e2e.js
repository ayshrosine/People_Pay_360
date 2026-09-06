/**
 * Bulk payslip actions on a payrun.
 *
 * A payrun of forty people should not have to be redone because one of them is
 * wrong. These checks cover selecting a subset and removing, validating, paying
 * and sending it — and, just as importantly, every refusal that keeps the
 * payrun's own status honest.
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
  try { json = JSON.parse(text); } catch (e) { /* html */ }
  return { status: res.status, json, text };
}

function check(label, ok, detail) {
  if (ok) pass += 1; else fail += 1;
  console.log((ok ? '  PASS ' : '  FAIL ') + label.padEnd(62) + (detail ?? ''));
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

(async () => {
  const auth = (await req('POST', '/auth/login', null, { email: 'admin@odoopnx.com', password: 'password123' })).json.data;
  const T = auth.accessToken;

  const structure = (await req('GET', '/payroll/structures', T)).json.data[0];

  // A throwaway payrun in a period no other run uses, so nothing else is
  // touched. December 2026 is inside every seeded contract's date range and no
  // demo payrun covers it.
  const anchor = new Date(2026, 11, 1); // December 2026
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const name = 'BULK TEST ' + MONTHS[anchor.getMonth()] + ' ' + anchor.getFullYear();

  // Clean up a previous run of this test.
  const existing = (await req('GET', '/payroll/payruns', T)).json.data.filter((p) => p.name === name);
  if (existing.length) {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const ids = existing.map((p) => p.id);
    await prisma.payslipLine.deleteMany({ where: { payslip: { payrunId: { in: ids } } } });
    await prisma.payslip.deleteMany({ where: { payrunId: { in: ids } } });
    await prisma.payrun.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }

  const scope = (await req('POST', '/payroll/payruns/preview-scope', T, {
    salaryStructureId: structure.id, periodStart: iso(start), periodEnd: iso(end),
  })).json.data;

  if (scope.length < 3) throw new Error('need at least 3 payable employees for this test');

  const created = await req('POST', '/payroll/payruns', T, {
    name, salaryStructureId: structure.id,
    periodStart: iso(start), periodEnd: iso(end),
    employeeIds: scope.map((e) => e.id),
  });
  const payrunId = created.json.data.id;
  console.log('\npayrun "' + name + '" with ' + scope.length + ' employee(s)\n');

  await req('POST', '/payroll/payruns/' + payrunId + '/compute', T);
  let full = (await req('GET', '/payroll/payruns/' + payrunId, T)).json.data;
  let slips = full.payslips || [];
  check('computed every selected employee', slips.length === scope.length, slips.length + ' payslip(s)');

  console.log('\n== REMOVE A SELECTION ==');
  const drop = slips[0];
  const removed = await req('POST', '/payroll/payruns/' + payrunId + '/payslips/remove', T, {
    payslipIds: [drop.id],
  });
  check('removes the selected payslip', removed.status === 200, removed.json?.data?.removed + ' removed');

  full = (await req('GET', '/payroll/payruns/' + payrunId, T)).json.data;
  slips = full.payslips || [];
  check('the payrun now holds one fewer', slips.length === scope.length - 1, slips.length + ' left');
  check('the removed employee is gone', !slips.some((p) => p.id === drop.id), '');

  const foreign = await req('POST', '/payroll/payruns/' + payrunId + '/payslips/remove', T, {
    payslipIds: [drop.id],
  });
  check('a payslip not in this payrun is refused', foreign.status === 400, foreign.json?.code);

  const empty = await req('POST', '/payroll/payruns/' + payrunId + '/payslips/remove', T, { payslipIds: [] });
  check('an empty selection is refused', empty.status === 400, empty.json?.code);

  console.log('\n== BLOCKING WARNINGS STOP A SELECTION ==');
  const blocked = (full.payslips || []).filter(
    (p) => Array.isArray(p.warnings) && p.warnings.some((w) => w.severity === 'blocking'),
  );
  const clean = (full.payslips || []).filter((p) => !blocked.some((b) => b.id === p.id));
  console.log('  ' + blocked.length + ' payslip(s) blocked, ' + clean.length + ' clean');

  if (blocked.length > 0) {
    const refused = await req('POST', '/payroll/payruns/' + payrunId + '/payslips/validate', T, {
      payslipIds: [blocked[0].id],
    });
    check('a blocked payslip cannot be validated', refused.status === 400, refused.json?.code);
    check('the refusal names the problem', (refused.json?.errors || []).length > 0,
      (refused.json?.errors || [])[0]?.code);
  } else {
    console.log('  (no blocked payslip in this payrun; skipped)');
  }

  console.log('\n== VALIDATE A SELECTION ==');
  if (clean.length < 2) throw new Error('need at least 2 unblocked payslips');
  const half = clean.slice(0, Math.max(1, Math.floor(clean.length / 2)));
  const rest = clean.slice(half.length);

  const validated = await req('POST', '/payroll/payruns/' + payrunId + '/payslips/validate', T, {
    payslipIds: half.map((p) => p.id),
  });
  check('validates only the selected payslips', validated.status === 200, validated.json?.data?.validated + ' validated');

  full = (await req('GET', '/payroll/payruns/' + payrunId, T)).json.data;
  const statuses = (full.payslips || []).reduce((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1; return acc;
  }, {});
  check('the rest stay computed', (statuses.COMPUTED || 0) === rest.length, JSON.stringify(statuses));
  check('the payrun is still COMPUTED while any payslip is', full.status === 'COMPUTED', full.status);

  const twice = await req('POST', '/payroll/payruns/' + payrunId + '/payslips/validate', T, {
    payslipIds: half.map((p) => p.id),
  });
  check('validating an already-validated payslip is refused', twice.status === 400, twice.json?.code);

  console.log('\n== MARK A SELECTION PAID ==');
  const tooEarly = await req('POST', '/payroll/payruns/' + payrunId + '/payslips/mark-paid', T, {
    payslipIds: rest.map((p) => p.id),
  });
  check('a computed payslip cannot be marked paid', tooEarly.status === 400, tooEarly.json?.code);

  const paidSome = await req('POST', '/payroll/payruns/' + payrunId + '/payslips/mark-paid', T, {
    payslipIds: half.map((p) => p.id),
  });
  check('marks the validated selection paid', paidSome.status === 200, paidSome.json?.data?.paid + ' paid');

  console.log('\n== THE PAYRUN STATUS FOLLOWS ITS PAYSLIPS ==');
  // Drop the blocked payslips, which is what an operator does when someone is
  // missing bank details: pay everyone else now, sort that one out separately.
  if (blocked.length > 0) {
    const dropped = await req('POST', '/payroll/payruns/' + payrunId + '/payslips/remove', T, {
      payslipIds: blocked.map((p) => p.id),
    });
    check('blocked payslips can be removed to unblock the run', dropped.status === 200,
      dropped.json?.data?.removed + ' removed');
  }

  await req('POST', '/payroll/payruns/' + payrunId + '/payslips/validate', T, {
    payslipIds: rest.map((p) => p.id),
  });
  full = (await req('GET', '/payroll/payruns/' + payrunId, T)).json.data;
  check('all validated or paid => payrun VALIDATED', full.status === 'VALIDATED', full.status);

  console.log('\n== SEND A SELECTION ==');
  const sent = await req('POST', '/payroll/payruns/' + payrunId + '/payslips/send', T, {
    payslipIds: (full.payslips || []).map((p) => p.id),
  });
  check('sending records delivery', sent.status === 200, sent.json?.data?.message?.slice(0, 60));

  full = (await req('GET', '/payroll/payruns/' + payrunId, T)).json.data;
  const stamped = (full.payslips || []).filter((p) => p.emailSentAt).length;
  check('emailSentAt is stamped on every payslip', stamped === (full.payslips || []).length,
    stamped + '/' + (full.payslips || []).length);

  console.log('\n== IMMUTABILITY ==');
  await req('POST', '/payroll/payruns/' + payrunId + '/payslips/mark-paid', T, {
    payslipIds: rest.map((p) => p.id),
  });
  full = (await req('GET', '/payroll/payruns/' + payrunId, T)).json.data;
  check('all paid => payrun PAID', full.status === 'PAID', full.status);

  const removeAfterPaid = await req('POST', '/payroll/payruns/' + payrunId + '/payslips/remove', T, {
    payslipIds: [(full.payslips || [])[0].id],
  });
  check('a paid payrun refuses removal', removeAfterPaid.status === 400, removeAfterPaid.json?.code);

  console.log('\n== CLEANUP ==');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  await prisma.payslipLine.deleteMany({ where: { payslip: { payrunId } } });
  await prisma.payslip.deleteMany({ where: { payrunId } });
  await prisma.payrun.delete({ where: { id: payrunId } });
  await prisma.$disconnect();
  console.log('  test payrun removed');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASHED: ' + e.message); process.exit(1); });
