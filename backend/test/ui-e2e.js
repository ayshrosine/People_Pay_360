/**
 * Drives the real UI in a browser: signs in as each role, visits every route,
 * and reports anything the page did wrong - console errors, failed API calls,
 * error boundaries, or an empty render.
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const APP = process.env.APP_URL || 'http://localhost:3001';
const SHOTS = process.env.SHOT_DIR || path.join(__dirname, '..', '.ui-shots');

const ROLES = [
  {
    label: 'ADMIN', email: 'admin@odoopnx.com',
    routes: [
      '/dashboard', '/employees', '/contracts', '/working-schedules',
      '/attendance', '/time-off', '/time-off/requests', '/time-off/allocations',
      '/time-off/types', '/payroll', '/payroll/payruns', '/payroll/payruns/new',
      '/payroll/payslips', '/payroll/structures', '/admin/users',
    ],
  },
  {
    label: 'HR_PAYROLL_USER', email: 'hrpayroll@odoopnx.com',
    routes: ['/dashboard', '/employees', '/payroll/payruns', '/payroll/payslips', '/attendance'],
  },
  {
    label: 'EMPLOYEE', email: 'john.doe@odoopnx.com',
    routes: ['/attendance', '/time-off', '/payroll/payslips'],
  },
];

const IGNORABLE = [
  'favicon', 'Download the React DevTools', 'Fast Refresh',
  'net::ERR_ABORTED', '_next/static',
];

function ignorable(text) {
  return IGNORABLE.some((frag) => text.includes(frag));
}

async function signIn(page, email) {
  await page.goto(APP + '/login', { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 20000 });
  await page.evaluate(() => {
    document.querySelectorAll('input').forEach((i) => { i.value = ''; });
  });
  await page.type('input[type="email"], input[name="email"]', email, { delay: 5 });
  await page.type('input[type="password"], input[name="password"]', 'password123', { delay: 5 });
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForFunction(() => !window.location.pathname.startsWith('/login'), { timeout: 30000 }),
  ]);
  return page.url();
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  let problems = 0, visited = 0;

  for (const role of ROLES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !ignorable(msg.text())) errors.push('console: ' + msg.text().slice(0, 200));
    });
    page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 200)));
    page.on('requestfailed', (r) => {
      if (!ignorable(r.url())) errors.push('requestfailed: ' + r.url().slice(0, 120));
    });
    page.on('response', (r) => {
      const u = r.url();
      if (u.includes('/api/v1/') && r.status() >= 400 && !u.includes('/auth/login')) {
        errors.push('api ' + r.status() + ': ' + u.replace('http://localhost:4000', '').slice(0, 110));
      }
    });

    console.log('\n=== ' + role.label + ' ===');
    let landing;
    try {
      landing = await signIn(page, role.email);
    } catch (e) {
      console.log('  FAIL  sign-in: ' + e.message.slice(0, 160));
      problems += 1;
      await page.close();
      continue;
    }
    console.log('  PASS  sign-in -> ' + landing.replace(APP, ''));

    for (const route of role.routes) {
      errors.length = 0;
      visited += 1;
      try {
        await page.goto(APP + route, { waitUntil: 'networkidle2', timeout: 45000 });
        // A full page load drops the in-memory access token, so the app first
        // trades the refresh token for a new one behind a spinner. Wait for
        // that to clear rather than guessing at a fixed delay.
        await page.waitForFunction(
          () => !(document.body.innerText || '').includes('Loading your workspace'),
          { timeout: 45000 },
        );
        // Then let the route's own queries resolve.
        await new Promise((r) => setTimeout(r, 5000));

        const info = await page.evaluate(() => {
          const body = document.body.innerText || '';
          return {
            chars: body.trim().length,
            crashed: /Application error|Unhandled Runtime Error|something went wrong/i.test(body),
            forbidden: /you do not have permission|forbidden/i.test(body),
            path: window.location.pathname,
            buttons: document.querySelectorAll('button, a[href]').length,
          };
        });

        const shot = role.label + route.replace(/\//g, '_') + '.png';
        await page.screenshot({ path: path.join(SHOTS, shot) });

        const bad = info.crashed || info.chars < 120 || errors.length > 0;
        if (bad) problems += 1;
        const redirected = info.path !== route ? ' -> ' + info.path : '';
        console.log((bad ? '  FAIL  ' : '  PASS  ') + route.padEnd(24)
          + String(info.chars).padStart(5) + ' chars, ' + String(info.buttons).padStart(3) + ' controls'
          + redirected + (info.forbidden ? '  [access denied page]' : ''));
        for (const e of errors.slice(0, 4)) console.log('          ' + e);
      } catch (e) {
        problems += 1;
        console.log('  FAIL  ' + route.padEnd(24) + e.message.slice(0, 140));
      }
    }
    await page.close();
  }

  await browser.close();
  console.log('\n' + visited + ' pages visited, ' + problems + ' with problems');
  console.log('screenshots in ' + SHOTS);
  process.exit(problems ? 1 : 0);
})().catch((e) => { console.error('UI RUN CRASHED: ' + e.stack); process.exit(1); });
