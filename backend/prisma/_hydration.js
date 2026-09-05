const puppeteer = require('puppeteer');
const APP = process.env.APP_URL || 'http://localhost:3000';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto(APP + '/login', { waitUntil: 'networkidle2' });
  await page.type('input[type="email"]', 'admin@peoplepay360.com');
  await page.type('input[type="password"]', 'password123');
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 30000 }),
  ]);

  await page.goto(APP + '/dashboard', { waitUntil: 'networkidle2' });
  await page.waitForFunction(
    () => !(document.body.innerText || '').includes('Loading your workspace'),
    { timeout: 45000 },
  );
  await new Promise((r) => setTimeout(r, 3000));

  const offenders = await page.evaluate(() => {
    const out = [];
    // <p> may only contain phrasing content; these are the block-level tags
    // React warns about when it finds them nested inside one.
    document.querySelectorAll('p').forEach((el) => {
      const bad = el.querySelector('div, p, ul, ol, table, section, h1, h2, h3, h4');
      if (bad) {
        out.push({
          pClass: (el.className || '').slice(0, 90),
          pText: (el.innerText || '').trim().slice(0, 70),
          childTag: bad.tagName,
          childClass: (bad.className || '').slice(0, 90),
        });
      }
    });
    return out;
  });

  console.log(offenders.length + ' <p> element(s) containing block-level children:');
  for (const o of offenders) console.dir(o, { depth: 1 });

  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
