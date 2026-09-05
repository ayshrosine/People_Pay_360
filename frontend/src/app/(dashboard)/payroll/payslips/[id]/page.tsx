'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, Download, RefreshCw, Sparkles } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/primitives';
import { Skeleton } from '@/components/ui/data-table';
import { Dialog, SheetContent } from '@/components/ui/overlay';
import { CategoryChip, StatusChip } from '@/components/ui/status';
import {
  usePayslip,
  usePayslipExplanation,
  useRecomputePayslip,
} from '@/hooks/use-resources';
import { useAuth } from '@/lib/auth/auth-provider';
import { API_BASE_URL } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth-store';
import { cn, formatDate, formatMoneyPrecise, formatNumber } from '@/lib/utils';
import { toast } from 'sonner';

export default function PayslipPage() {
  const params = useParams<{ id: string }>();
  const { can } = useAuth();

  const id = params.id;
  const payslip = usePayslip(id);
  const recompute = useRecomputePayslip();

  const [explaining, setExplaining] = React.useState(false);
  const explanation = usePayslipExplanation(id, explaining);
  const [downloading, setDownloading] = React.useState(false);

  const blocking = payslip.data?.warnings?.filter((warning) => warning.severity === 'blocking') ?? [];
  const info = payslip.data?.warnings?.filter((warning) => warning.severity === 'info') ?? [];
  const immutable = payslip.data?.payrun?.status === 'PAID';

  /**
   * The PDF endpoint needs the bearer token, so a plain link would 401.
   * Fetch it with credentials, then hand the browser a blob URL.
   */
  async function downloadPdf() {
    setDownloading(true);
    try {
      const token = useAuthStore.getState().accessToken;
      const response = await fetch(`${API_BASE_URL}/payroll/payslips/${id}/pdf/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'include',
      });

      if (!response.ok) throw new Error(`Server responded ${response.status}`);

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `payslip-${payslip.data?.employee?.name ?? id}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(
        error instanceof Error ? `Could not generate the PDF: ${error.message}` : 'Download failed',
      );
    } finally {
      setDownloading(false);
    }
  }

  if (payslip.isLoading) {
    return (
      <PageShell title={<Skeleton className="h-6 w-56" />}>
        <Skeleton className="h-28" />
        <Skeleton className="mt-4 h-80" />
      </PageShell>
    );
  }

  const record = payslip.data;

  return (
    <PageShell
      breadcrumbs={[
        { label: 'Payruns', href: '/payroll/payruns' },
        ...(record?.payrunId
          ? [{ label: record.payrun?.name ?? 'Payrun', href: `/payroll/payruns/${record.payrunId}` }]
          : []),
        { label: record?.employee?.name ?? 'Payslip' },
      ]}
      title={
        <span className="flex items-center gap-3">
          {record?.employee?.name}
          <StatusChip status={record?.status} />
        </span>
      }
      description={
        record
          ? `${record.payrun?.name ?? ''} · ${formatDate(record.payrun?.periodStart)} → ${formatDate(
              record.payrun?.periodEnd,
            )}`
          : undefined
      }
      actions={
        <>
          <Button variant="secondary" onClick={() => setExplaining(true)}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Explain this payslip
          </Button>
          {can('update', 'Payslip') ? (
            <Button
              variant="secondary"
              disabled={immutable}
              title={immutable ? 'A payslip from a paid payrun is immutable.' : undefined}
              loading={recompute.isPending}
              onClick={() => recompute.mutate(id)}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Recompute
            </Button>
          ) : null}
          <Button variant="primary" loading={downloading} onClick={downloadPdf}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            Print payslip
          </Button>
        </>
      }
    >
      {blocking.length > 0 ? (
        <Card className="mb-4 border-[var(--status-danger)]">
          <ul className="divide-y divide-[var(--border-subtle)]">
            {blocking.map((warning, index) => (
              <li key={index} className="flex items-start gap-2.5 px-4 py-2.5">
                <AlertTriangle
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--status-danger)]"
                  aria-hidden
                />
                <span className="text-[12px] text-[var(--status-danger)]">{warning.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card>
          <CardHeader
            title="Salary computation"
            description="Each line is the persisted result of one salary rule"
          />

          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border-default)]">
                  {['#', 'Component', 'Code', 'Category', 'Amount'].map((heading, index) => (
                    <th
                      key={heading}
                      scope="col"
                      className={cn(
                        'px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]',
                        index === 4 ? 'text-right' : 'text-left',
                      )}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {record?.lines?.length ? (
                  record.lines.map((line) => {
                    const isTotal = line.category === 'GROSS' || line.category === 'NET';
                    const isDeduction = line.category === 'DEDUCTION';

                    return (
                      <tr
                        key={line.id}
                        className={cn(
                          'border-b border-[var(--border-subtle)]',
                          isTotal && 'bg-[var(--surface-sunken)]',
                        )}
                      >
                        <td className="ledger-num px-3 py-2.5 text-[11px] text-[var(--text-muted)]">
                          {line.sequence}
                        </td>
                        <td
                          className={cn(
                            'px-3 py-2.5',
                            isTotal
                              ? 'font-semibold text-[var(--text-primary)]'
                              : 'text-[var(--text-secondary)]',
                          )}
                        >
                          {line.label}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-[var(--text-tertiary)]">
                          {line.ruleCode}
                        </td>
                        <td className="px-3 py-2.5">
                          <CategoryChip category={line.category} />
                        </td>
                        <td
                          className={cn(
                            'ledger-num px-3 py-2.5 text-right',
                            isTotal && 'text-[15px] font-semibold',
                            isDeduction
                              ? 'text-[var(--status-danger)]'
                              : 'text-[var(--text-primary)]',
                          )}
                        >
                          {isDeduction ? '−' : ''}
                          {formatMoneyPrecise(line.amount)}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-[12px] text-[var(--text-muted)]">
                      This payslip has not been computed yet.
                    </td>
                  </tr>
                )}
              </tbody>

              <tfoot>
                <tr className="border-t-2 border-[var(--border-default)] bg-[var(--surface-sunken)]">
                  <td colSpan={4} className="px-3 py-3 text-[13px] font-semibold text-[var(--text-primary)]">
                    Net pay
                  </td>
                  <td className="ledger-num px-3 py-3 text-right text-[19px] font-semibold tracking-[-0.02em] text-[var(--accent)]">
                    {formatMoneyPrecise(record?.netAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-[var(--border-subtle)]">
              {[
                { label: 'Employee', value: record?.employee?.name },
                { label: 'Department', value: record?.employee?.department?.name ?? '—' },
                { label: 'Structure', value: record?.payrun?.salaryStructure?.name ?? '—' },
                { label: 'Worked days', value: formatNumber(record?.workedDays, 1), mono: true },
                { label: 'Gross', value: formatMoneyPrecise(record?.grossAmount), mono: true },
                { label: 'Net', value: formatMoneyPrecise(record?.netAmount), mono: true },
                {
                  label: 'Bank account',
                  value: record?.employee?.bankAccount ?? 'Not on file',
                  mono: true,
                },
              ].map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-3 px-4 py-2">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                    {row.label}
                  </dt>
                  <dd
                    className={cn(
                      'min-w-0 truncate text-right text-[12px] text-[var(--text-primary)]',
                      row.mono && 'ledger-num',
                    )}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          {info.length > 0 ? (
            <Card>
              <CardHeader title="Notes" />
              <ul className="divide-y divide-[var(--border-subtle)]">
                {info.map((warning, index) => (
                  <li key={index} className="px-4 py-2 text-[12px] text-[var(--text-tertiary)]">
                    {warning.message}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>

      <Dialog open={explaining} onOpenChange={setExplaining}>
        <SheetContent
          title="How this payslip was computed"
          description="Built from the stored rule results, not from the live rules."
        >
          <div className="space-y-4 p-5">
            {explanation.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-4" />
                ))}
              </div>
            ) : (
              <>
                <p className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3 text-[13px] leading-relaxed text-[var(--text-primary)]">
                  {explanation.data?.summary}
                </p>

                <ol className="space-y-2.5">
                  {explanation.data?.steps.map((step, index) => (
                    <li key={index} className="flex gap-2.5">
                      <span className="ledger-num mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--accent-subtle)] text-[10px] font-semibold text-[var(--accent)]">
                        {index + 1}
                      </span>
                      <span className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                        {step}
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </SheetContent>
      </Dialog>
    </PageShell>
  );
}
