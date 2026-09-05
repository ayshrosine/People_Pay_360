'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';
import { EmptyState, Skeleton } from '@/components/ui/data-table';
import { StatusChip } from '@/components/ui/status';
import { usePayruns } from '@/hooks/use-resources';
import { useAuth } from '@/lib/auth/auth-provider';
import { formatDate, formatMoney, formatNumber } from '@/lib/utils';

/** The five states a payrun moves through, drawn as a rail on each card. */
const FLOW = ['DRAFT', 'COMPUTED', 'VALIDATED', 'PAID'] as const;

export default function PayrunsPage() {
  const { can } = useAuth();
  const payruns = usePayruns();

  const rows = payruns.data?.data ?? [];

  return (
    <PageShell
      wide
      eyebrow="PAYROLL CYCLE"
      title={<>Payruns</>}
      description="Draft → Computed → Validated → Paid. A paid payrun is immutable."
      actions={
        can('create', 'Payrun') ? (
          <Button asChild variant="primary">
            <Link href="/payroll/payruns/new">
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New payrun
            </Link>
          </Button>
        ) : null
      }
    >
      {payruns.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-[172px]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="py-16">
          <EmptyState
            title="No payruns yet"
            description="Create a payrun to compute payslips for a period."
            action={
              can('create', 'Payrun') ? (
                <Button asChild variant="primary">
                  <Link href="/payroll/payruns/new">Create the first payrun</Link>
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((payrun) => {
            const reachedIndex = FLOW.indexOf(payrun.status as (typeof FLOW)[number]);

            return (
              <Link
                key={payrun.id}
                href={`/payroll/payruns/${payrun.id}`}
                className="group flex flex-col rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-base)] transition-[border-color,transform] duration-150 [transition-timing-function:var(--ease-out)] hover:-translate-y-0.5 hover:border-[var(--border-strong)]"
              >
                <div className="flex items-start justify-between gap-3 p-4 pb-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
                      {payrun.name}
                    </p>
                    <p className="ledger-num mt-0.5 text-[11px] text-[var(--text-tertiary)]">
                      {formatDate(payrun.periodStart)} → {formatDate(payrun.periodEnd)}
                    </p>
                  </div>
                  <StatusChip status={payrun.status} />
                </div>

                <div className="grid grid-cols-2 gap-px border-y border-[var(--border-subtle)] bg-[var(--border-subtle)]">
                  <div className="bg-[var(--surface-base)] px-4 py-2.5">
                    <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      Employees
                    </p>
                    <p className="ledger-num text-[17px] font-semibold leading-tight">
                      {formatNumber(payrun.employeeCount ?? payrun.payslips?.length ?? 0)}
                    </p>
                  </div>
                  <div className="bg-[var(--surface-base)] px-4 py-2.5">
                    <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      Total net
                    </p>
                    <p className="ledger-num text-[17px] font-semibold leading-tight text-[var(--accent)]">
                      {formatMoney(payrun.totalNet ?? 0)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 p-4 pt-3">
                  {FLOW.map((step, index) => {
                    const reached = reachedIndex >= index && payrun.status !== 'ERROR';
                    return (
                      <div key={step} className="flex flex-1 items-center gap-1">
                        <span
                          className="h-1 flex-1 rounded-full transition-colors"
                          style={{
                            background: reached
                              ? 'var(--accent)'
                              : payrun.status === 'ERROR'
                                ? 'var(--status-danger-bg)'
                                : 'var(--border-subtle)',
                          }}
                        />
                      </div>
                    );
                  })}
                  <span className="ml-1.5 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                    {payrun.status}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
