/**
 * The bulk payslip controls, in a real browser.
 *
 * The API tests prove the actions work; this proves an operator can reach them
 * — that selecting rows reveals the bar, that the counts describe the selection,
 * and that a paid payrun offers nothing at all.
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

async function openPayrun(page, id) {
  await page.goto(APP + '/payroll/payruns/' + id, { waitUntil: 'networkidle2' });
  await page.waitForFunction(
    () => !(document.body.innerText || '').includes('Loading your workspace'),
    { timeout: 45000 },
  );
  await page.waitForFunction(
    () => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      return rows.length > 0 && rows.some((r) => (r.innerText || '').trim().length > 0);
    },
    { timeout: 45000, polling: 300 },
  );
  await new Promise((r) => setTimeout(r, 1200));
}

(async () => {
  const admin = (await api('POST', '/auth/login', null, {
    email: 'admin@odoopnx.com', password: 'password123',
  })).json.data;

  const payruns = (await api('GET', '/payroll/payruns', admin.accessToken)).json.data;
  const open = payruns.find((p) => p.status === 'COMPUTED') || payruns.find((p) => p.status !== 'PAID');
  const paid = payruns.find((p) => p.status === 'PAID');
  if (!open) throw new Error('need a payrun that is not yet paid');

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950 });

  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text().slice(0, 160));
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 160)));

  await signIn(page, 'admin@odoopnx.com');

  console.log('\nOpen payrun: ' + open.name + ' (' + open.status + ')');
  await openPayrun(page, open.id);

  const boxes = await page.$$('tbody input[type="checkbox"]');
  check('rows offer a selection checkbox', boxes.length > 0, boxes.length + ' checkbox(es)');

  const barBefore = await page.evaluate(() => document.body.innerText.includes('payslip selected') || document.body.innerText.includes('payslips selected'));
  check('no bulk bar before anything is selected', !barBefore, '');

  if (boxes.length >= 2) {
    await boxes[0].click();
    await boxes[1].click();
    await new Promise((r) => setTimeout(r, 600));

    const bar = await page.evaluate(() => {
      const text = document.body.innerText;
      const m = text.match(/(\d+)\s+payslips?\s+selected/);
      return {
        shown: Boolean(m),
        count: m ? Number(m[1]) : 0,
        actions: Array.from(document.querySelectorAll('button'))
          .map((b) => (b.innerText || '').trim())
          .filter((t) => /^(Validate|Mark \d+ paid|Send|Remove)/.test(t)),
      };
    });

    check('selecting rows reveals the bulk bar', bar.shown, '');
    check('the bar counts the selection', bar.count === 2, bar.count + ' reported');
    check('it offers validate, pay, send and remove',
      bar.actions.length >= 4, bar.actions.join(' | '));

    await page.screenshot({ path: path.join(SHOTS, 'PAYRUN_bulk-selection.png') });

    // Select-all in the header.
    const headerBox = await page.$('thead input[type="checkbox"]');
    if (headerBox) {
      await headerBox.click();
      await new Promise((r) => setTimeout(r, 600));
      const all = await page.evaluate(() => {
        const m = document.body.innerText.match(/(\d+)\s+payslips?\s+selected/);
        return m ? Number(m[1]) : 0;
      });
      check('select-all picks every selectable row', all >= boxes.length, all + ' selected');
    }
  }

  if (paid) {
    console.log('\nPaid payrun: ' + paid.name + ' (immutable)');
    await openPayrun(page, paid.id);
    const paidBoxes = await page.$$('tbody input[type="checkbox"]');
    check('a paid payrun offers no selection at all', paidBoxes.length === 0,
      paidBoxes.length + ' checkbox(es)');
    await page.screenshot({ path: path.join(SHOTS, 'PAYRUN_paid-locked.png') });
  } else {
    console.log('\n(no paid payrun to check immutability against)');
  }

  check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASHED: ' + e.message); process.exit(1); });
