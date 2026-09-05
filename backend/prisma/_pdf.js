const BASE = 'http://localhost:4000/api/v1';
async function j(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await res.text();
  if (!res.ok) throw new Error(method + ' ' + path + ' -> ' + res.status + ' ' + t.slice(0, 300));
  const p = JSON.parse(t); return p.data !== undefined ? p.data : p;
}
(async () => {
  const { accessToken: token } = await j('POST', '/auth/login', { email: 'admin@peoplepay360.com', password: 'password123' });
  const slips = await j('GET', '/payroll/payslips?limit=1', null, token);
  const slip = (slips.data || slips)[0];
  console.log('payslip ' + slip.id);

  console.log('\n-- GET /pdf (generate + upload to R2) --');
  const gen = await j('GET', '/payroll/payslips/' + slip.id + '/pdf', null, token);
  console.log(JSON.stringify(gen).slice(0, 400));

  console.log('\n-- GET /pdf/download (stream) --');
  const res = await fetch(BASE + '/payroll/payslips/' + slip.id + '/pdf/download', {
    headers: { Authorization: 'Bearer ' + token },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  console.log('status ' + res.status + ' | content-type ' + res.headers.get('content-type')
    + ' | ' + buf.length + ' bytes | magic ' + buf.slice(0, 5).toString());

  console.log('\n-- GET /explain --');
  const ex = await j('GET', '/payroll/payslips/' + slip.id + '/explain', null, token);
  console.log(JSON.stringify(ex).slice(0, 600));
})().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
