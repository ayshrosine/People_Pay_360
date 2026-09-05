/**
 * The department-head experience in the browser.
 *
 * Proves the approve controls actually appear for a head — the API tests show
 * the authority exists, this shows it is reachable.
 */
const puppeteer = require('puppeteer');
const path = require('path');

const APP = process.env.APP_URL || 'http://localhost:3000';
const SHOTS = path.join(__dirname, '..', '.ui-shots');

async function signIn(page, email) {
  await page.goto(APP + '/login', { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.type('input[type="email"]', email, { delay: 5 });
  await page.type('input[type="password"]', 'password123', { delay: 5 });
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !window.location.pathname.startsWith('/login'), {
    timeout: 45000,
    polling: 250,
  });
}

async function settle(page) {
  await page.waitForFunction(
    () => !(document.body.innerText || '').includes('Loading your workspace'),
    { timeout: 45000 },
  );
  // Wait for real rows rather than the loading skeletons - the skeleton table
  // has the same row count, so a fixed delay silently measures placeholders.
  await page.waitForFunction(
    () => {
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      return rows.length > 0 && rows.some((r) => (r.innerText || '').trim().length > 0);
    },
    { timeout: 45000, polling: 300 },
  );
  await new Promise((r) => setTimeout(r, 1000));
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text().slice(0, 180));
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 180)));

  // John Doe heads Engineering and is otherwise an ordinary employee.
  await signIn(page, 'john.doe@odoopnx.com');
  await page.goto(APP + '/time-off/requests', { waitUntil: 'networkidle2' });
  await settle(page);

  const view = await page.evaluate(() => ({
    rows: document.querySelectorAll('tbody tr').length,
    pending: (document.body.innerText.match(/To approve/gi) || []).length,
    approveButtons: document.querySelectorAll('[aria-label^="Approve request"]').length,
    refuseButtons: document.querySelectorAll('[aria-label^="Refuse request"]').length,
    text: (document.body.innerText || '').slice(0, 200).replace(/\n+/g, ' | '),
  }));

  await page.screenshot({ path: path.join(SHOTS, 'HEAD_time-off_requests.png') });

  console.log('Department head — Leave requests');
  console.log('  rows visible:      ' + view.rows);
  console.log('  pending requests:  ' + view.pending);
  console.log('  approve controls:  ' + view.approveButtons);
  console.log('  refuse controls:   ' + view.refuseButtons);
  console.log('  console errors:    ' + errors.length);
  errors.forEach((e) => console.log('    ' + e));

  const ok = view.rows > 0 && view.approveButtons > 0 && errors.length === 0;
  console.log(ok ? '\n  PASS the head can act on their department' : '\n  FAIL');

  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('CRASHED: ' + e.message); process.exit(1); });
