'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { PageShell, Toolbar } from '@/components/layout/page-shell';
import { Avatar, Card, Select } from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/data-table';
import { StatusChip } from '@/components/ui/status';
import { useEmployees, usePayruns, usePayslips } from '@/hooks/use-resources';
import { useAuth } from '@/lib/auth/auth-provider';
import { formatDate, formatMoney, formatNumber } from '@/lib/utils';
import type { Payslip, PayslipStatus } from '@/lib/api/types';

const STATUSES: PayslipStatus[] = ['DRAFT', 'COMPUTED', 'VALIDATED', 'PAID', 'ERROR'];

function PayslipsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selfService, can } = useAuth();
  const canReadPayruns = can('read', 'Payrun');

  const [payrunId, setPayrunId] = React.useState(searchParams.get('payrunId') ?? '');
  const [employeeId, setEmployeeId] = React.useState(searchParams.get('employeeId') ?? '');
  const [status, setStatus] = React.useState('');

  const payruns = usePayruns({}, canReadPayruns);
  const employees = useEmployees({ limit: 200 });
  const payslips = usePayslips({
    payrunId: payrunId || undefined,
    employeeId: employeeId || undefined,
    status: status || undefined,
  });

  const filteredEmployee = employees.data?.data.find((employee) => employee.id === employeeId);

  return (
    <PageShell
      wide
      eyebrow="PAYROLL OUTPUT"
      title={<>Payslips</>}
      description={
        selfService
          ? 'Your payslips across every payrun.'
          : 'Every computed payslip, across all payruns.'
      }
      toolbar={
        <Toolbar>
          {canReadPayruns ? (
            <Select
              aria-label="Payrun"
              className="w-52"
              value={payrunId}
              onChange={(event) => setPayrunId(event.target.value)}
            >
              <option value="">All payruns</option>
              {payruns.data?.data.map((payrun) => (
                <option key={payrun.id} value={payrun.id}>
                  {payrun.name}
                </option>
              ))}
            </Select>
          ) : null}

          {!selfService ? (
            <Select
              aria-label="Employee"
              className="w-52"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
            >
              <option value="">All employees</option>
              {employees.data?.data.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </Select>
          ) : null}

          <Select
            aria-label="Status"
            className="w-40"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>

          {filteredEmployee ? (
            <button
              onClick={() => {
                setEmployeeId('');
                router.replace('/payroll/payslips');
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-subtle)] px-2.5 py-1 text-[11px] text-[var(--accent)] transition-opacity hover:opacity-80"
            >
              Filtered to {filteredEmployee.name}
              <X className="h-3 w-3" aria-hidden />
            </button>
          ) : null}
        </Toolbar>
      }
    >
      <Card>
        <DataTable<Payslip>
          rows={payslips.data?.data}
          loading={payslips.isLoading}
          rowKey={(row) => row.id}
          onRowClick={(row) => router.push(`/payroll/payslips/${row.id}`)}
          emptyTitle="No payslips match these filters"
          emptyDescription="Payslips appear once a payrun has been computed."
          columns={[
            {
              key: 'employee',
              header: 'Employee',
              cell: (row) => (
                <div className="flex items-center gap-2.5">
                  <Avatar name={row.employee?.name ?? '?'} src={row.employee?.avatarUrl} size={26} />
                  <span className="font-medium text-[var(--text-primary)]">
                    {row.employee?.name ?? '—'}
                  </span>
                </div>
              ),
            },
            { key: 'payrun', header: 'Payrun', cell: (row) => row.payrun?.name ?? '—' },
            {
              key: 'period',
              header: 'Period',
              cell: (row) =>
                row.payrun
                  ? `${formatDate(row.payrun.periodStart)} → ${formatDate(row.payrun.periodEnd)}`
                  : '—',
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
            { key: 'status', header: 'Status', cell: (row) => <StatusChip status={row.status} /> },
          ]}
        />
      </Card>
    </PageShell>
  );
}

export default function PayslipsPage() {
  return (
    <React.Suspense fallback={null}>
      <PayslipsView />
    </React.Suspense>
  );
}
