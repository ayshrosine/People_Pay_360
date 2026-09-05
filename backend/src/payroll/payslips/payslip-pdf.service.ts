import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { Browser } from 'puppeteer';
import { FilesService } from '../../files/files.service';

type PdfPayslip = {
  id: string;
  workedDays: number;
  grossAmount: unknown;
  netAmount: unknown;
  createdAt: Date;
  payrun: { name: string; periodStart: Date; periodEnd: Date; salaryStructure: { name: string } };
  employee: {
    name: string;
    workEmail: string;
    jobPosition: string | null;
    bankAccount: string | null;
    department: { name: string } | null;
  };
  lines: { label: string; ruleCode: string; category: string; amount: unknown }[];
};

/**
 * Renders a payslip to PDF with Puppeteer and, when object storage is
 * configured, uploads it to Cloudflare R2.
 *
 * The browser is launched lazily and reused: a cold Chromium launch per
 * payslip would dominate the cost of a bulk payrun.
 */
@Injectable()
export class PayslipPdfService {
  private readonly logger = new Logger(PayslipPdfService.name);
  private browserPromise: Promise<Browser> | null = null;

  constructor(private readonly files: FilesService) {}

  async generateAndStore(payslip: PdfPayslip): Promise<string> {
    const buffer = await this.render(payslip);

    if (!this.files.isConfigured()) {
      // Without R2 the frontend falls back to the inline download endpoint.
      this.logger.warn(
        'Cloudflare R2 is not configured; serving the payslip PDF inline instead of storing it.',
      );
      return `/api/v1/payroll/payslips/${payslip.id}/pdf/download`;
    }

    const key = this.files.generateKey('payslips', `${payslip.id}.pdf`);
    return this.files.uploadFile(buffer, key, 'application/pdf');
  }

  async render(payslip: PdfPayslip): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.setContent(this.buildHtml(payslip), { waitUntil: 'domcontentloaded' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = (async () => {
        const puppeteer = await import('puppeteer');
        return puppeteer.default.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-dev-shm-usage'],
        });
      })().catch((error) => {
        // Reset so a later request can retry rather than latching the failure.
        this.browserPromise = null;
        this.logger.error('Failed to launch Chromium for PDF rendering', error);
        throw new ServiceUnavailableException({
          message:
            'PDF rendering is unavailable: Chromium could not be launched. Run "npx puppeteer browsers install chrome".',
          code: 'PDF_ENGINE_UNAVAILABLE',
        });
      });
    }

    return this.browserPromise;
  }

  async onModuleDestroy() {
    const browser = await this.browserPromise?.catch(() => null);
    await browser?.close().catch(() => undefined);
  }

  private buildHtml(payslip: PdfPayslip): string {
    const money = (value: unknown) =>
      Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2 });

    const date = (value: Date) => new Date(value).toISOString().slice(0, 10);

    const rows = payslip.lines
      .map((line) => {
        const isTotal = line.category === 'GROSS' || line.category === 'NET';
        const isDeduction = line.category === 'DEDUCTION';
        return `
          <tr class="${isTotal ? 'total' : ''}">
            <td>${escapeHtml(line.label)}<span class="code">${escapeHtml(line.ruleCode)}</span></td>
            <td class="cat">${escapeHtml(line.category)}</td>
            <td class="amt ${isDeduction ? 'neg' : ''}">${isDeduction ? '-' : ''}${money(line.amount)}</td>
          </tr>`;
      })
      .join('');

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Inter, Helvetica, Arial, sans-serif;
    color: #1a1d24; font-size: 12px; margin: 0;
  }
  header { display: flex; justify-content: space-between; align-items: flex-start;
           border-bottom: 2px solid #6366F1; padding-bottom: 14px; }
  h1 { font-size: 20px; margin: 0 0 2px; letter-spacing: -0.02em; }
  .muted { color: #6b7280; font-size: 11px; }
  .period { text-align: right; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; margin: 20px 0 24px; }
  .field { border-bottom: 1px solid #eceef2; padding-bottom: 6px; }
  .label { color: #6b7280; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
  .value { font-weight: 600; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .06em;
       color: #6b7280; border-bottom: 1px solid #d9dce3; padding: 6px 0; }
  td { padding: 7px 0; border-bottom: 1px solid #f1f2f5; vertical-align: top; }
  .code { display: block; color: #9aa1ae; font-size: 10px; font-family: "JetBrains Mono", monospace; }
  .cat { color: #6b7280; font-size: 10px; }
  .amt { text-align: right; font-family: "JetBrains Mono", ui-monospace, monospace;
         font-variant-numeric: tabular-nums; }
  .neg { color: #b4232b; }
  tr.total td { font-weight: 700; border-top: 1px solid #d9dce3; background: #fafbfc; }
  footer { margin-top: 28px; color: #9aa1ae; font-size: 10px; border-top: 1px solid #eceef2;
           padding-top: 10px; }
</style>
</head>
<body>
  <header>
    <div>
      <h1>Payslip</h1>
      <div class="muted">PeoplePay360</div>
    </div>
    <div class="period">
      <div class="value">${escapeHtml(payslip.payrun.name)}</div>
      <div class="muted">${date(payslip.payrun.periodStart)} to ${date(payslip.payrun.periodEnd)}</div>
    </div>
  </header>

  <div class="grid">
    <div class="field"><div class="label">Employee</div><div class="value">${escapeHtml(payslip.employee.name)}</div></div>
    <div class="field"><div class="label">Work email</div><div class="value">${escapeHtml(payslip.employee.workEmail)}</div></div>
    <div class="field"><div class="label">Job position</div><div class="value">${escapeHtml(payslip.employee.jobPosition ?? '-')}</div></div>
    <div class="field"><div class="label">Department</div><div class="value">${escapeHtml(payslip.employee.department?.name ?? '-')}</div></div>
    <div class="field"><div class="label">Salary structure</div><div class="value">${escapeHtml(payslip.payrun.salaryStructure.name)}</div></div>
    <div class="field"><div class="label">Worked days</div><div class="value">${payslip.workedDays}</div></div>
  </div>

  <table>
    <thead><tr><th>Component</th><th>Category</th><th class="amt">Amount</th></tr></thead>
    <tbody>
      ${rows}
      <tr class="total"><td>Gross pay</td><td class="cat">GROSS</td><td class="amt">${money(payslip.grossAmount)}</td></tr>
      <tr class="total"><td>Net pay</td><td class="cat">NET</td><td class="amt">${money(payslip.netAmount)}</td></tr>
    </tbody>
  </table>

  <footer>
    Generated ${new Date().toISOString().slice(0, 10)} &middot; Payslip reference ${escapeHtml(payslip.id)}
    <br />This is a computer-generated document and does not require a signature.
  </footer>
</body>
</html>`;
  }
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
