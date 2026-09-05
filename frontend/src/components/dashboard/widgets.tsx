'use client';

import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn, formatMoney, formatNumber, humanize } from '@/lib/utils';
import { Card, CardHeader } from '@/components/ui/primitives';
import { Skeleton } from '@/components/ui/data-table';

/* ------------------------------------------------------------- the KPI rail */

/**
 * The product's signature, applied to summary figures: one ruled strip of
 * tabular-mono numerals separated by hairlines, rather than a row of identical
 * icon-left cards. The figure leads; its label is demoted to a mono micro-cap.
 */
export function KpiRail({
  items,
  loading,
}: {
  items: { label: string; value: string; sub?: string; tone?: 'default' | 'accent' }[];
  loading?: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="grid divide-y divide-[var(--border-subtle)] sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-5">
        {(loading ? Array.from({ length: 5 }) : items).map((raw, index) => {
          const item = raw as (typeof items)[number] | undefined;
          return (
            <div
              // Keyed by position: this is a fixed-order strip, and the label
              // is not unique (two departments can share a name).
              key={index}
              className={cn(
                'px-4 py-3.5',
                // Hairline column rules turn the row into a ledger, not five boxes.
                index > 0 && 'lg:border-l lg:border-[var(--border-subtle)]',
                index % 2 === 1 && 'sm:border-l sm:border-[var(--border-subtle)]',
              )}
            >
              {item?.label ? (
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  {item.label}
                </p>
              ) : (
                // A <div> placeholder cannot live inside a <p>.
                <Skeleton className="h-3 w-24" />
              )}
              {loading ? (
                <Skeleton className="mt-2 h-7 w-28" />
              ) : (
                <p
                  className={cn(
                    'ledger-num mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.03em]',
                    item?.tone === 'accent'
                      ? 'text-[var(--accent)]'
                      : 'text-[var(--text-primary)]',
                  )}
                >
                  {item?.value}
                </p>
              )}
              {!loading && item?.sub ? (
                <p className="mt-1.5 text-[11px] text-[var(--text-tertiary)]">{item.sub}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------- chart shell */

const AXIS_STYLE = {
  fontSize: 10,
  fontFamily: 'var(--font-mono-jb), monospace',
  fill: 'var(--text-muted)',
};

function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; payload?: Record<string, unknown> }[];
  label?: string;
  formatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-raised)] px-2.5 py-1.5 shadow-[var(--shadow-overlay)]">
      <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
        {label}
      </p>
      {payload.map((entry, index) => (
        <p key={index} className="ledger-num text-[12px] font-medium text-[var(--text-primary)]">
          {formatter ? formatter(Number(entry.value ?? 0)) : formatNumber(entry.value)}
        </p>
      ))}
    </div>
  );
}

export function ChartCard({
  title,
  description,
  action,
  loading,
  empty,
  emptyLabel = 'No data for this period yet.',
  height = 220,
  children,
  footer,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyLabel?: string;
  height?: number;
  children: React.ReactElement;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader title={title} description={description} action={action} />
      {/* The chart grows into whatever height the grid row gives the card, so
          a tall neighbour does not leave a band of dead space under the plot. */}
      <div className="flex-1 p-3" style={{ minHeight: height }}>
        {loading ? (
          <Skeleton className="h-full w-full" />
        ) : empty ? (
          <div className="grid h-full place-items-center text-[12px] text-[var(--text-muted)]">
            {emptyLabel}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={height}>
            {children}
          </ResponsiveContainer>
        )}
      </div>
      {footer ? <div className="border-t border-[var(--border-subtle)]">{footer}</div> : null}
    </Card>
  );
}

/* -------------------------------------------------------------- the charts */

export function SalaryCostChart({
  data,
  loading,
  className,
}: {
  data?: { department: string; totalCost: number }[];
  loading?: boolean;
  className?: string;
}) {
  return (
    <ChartCard
      title="Salary cost by department"
      description="Net salary paid, this period"
      loading={loading}
      empty={!data?.length}
      className={className}
    >
      <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
        <XAxis dataKey="department" tickLine={false} axisLine={false} tick={AXIS_STYLE} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={AXIS_STYLE}
          tickFormatter={(value: number) => `${Math.round(value / 1000)}k`}
        />
        <RechartsTooltip
          cursor={{ fill: 'var(--surface-hover)' }}
          content={<ChartTooltip formatter={formatMoney} />}
        />
        <Bar dataKey="totalCost" fill="var(--accent)" radius={[3, 3, 0, 0]} maxBarSize={38} />
      </BarChart>
    </ChartCard>
  );
}

export function NetSalaryTrendChart({
  data,
  loading,
  className,
}: {
  data?: { month: string; netTotal: number }[];
  loading?: boolean;
  className?: string;
}) {
  return (
    <ChartCard
      title="Monthly net salary trend"
      description="Total net paid per payrun period"
      loading={loading}
      empty={!data?.length}
      className={className}
    >
      <LineChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tick={AXIS_STYLE} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={AXIS_STYLE}
          tickFormatter={(value: number) => `${Math.round(value / 1000)}k`}
        />
        <RechartsTooltip content={<ChartTooltip formatter={formatMoney} />} />
        <Line
          type="monotone"
          dataKey="netTotal"
          stroke="var(--accent)"
          strokeWidth={2}
          dot={{ r: 2.5, fill: 'var(--accent)', strokeWidth: 0 }}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ChartCard>
  );
}

const STATUS_FILL: Record<string, string> = {
  DRAFT: 'var(--status-neutral)',
  COMPUTED: 'var(--status-info)',
  WAITING: 'var(--status-warning)',
  VALIDATED: 'var(--accent)',
  PAID: 'var(--status-success)',
  ERROR: 'var(--status-danger)',
};

export function PayslipStatusChart({
  data,
  loading,
  className,
}: {
  data?: { status: string; count: number }[];
  loading?: boolean;
  className?: string;
}) {
  const total = data?.reduce((sum, entry) => sum + entry.count, 0) ?? 0;

  return (
    <ChartCard
      title="Payslip status"
      description={total ? `${total} payslip(s) in scope` : undefined}
      loading={loading}
      empty={!data?.length}
      height={180}
      className={className}
      footer={<StatusLegend data={data} />}
    >
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="status"
          innerRadius={52}
          outerRadius={76}
          paddingAngle={2}
          stroke="none"
        >
          {data?.map((entry) => (
            <Cell key={entry.status} fill={STATUS_FILL[entry.status] ?? 'var(--status-neutral)'} />
          ))}
        </Pie>
        <RechartsTooltip content={<ChartTooltip formatter={(value) => `${value} payslips`} />} />
      </PieChart>
    </ChartCard>
  );
}

export function StatusLegend({ data }: { data?: { status: string; count: number }[] }) {
  if (!data?.length) return null;

  return (
    <ul className="space-y-1.5 px-4 pb-3">
      {data.map((entry) => (
        <li key={entry.status} className="flex items-center gap-2 text-[12px]">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: STATUS_FILL[entry.status] ?? 'var(--status-neutral)' }}
            aria-hidden
          />
          <span className="flex-1 text-[var(--text-secondary)]">{humanize(entry.status)}</span>
          <span className="ledger-num font-medium text-[var(--text-primary)]">{entry.count}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------- payroll health gauge */

/**
 * One number that says whether payroll is in good shape, combining attendance
 * coverage, the time-off backlog and unresolved payslip warnings.
 */
export function HealthGauge({
  score,
  loading,
  breakdown,
}: {
  score: number;
  loading?: boolean;
  breakdown: { label: string; value: string }[];
}) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const offset = circumference * (1 - clamped / 100);

  const tone =
    clamped >= 80
      ? 'var(--status-success)'
      : clamped >= 55
        ? 'var(--status-warning)'
        : 'var(--status-danger)';

  return (
    <Card className="flex flex-col">
      <CardHeader title="Payroll health" description="Attendance, backlog and warnings combined" />
      <div className="flex flex-1 items-center gap-5 p-4">
        <div className="relative shrink-0">
          {loading ? (
            <Skeleton className="h-[124px] w-[124px] rounded-full" />
          ) : (
            <>
              <svg width={124} height={124} viewBox="0 0 124 124" role="img" aria-label={`Payroll health ${clamped} out of 100`}>
                <circle
                  cx={62}
                  cy={62}
                  r={radius}
                  fill="none"
                  stroke="var(--border-subtle)"
                  strokeWidth={8}
                />
                <circle
                  cx={62}
                  cy={62}
                  r={radius}
                  fill="none"
                  stroke={tone}
                  strokeWidth={8}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  transform="rotate(-90 62 62)"
                  style={{ transition: 'stroke-dashoffset 600ms var(--ease-out)' }}
                />
              </svg>
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <p
                    className="ledger-num text-[30px] font-semibold leading-none tracking-[-0.03em]"
                    style={{ color: tone }}
                  >
                    {clamped}
                  </p>
                  <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                    / 100
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <dl className="min-w-0 flex-1 space-y-2">
          {breakdown.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3">
              <dt className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                {row.label}
              </dt>
              <dd className="ledger-num shrink-0 text-[13px] font-medium text-[var(--text-primary)]">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
}

/** A compact stat grid used by the attendance and time-off overview panels. */
export function StatGrid({
  items,
  loading,
  columns = 3,
}: {
  items: { label: string; value: React.ReactNode; tone?: string }[];
  loading?: boolean;
  columns?: number;
}) {
  return (
    <div
      className="grid gap-px bg-[var(--border-subtle)]"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {(loading ? Array.from({ length: columns * 2 }) : items).map((raw, index) => {
        const item = raw as (typeof items)[number] | undefined;
        return (
          // Positional key: labels are data-derived and not guaranteed unique.
          <div key={index} className="bg-[var(--surface-base)] px-3 py-2.5">
            {item?.label ? (
              <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                {item.label}
              </p>
            ) : (
              // The placeholder is a <div>, which is invalid inside a <p> and
              // triggered a hydration mismatch when it sat in the label slot.
              <Skeleton className="h-2.5 w-14" />
            )}
            {loading ? (
              <Skeleton className="mt-1.5 h-5 w-10" />
            ) : (
              <p
                className="ledger-num mt-0.5 text-[18px] font-semibold leading-tight tracking-[-0.02em]"
                style={{ color: item?.tone ?? 'var(--text-primary)' }}
              >
                {item?.value}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
