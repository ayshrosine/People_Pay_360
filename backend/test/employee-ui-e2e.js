/**
 * What a plain employee actually sees.
 *
 * The API refuses what it should; this checks the interface does not offer it
 * in the first place. An approve button that 403s is still a bug.
 */
const puppeteer = require('puppeteer');
const path = require('path');

const BASE = 'http://localhost:4000/api/v1';
const APP = process.env.APP_URL || 'http://localhost:3000';
const SHOTS = path.join(__dirname, '..', '.ui-shots');

let pass = 0, fail = 0;

function check(label, ok, detail) {
  if (ok) pass += 1; else fail += 1;
  console.log((ok ? '  PASS ' : '  FAIL ') + label.padEnd(58) + (detail ?? ''));
}

async function api(method, p, token, body) {
  const res = await fetch(BASE + p, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return { status: res.status, json: JSON.parse(text) }; } catch { return { status: res.status, json: null }; }
}

async function signIn(page, email) {
  await page.goto(APP + '/login', { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.type('input[type="email"]', email, { delay: 5 });
  await page.type('input[type="password"]', 'password123', { delay: 5 });
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !window.location.pathname.startsWith('/login'), {
    timeout: 45000, polling: 250,
  });
}

async function settle(page) {
  await page.waitForFunction(
    () => !(document.body.innerText || '').includes('Loading your workspace'),
    { timeout: 45000 },
  );
  await new Promise((r) => setTimeout(r, 3500));
}

(async () => {
  // Find a plain employee: one with a login who heads no department.
  const admin = (await api('POST', '/auth/login', null, {
    email: 'admin@odoopnx.com', password: 'password123',
  })).json.data;

  const employees = (await api('GET', '/employees?limit=200', admin.accessToken)).json.data;
  const departments = (await api('GET', '/departments', admin.accessToken)).json.data;
  const headIds = new Set(departments.map((d) => d.headId).filter(Boolean));

  let plain = null;
  for (const e of employees) {
    if (headIds.has(e.id)) continue;
    const attempt = await api('POST', '/auth/login', null, { email: e.workEmail, password: 'password123' });
    if (attempt.status === 200 || attempt.status === 201) { plain = e; break; }
  }
  if (!plain) throw new Error('no plain employee with a login to test');

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text().slice(0, 160));
  });
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/api/v1/') && r.status() >= 400 && !u.includes('/auth/login')) {
      errors.push('api ' + r.status() + ': ' + u.replace('http://localhost:4000', '').slice(0, 90));
    }
  });

  console.log('Plain employee: ' + plain.name + ' (' + plain.workEmail + ')\n');
  await signIn(page, plain.workEmail);

  // ---- leave requests: no approve or refuse controls anywhere -------------
  await page.goto(APP + '/time-off/requests', { waitUntil: 'networkidle2' });
  await settle(page);
  const leave = await page.evaluate(() => ({
    approve: document.querySelectorAll('[aria-label^="Approve request"]').length,
    refuse: document.querySelectorAll('[aria-label^="Refuse request"]').length,
    rows: document.querySelectorAll('tbody tr').length,
  }));
  await page.screenshot({ path: path.join(SHOTS, 'EMPLOYEE_leave-requests.png') });
  check('no approve control on leave requests', leave.approve === 0, leave.approve + ' found');
  check('no refuse control on leave requests', leave.refuse === 0, leave.refuse + ' found');

  // ---- allocations: only their own ---------------------------------------
  await page.goto(APP + '/time-off/allocations', { waitUntil: 'networkidle2' });
  await settle(page);
  const allocNames = await page.evaluate(() =>
    Array.from(document.querySelectorAll('tbody tr')).map((r) => (r.innerText || '').split('\t')[0].trim()),
  );
  const foreignAlloc = allocNames.filter((n) => n && !n.includes(plain.name.split(' ')[0]));
  await page.screenshot({ path: path.join(SHOTS, 'EMPLOYEE_allocations.png') });
  check('allocations show only their own', foreignAlloc.length === 0,
    allocNames.length + ' row(s), ' + foreignAlloc.length + ' for other people');

  // ---- contracts: only their own -----------------------------------------
  await page.goto(APP + '/contracts', { waitUntil: 'networkidle2' });
  await settle(page);
  const contractRows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('tbody tr')).map((r) => (r.innerText || '').split('\t')[0].trim()),
  );
  const foreignContracts = contractRows.filter((n) => n && !n.includes(plain.name.split(' ')[0]));
  await page.screenshot({ path: path.join(SHOTS, 'EMPLOYEE_contracts.png') });
  check('contracts show only their own', foreignContracts.length === 0,
    contractRows.length + ' row(s), ' + foreignContracts.length + ' for other people');

  // ---- the sidebar offers nothing they cannot use ------------------------
  const nav = await page.evaluate(() =>
    Array.from(document.querySelectorAll('aside a')).map((a) => a.getAttribute('href')),
  );
  check('no Dashboard link in the sidebar', !nav.includes('/dashboard'), nav.join(' '));
  check('no Users link in the sidebar', !nav.some((h) => h && h.startsWith('/admin')), '');

  check('no console errors or failed API calls', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASHED: ' + e.message); process.exit(1); });
