'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, Info, RotateCcw } from 'lucide-react';
import { Accent, PageShell, Toolbar } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Select } from '@/components/ui/primitives';
import { DataTable, EmptyState, Skeleton } from '@/components/ui/data-table';
import {
  HealthGauge,
  KpiRail,
  NetSalaryTrendChart,
  PayslipStatusChart,
  SalaryCostChart,
  StatGrid,
} from '@/components/dashboard/widgets';
import {
  useAttendanceOverview,
  useDashboardAlerts,
  useDashboardKpis,
  useDepartmentOverview,
  useDepartments,
  useMonthlyNetSalaryTrend,
  usePayslipStatusBreakdown,
  useSalaryCostByDepartment,
  useTimeOffOverview,
} from '@/hooks/use-resources';
import { useFiltersStore } from '@/stores/filters-store';
import { useAuth } from '@/lib/auth/auth-provider';
import { formatMoney, formatNumber } from '@/lib/utils';
import type { DepartmentOverviewRow } from '@/lib/api/types';

const PERIODS = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'last_90_days', label: 'Last 90 days' },
  { value: 'this_year', label: 'This year' },
];

const EMPLOYEE_TYPES = ['Full-time', 'Part-time', 'Contract', 'Intern'];

export default function DashboardPage() {
  const { period, departmentId, employeeType, setFilter, reset } = useFiltersStore();

  // One filter object shared by every widget, so the bar drives all of them.
  const filters = React.useMemo(
    () => ({
      period,
      ...(departmentId ? { departmentId } : {}),
      ...(employeeType ? { employeeType } : {}),
    }),
    [period, departmentId, employeeType],
  );

  const departments = useDepartments();
  const kpis = useDashboardKpis(filters);
  const salaryCost = useSalaryCostByDepartment(filters);
  const trend = useMonthlyNetSalaryTrend(filters);
  const statusBreakdown = usePayslipStatusBreakdown(filters);
  const alerts = useDashboardAlerts();
  const attendance = useAttendanceOverview(filters);
  const timeOff = useTimeOffOverview(filters);
  const departmentOverview = useDepartmentOverview();

  const alertItems = React.useMemo(() => {
    const data = alerts.data;
    if (!data) return [];
    return [
      ...(data.errorPayslips ?? []).map((entry) => ({ ...entry, severity: 'blocking' as const })),
      ...(data.employeesWithoutBank ?? []).map((entry) => ({
        ...entry,
        severity: 'blocking' as const,
      })),
      ...(data.contractsEndingSoon ?? []).map((entry) => ({ ...entry, severity: 'info' as const })),
    ];
  }, [alerts.data]);

  const blockingCount = alertItems.filter((entry) => entry.severity === 'blocking').length;

  /**
   * Health score: attendance coverage carries the most weight, then the
   * unresolved-warning load, then the approval backlog. Deliberately simple
   * and readable - an opaque score nobody can explain is worse than none.
   */
  const health = React.useMemo(() => {
    const coverage = attendance.data?.coveragePct ?? 0;
    const pending = timeOff.data?.pendingRequests ?? 0;
    const warningPenalty = Math.min(30, blockingCount * 6);
    const backlogPenalty = Math.min(20, pending * 4);
    return Math.max(0, Math.min(100, coverage * 0.7 + 30 - warningPenalty * 0.5 - backlogPenalty * 0.4));
  }, [attendance.data, timeOff.data, blockingCount]);

  const { user } = useAuth();
  const firstName = (user?.employee?.name ?? user?.email ?? 'there').split(/[\s@.]/)[0];

  // Rendered on the client only (the shell is a client component), so the
  // viewer's own locale and timezone decide what "today" reads as.
  const today = React.useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    [],
  );

  const filtersDirty = period !== 'this_year' || departmentId !== null || employeeType !== null;

  return (
    <PageShell
      wide
      eyebrow={today}
      title={
        <>
          Welcome back, <Accent>{firstName}.</Accent>
        </>
      }
      description="Live figures from the HR and payroll flows — no placeholder data."
      toolbar={
        <Toolbar>
          <Select
            aria-label="Period"
            className="w-40"
            value={period}
            onChange={(event) => setFilter('period', event.target.value)}
          >
            {PERIODS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Department"
            className="w-44"
            value={departmentId ?? ''}
            onChange={(event) => setFilter('departmentId', event.target.value || null)}
          >
            <option value="">All departments</option>
            {departments.data?.data.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Employee type"
            className="w-40"
            value={employeeType ?? ''}
            onChange={(event) => setFilter('employeeType', event.target.value || null)}
          >
            <option value="">All types</option>
            {EMPLOYEE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>

          {filtersDirty ? (
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Reset
            </Button>
          ) : null}
        </Toolbar>
      }
    >
      <div className="space-y-4">
        <KpiRail
          loading={kpis.isLoading}
          items={[
            {
              label: 'Total net salary paid',
              value: formatMoney(kpis.data?.totalNetSalaryPaid),
              tone: 'accent',
              sub: 'Paid payslips in period',
            },
            {
              label: 'Payslips generated',
              value: formatNumber(kpis.data?.payslipsGenerated),
              sub: `${blockingCount} need attention`,
            },
            {
              label: 'Avg salary / employee',
              value: formatMoney(kpis.data?.avgSalary),
            },
            {
              label: 'Approved time off',
              value: `${formatNumber(kpis.data?.approvedTimeOffDays, 1)} d`,
            },
            {
              label: 'Attendance health',
              value: `${formatNumber(kpis.data?.attendanceHealthPct, 1)}%`,
            },
          ]}
        />

        <div className="grid gap-4 lg:grid-cols-3">
          <SalaryCostChart
            className="lg:col-span-2"
            data={salaryCost.data}
            loading={salaryCost.isLoading}
          />
          <HealthGauge
            score={health}
            loading={attendance.isLoading || timeOff.isLoading}
            breakdown={[
              {
                label: 'Attendance coverage',
                value: `${formatNumber(attendance.data?.coveragePct, 1)}%`,
              },
              { label: 'Blocking warnings', value: formatNumber(blockingCount) },
              {
                label: 'Pending approvals',
                value: formatNumber(timeOff.data?.pendingRequests),
              },
            ]}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <NetSalaryTrendChart
            className="lg:col-span-2"
            data={trend.data}
            loading={trend.isLoading}
          />

          <PayslipStatusChart data={statusBreakdown.data} loading={statusBreakdown.isLoading} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader
              title="Payroll alerts"
              description={blockingCount ? `${blockingCount} blocking` : 'All clear'}
            />
            <div className="max-h-64 overflow-y-auto">
              {alerts.isLoading ? (
                <div className="space-y-2 p-4">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-4 w-3/5" />
                </div>
              ) : alertItems.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="Nothing needs attention"
                    description="No payslip errors, missing bank details or expiring contracts."
                  />
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border-subtle)]">
                  {alertItems.map((alert, index) => (
                    <li key={`${alert.code}-${index}`} className="flex gap-2.5 px-4 py-2.5">
                      {alert.severity === 'blocking' ? (
                        <AlertTriangle
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--status-warning)]"
                          aria-hidden
                        />
                      ) : (
                        <Info
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--status-info)]"
                          aria-hidden
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-[12px] leading-snug text-[var(--text-secondary)]">
                          {alert.message}
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                          {alert.code}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Attendance overview" description="Records in the selected period" />
            <StatGrid
              loading={attendance.isLoading}
              items={[
                { label: 'Present', value: formatNumber(attendance.data?.present), tone: 'var(--status-success)' },
                { label: 'Late', value: formatNumber(attendance.data?.late), tone: 'var(--status-warning)' },
                { label: 'Absent', value: formatNumber(attendance.data?.absent), tone: 'var(--status-danger)' },
                { label: 'Overtime', value: formatNumber(attendance.data?.overtime), tone: 'var(--status-info)' },
                { label: 'No checkout', value: formatNumber(attendance.data?.missingCheckouts) },
                { label: 'Manual edits', value: formatNumber(attendance.data?.manualEdits) },
              ]}
            />
            <div className="border-t border-[var(--border-subtle)] px-4 py-2.5">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Coverage
                </span>
                <span className="ledger-num text-[13px] font-semibold">
                  {formatNumber(attendance.data?.coveragePct, 1)}%
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500 [transition-timing-function:var(--ease-out)]"
                  style={{ width: `${Math.min(100, attendance.data?.coveragePct ?? 0)}%` }}
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Time off overview"
              description="Approved days and pending approvals"
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/time-off/requests">Open</Link>
                </Button>
              }
            />
            <StatGrid
              columns={2}
              loading={timeOff.isLoading}
              items={[
                {
                  label: 'Approved days',
                  value: formatNumber(timeOff.data?.approvedDays, 1),
                  tone: 'var(--status-success)',
                },
                {
                  label: 'Pending requests',
                  value: formatNumber(timeOff.data?.pendingRequests),
                  tone: 'var(--status-warning)',
                },
              ]}
            />
            <ul className="divide-y divide-[var(--border-subtle)]">
              {timeOff.data?.byType?.length ? (
                timeOff.data.byType.map((entry) => (
                  <li key={entry.type} className="flex items-center justify-between px-4 py-2">
                    <span className="truncate text-[12px] text-[var(--text-secondary)]">
                      {entry.type}
                    </span>
                    <span className="ledger-num text-[12px] font-medium">
                      {formatNumber(entry.days, 1)} d
                    </span>
                  </li>
                ))
              ) : (
                <li className="px-4 py-3 text-[12px] text-[var(--text-muted)]">
                  No leave recorded in this period.
                </li>
              )}
            </ul>
          </Card>
        </div>

        <Card>
          <CardHeader title="Department overview" description="Headcount and committed salary" />
          <DataTable<DepartmentOverviewRow>
            rows={departmentOverview.data}
            loading={departmentOverview.isLoading}
            rowKey={(row) => row.department}
            emptyTitle="No departments yet"
            emptyDescription="Create a department from the Employees module to see it here."
            columns={[
              { key: 'department', header: 'Department', cell: (row) => (
                <span className="font-medium text-[var(--text-primary)]">{row.department}</span>
              ) },
              { key: 'headcount', header: 'Headcount', numeric: true, cell: (row) => formatNumber(row.headcount) },
              {
                key: 'salary',
                header: 'Committed salary',
                numeric: true,
                cell: (row) => formatMoney(row.totalSalary),
              },
            ]}
          />
        </Card>
      </div>
    </PageShell>
  );
}
