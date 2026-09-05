const BASE = 'http://localhost:4000/api/v1';

async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' },
      token ? { Authorization: 'Bearer ' + token } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
  if (!res.ok) throw new Error(method + ' ' + path + ' -> ' + res.status + ' ' + text.slice(0, 400));
  return json.data !== undefined ? json.data : json;
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

(async () => {
  const auth = await call('POST', '/auth/login', { email: 'admin@peoplepay360.com', password: 'password123' });
  const token = auth.accessToken;
  console.log('signed in as ADMIN');

  const structures = await call('GET', '/payroll/structures', null, token);
  const structure = (structures.data || structures)[0];
  console.log('structure: ' + structure.name + '\n');

  const existing = await call('GET', '/payroll/payruns', null, token);
  const known = new Set((existing.data || existing).map((p) => p.name));

  const now = new Date();
  // Three closed months plus the month in progress, so the trend chart has a
  // real series rather than a single point.
  for (let back = 3; back >= 0; back -= 1) {
    const anchor = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const name = MONTHS[anchor.getMonth()] + ' ' + anchor.getFullYear();
    if (known.has(name)) { console.log(name.padEnd(18) + 'already exists, skipped'); continue; }

    // Ask the API which employees are payable for this period rather than
    // pushing everyone in and tripping the blocking-warning guard.
    const scope = await call('POST', '/payroll/payruns/preview-scope', {
      salaryStructureId: structure.id, periodStart: iso(start), periodEnd: iso(end),
    }, token);
    const ids = (scope.data || scope).map((e) => e.id);

    const run = await call('POST', '/payroll/payruns', {
      name, salaryStructureId: structure.id,
      periodStart: iso(start), periodEnd: iso(end), employeeIds: ids,
    }, token);

    let state = await call('POST', '/payroll/payruns/' + run.id + '/compute', {}, token);
    for (let i = 0; i < 30 && state.status === 'COMPUTING'; i += 1) {
      await new Promise((r) => setTimeout(r, 1000));
      state = await call('GET', '/payroll/payruns/' + run.id, null, token);
    }

    const cols = [name.padEnd(18), String(state.status).padEnd(10), ids.length + ' in scope'];
    if (state.status === 'COMPUTED') {
      // The current month stays COMPUTED so the UI has a payrun to act on.
      if (back > 0) {
        await call('POST', '/payroll/payruns/' + run.id + '/validate', {}, token);
        const paid = await call('POST', '/payroll/payruns/' + run.id + '/mark-paid', {}, token);
        cols[1] = String(paid.status).padEnd(10);
      }
      const full = await call('GET', '/payroll/payruns/' + run.id, null, token);
      const slips = full.payslips || [];
      const net = slips.reduce((s, p) => s + Number(p.netAmount || 0), 0);
      cols.push(slips.length + ' payslips', 'net ' + net.toLocaleString('en-IN'));
    } else {
      cols.push(JSON.stringify(state).slice(0, 200));
    }
    console.log(cols.join('  '));
  }
})().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
