/**
 * The payrun wizard, end to end in a browser.
 *
 * Step 1 picks a scope, step 2 picks people, "Create payrun" writes it, and
 * Compute must actually produce payslips. This walks that path exactly as an
 * operator would, because every part of it worked in isolation while the whole
 * did not.
 */
const puppeteer = require('puppeteer');
const path = require('path');

const BASE = 'http://localhost:4000/api/v1';
const APP = process.env.APP_URL || 'http://localhost:3000';
const SHOTS = path.join(__dirname, '..', '.ui-shots');

let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) pass += 1; else fail += 1;
  console.log((ok ? '  PASS ' : '  FAIL ') + label.padEnd(56) + (detail ?? ''));
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

async function settle(page) {
  await page.waitForFunction(
    () => !(document.body.innerText || '').includes('Loading your workspace'),
    { timeout: 45000 },
  );
  await new Promise((r) => setTimeout(r, 2000));
}

(async () => {
  const admin = (await api('POST', '/auth/login', null, {
    email: 'admin@odoopnx.com', password: 'password123',
  })).json.data;

  // A clean future period nothing else covers.
  const PERIOD_START = '2027-03-01';
  const PERIOD_END = '2027-03-31';
  const NAME = 'Wizard Test March 2027';

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const stale = await prisma.payrun.findMany({
    where: { periodStart: new Date(PERIOD_START + 'T00:00:00.000Z') },
    select: { id: true },
  });
  if (stale.length) {
    const ids = stale.map((r) => r.id);
    await prisma.payslipLine.deleteMany({ where: { payslip: { payrunId: { in: ids } } } });
    await prisma.payslip.deleteMany({ where: { payrunId: { in: ids } } });
    await prisma.payrun.deleteMany({ where: { id: { in: ids } } });
  }

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text().slice(0, 160));
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 160)));
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/api/v1/') && r.status() >= 400 && !u.includes('/auth/login')) {
      errors.push('api ' + r.status() + ': ' + u.replace('http://localhost:4000', '').slice(0, 80));
    }
  });

  // Sign in.
  await page.goto(APP + '/login', { waitUntil: 'networkidle2' });
  await page.type('input[type="email"]', 'admin@odoopnx.com', { delay: 5 });
  await page.type('input[type="password"]', 'password123', { delay: 5 });
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 45000, polling: 250 });

  // ── Step 1 ──────────────────────────────────────────────────────────────
  await page.goto(APP + '/payroll/payruns/new', { waitUntil: 'networkidle2' });
  await settle(page);

  await page.evaluate((start, end, name) => {
    const setValue = (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const dates = Array.from(document.querySelectorAll('input[type="date"]'));
    if (dates[0]) setValue(dates[0], start);
    if (dates[1]) setValue(dates[1], end);
    const nameInput = document.querySelector('#name, input[name="name"]');
    if (nameInput) setValue(nameInput, name);
  }, PERIOD_START, PERIOD_END, NAME);

  await new Promise((r) => setTimeout(r, 600));

  const continued = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('button')).find((b) =>
      /continue/i.test(b.innerText || ''),
    );
    if (button) { button.click(); return true; }
    return false;
  });
  check('step 1 has a Continue button', continued, '');

  await new Promise((r) => setTimeout(r, 3500));
  await page.screenshot({ path: path.join(SHOTS, 'WIZARD_step2.png') });

  const step2 = await page.evaluate(() => ({
    rows: document.querySelectorAll('tbody tr').length,
    text: document.body.innerText.slice(0, 400).replace(/\n+/g, ' | '),
    hasCreate: Array.from(document.querySelectorAll('button')).some((b) =>
      /create payrun/i.test(b.innerText || ''),
    ),
  }));
  check('step 2 lists selectable employees', step2.rows > 0, step2.rows + ' row(s)');
  check('step 2 offers "Create payrun"', step2.hasCreate, '');

  // ── Create ──────────────────────────────────────────────────────────────
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('button')).find((b) =>
      /create payrun/i.test(b.innerText || ''),
    );
    button?.click();
  });

  await page.waitForFunction(() => /\/payroll\/payruns\/[0-9a-f-]{8,}/.test(location.pathname), {
    timeout: 45000, polling: 300,
  }).catch(() => {});
  await settle(page);

  const onDetail = /\/payroll\/payruns\/[0-9a-f-]{8,}/.test(page.url());
  check('creating navigates to the new payrun', onDetail, page.url().replace(APP, ''));

  // Identify it by the id in the URL: the wizard derives the name from the
  // period, so matching on a name the test typed is fragile.
  const createdId = (page.url().match(/\/payroll\/payruns\/([0-9a-f-]{8,})/) || [])[1];

  const created = createdId
    ? await prisma.payrun.findUnique({
        where: { id: createdId },
        include: { payslips: { select: { id: true, status: true } } },
      })
    : null;
  check('the payrun exists in the database', Boolean(created), created ? created.status : 'missing');
  check('only the selected employees are in it', (created?.payslips.length ?? 0) === step2.rows,
    (created?.payslips.length ?? 0) + ' payslip(s) for ' + step2.rows + ' selected');

  // ── Compute ─────────────────────────────────────────────────────────────
  // The payrun query against a remote database takes a couple of seconds, so
  // wait for the button to become live rather than assuming it already is.
  const computeReady = await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll('button')).some(
          (b) => /^(compute|recompute)$/i.test((b.innerText || '').trim()) && !b.disabled,
        ),
      { timeout: 45000, polling: 400 },
    )
    .then(() => true)
    .catch(() => false);

  const clickedCompute = computeReady
    ? await page.evaluate(() => {
        const button = Array.from(document.querySelectorAll('button')).find(
          (b) => /^(compute|recompute)$/i.test((b.innerText || '').trim()) && !b.disabled,
        );
        if (button) { button.click(); return true; }
        return false;
      })
    : false;

  check('Compute is enabled on a new payrun', clickedCompute, computeReady ? '' : 'button never became enabled');

  // Compute now returns immediately and finishes in the background, so poll the
  // record itself rather than page text that may never say "Computing".
  let settled = null;
  for (let attempt = 0; createdId && attempt < 90; attempt += 1) {
    settled = await prisma.payrun.findUnique({
      where: { id: createdId },
      select: { status: true },
    });
    if (settled && settled.status !== 'COMPUTING' && settled.status !== 'DRAFT') break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log('  (settled to ' + (settled?.status ?? '?') + ')');

  // Let the polling UI catch up so the screenshot shows the finished state.
  await new Promise((r) => setTimeout(r, 3000));
  await page.screenshot({ path: path.join(SHOTS, 'WIZARD_computed.png') });

  const after = createdId
    ? await prisma.payrun.findUnique({
        where: { id: createdId },
        include: { payslips: { include: { lines: true } } },
      })
    : null;

  check('the payrun reaches COMPUTED', after?.status === 'COMPUTED', after?.status);
  const withLines = (after?.payslips ?? []).filter((p) => p.lines.length > 0).length;
  check('every payslip has computed lines', withLines === (after?.payslips.length ?? 0),
    withLines + '/' + (after?.payslips.length ?? 0));
  // March 2027 has no attendance, so every payslip legitimately computes to
  // zero. What matters is that each one says so rather than looking broken.
  const zero = (after?.payslips ?? []).filter((p) => Number(p.netAmount) === 0);
  const explained = zero.filter((p) =>
    Array.isArray(p.warnings) && p.warnings.some((w) => w.code === 'NO_WORKED_DAYS'),
  );
  check('a zero payslip explains itself', zero.length === 0 || explained.length === zero.length,
    explained.length + '/' + zero.length + ' carry NO_WORKED_DAYS');

  check('no console errors or failed API calls', errors.length === 0, errors.slice(0, 3).join(' | '));

  // ── Cleanup ─────────────────────────────────────────────────────────────
  if (after) {
    await prisma.payslipLine.deleteMany({ where: { payslip: { payrunId: after.id } } });
    await prisma.payslip.deleteMany({ where: { payrunId: after.id } });
    await prisma.payrun.delete({ where: { id: after.id } });
  }
  await prisma.$disconnect();
  await browser.close();

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASHED: ' + e.message); process.exit(1); });
