'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, BadgeCheck, Calculator, Mail, Wallet } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Avatar, Card, CardHeader } from '@/components/ui/primitives';
import { DataTable, Skeleton } from '@/components/ui/data-table';
import { StatusChip } from '@/components/ui/status';
import { usePayrun, usePayrunAction } from '@/hooks/use-resources';
import { useAuth } from '@/lib/auth/auth-provider';
import { cn, formatDate, formatMoney, formatNumber } from '@/lib/utils';
import type { Payslip, PayrunStatus } from '@/lib/api/types';

type Action = 'compute' | 'validate' | 'mark-paid' | 'send-payslips';

/**
 * Which actions are legal in which state. This mirrors the guards the API
 * enforces, so an invalid transition is never even clickable — the user finds
 * out from the disabled button and its tooltip, not from a rejected request.
 */
const ENABLED_IN: Record<Action, PayrunStatus[]> = {
  compute: ['DRAFT', 'COMPUTED', 'ERROR'],
  validate: ['COMPUTED'],
  'mark-paid': ['VALIDATED'],
  'send-payslips': ['VALIDATED', 'PAID'],
};

const DISABLED_REASON: Record<Action, string> = {
  compute: 'A paid payrun is immutable and cannot be recomputed.',
  validate: 'Compute the payslips before validating.',
  'mark-paid': 'Validate the payrun before marking it paid.',
  'send-payslips': 'Validate the payrun before sending payslips.',
};

/**
 * One transition button. Declared at module scope: defining it inside the page
 * component would make React treat it as a new component type on every render
 * and remount the whole action row.
 */
function ActionButton({
  action,
  label,
  icon: Icon,
  primary,
  status,
  canManage,
  pendingAction,
  onRun,
}: {
  action: Action;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  primary?: boolean;
  status?: PayrunStatus;
  canManage: boolean;
  pendingAction: Action | null;
  onRun: (action: Action) => void;
}) {
  const allowed = status ? ENABLED_IN[action].includes(status) : false;

  return (
    <Button
      variant={primary && allowed ? 'primary' : 'secondary'}
      disabled={!allowed || !canManage || pendingAction !== null}
      loading={pendingAction === action}
      title={!allowed ? DISABLED_REASON[action] : undefined}
      onClick={() => onRun(action)}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Button>
  );
}

export default function PayrunPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();

  const id = params.id;
  const payrun = usePayrun(id, {
    // While the backend is working through the batch, keep the screen honest.
    refetchInterval: (query) =>
      query.state.data?.status === 'COMPUTING' ? 2000 : false,
  });
  const runAction = usePayrunAction(id);

  const canManage = can('update', 'Payrun');
  const status = payrun.data?.status;
  const blocking = payrun.data?.blockingWarnings ?? [];
  const payslips = payrun.data?.payslips ?? [];

  const computedCount = payslips.filter((slip) => slip.status !== 'DRAFT').length;

  if (payrun.isLoading) {
    return (
      <PageShell title={<Skeleton className="h-6 w-56" />}>
        <Skeleton className="h-24" />
        <Skeleton className="mt-4 h-80" />
      </PageShell>
    );
  }

  return (
    <PageShell
      wide
      breadcrumbs={[
        { label: 'Payruns', href: '/payroll/payruns' },
        { label: payrun.data?.name ?? '' },
      ]}
      title={
        <span className="flex items-center gap-3">
          {payrun.data?.name}
          <StatusChip status={status} />
        </span>
      }
      description={
        payrun.data
          ? `${formatDate(payrun.data.periodStart)} → ${formatDate(payrun.data.periodEnd)} · ${
              payrun.data.salaryStructure?.name ?? 'No structure'
            }`
          : undefined
      }
      actions={
        <>
          {(
            [
              {
                action: 'compute',
                label: status === 'COMPUTED' ? 'Recompute' : 'Compute',
                icon: Calculator,
                primary: status === 'DRAFT',
              },
              { action: 'validate', label: 'Validate', icon: BadgeCheck, primary: status === 'COMPUTED' },
              { action: 'mark-paid', label: 'Mark paid', icon: Wallet, primary: status === 'VALIDATED' },
              { action: 'send-payslips', label: 'Send payslips', icon: Mail, primary: false },
            ] as const
          ).map((entry) => (
            <ActionButton
              key={entry.action}
              action={entry.action}
              label={entry.label}
              icon={entry.icon}
              primary={entry.primary}
              status={status}
              canManage={canManage}
              pendingAction={runAction.isPending ? (runAction.variables ?? null) : null}
              onRun={runAction.mutate}
            />
          ))}
        </>
      }
    >
      {status === 'COMPUTING' ? (
        <Card className="mb-4 p-4">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-[var(--text-secondary)]">Computing payslips…</span>
            <span className="ledger-num text-[var(--text-tertiary)]">
              {computedCount} / {payslips.length}
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 [transition-timing-function:var(--ease-out)]"
              style={{
                width: `${payslips.length ? (computedCount / payslips.length) * 100 : 0}%`,
              }}
            />
          </div>
        </Card>
      ) : null}

      {blocking.length > 0 ? (
        <Card className="mb-4 border-[var(--status-warning)]">
          <div className="flex items-start gap-2.5 border-b border-[var(--border-subtle)] bg-[var(--status-warning-bg)] px-4 py-2.5">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-warning)]"
              aria-hidden
            />
            <div>
              <p className="text-[13px] font-medium text-[var(--status-warning)]">
                {blocking.length} blocking issue{blocking.length === 1 ? '' : 's'} must be resolved
                before this payrun can be validated
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">
                Fix the underlying record, then recompute.
              </p>
            </div>
          </div>

          <ul className="max-h-44 divide-y divide-[var(--border-subtle)] overflow-y-auto">
            {blocking.map((warning, index) => (
              <li
                key={`${warning.payslipId}-${index}`}
                className="flex items-center justify-between gap-3 px-4 py-2"
              >
                <span className="min-w-0 text-[12px] text-[var(--text-secondary)]">
                  <span className="font-medium text-[var(--text-primary)]">
                    {warning.employeeName ?? 'Employee'}
                  </span>
                  {' — '}
                  {warning.message}
                </span>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  {warning.code}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="mb-4 grid gap-px overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--border-subtle)] sm:grid-cols-3">
        {[
          { label: 'Employees', value: formatNumber(payrun.data?.totals?.employeeCount ?? 0) },
          { label: 'Total gross', value: formatMoney(payrun.data?.totals?.gross ?? 0) },
          {
            label: 'Total net',
            value: formatMoney(payrun.data?.totals?.net ?? 0),
            accent: true,
          },
        ].map((tile) => (
          <div key={tile.label} className="bg-[var(--surface-base)] px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {tile.label}
            </p>
            <p
              className={cn(
                'ledger-num mt-1 text-[22px] font-semibold leading-none tracking-[-0.03em]',
                tile.accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]',
              )}
            >
              {tile.value}
            </p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader title="Payslips" description="Click a row for the full rule breakdown" />
        <DataTable<Payslip>
          rows={payslips}
          rowKey={(row) => row.id}
          onRowClick={(row) => router.push(`/payroll/payslips/${row.id}`)}
          emptyTitle="No payslips in this payrun"
          columns={[
            {
              key: 'employee',
              header: 'Employee',
              cell: (row) => (
                <div className="flex items-center gap-2.5">
                  <Avatar name={row.employee?.name ?? '?'} src={row.employee?.avatarUrl} size={26} />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--text-primary)]">
                      {row.employee?.name ?? '—'}
                    </p>
                    <p className="truncate text-[11px] text-[var(--text-muted)]">
                      {row.employee?.department?.name ?? '—'}
                    </p>
                  </div>
                </div>
              ),
            },
            {
              key: 'worked',
              header: 'Worked days',
              numeric: true,
              cell: (row) => formatNumber(row.workedDays, 1),
            },
            { key: 'gross', header: 'Gross', numeric: true, cell: (row) => formatMoney(row.grossAmount) },
            {
              key: 'net',
              header: 'Net',
              numeric: true,
              cell: (row) => (
                <span className="font-semibold text-[var(--text-primary)]">
                  {formatMoney(row.netAmount)}
                </span>
              ),
            },
            {
              key: 'warnings',
              header: 'Warnings',
              cell: (row) =>
                row.warnings?.length ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-[var(--status-warning)]">
                    <AlertTriangle className="h-3 w-3" aria-hidden />
                    {row.warnings.length}
                  </span>
                ) : (
                  <span className="text-[var(--text-muted)]">—</span>
                ),
            },
            { key: 'status', header: 'Status', cell: (row) => <StatusChip status={row.status} /> },
          ]}
        />
      </Card>
    </PageShell>
  );
}
