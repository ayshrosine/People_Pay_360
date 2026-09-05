'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { PageShell, Toolbar } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, Select } from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/data-table';
import { StatusChip } from '@/components/ui/status';
import { useContracts, useEmployees } from '@/hooks/use-resources';
import { useAuth } from '@/lib/auth/auth-provider';
import { formatDate, formatMoney } from '@/lib/utils';
import type { Contract } from '@/lib/api/types';

function ContractsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = useAuth();

  // Arrived here from an Employee smart button, so open pre-filtered.
  // The URL is the source of truth for this filter, so a filtered view is
  // shareable and the browser Back button behaves as the user expects.
  const employeeId = searchParams.get('employeeId') ?? '';
  const setEmployeeId = React.useCallback(
    (value: string) => {
      router.replace(value ? `/contracts?employeeId=${value}` : '/contracts');
    },
    [router],
  );

  const employees = useEmployees({ limit: 200 });
  const contracts = useContracts({ employeeId: employeeId || undefined });

  const filteredEmployee = employees.data?.data.find((employee) => employee.id === employeeId);

  return (
    <PageShell
      wide
      title="Contracts"
      description="Payroll always uses the contract applicable to the period being run."
      actions={
        can('create', 'Contract') ? (
          <Button asChild variant="primary">
            <Link href={`/contracts/new${employeeId ? `?employeeId=${employeeId}` : ''}`}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New contract
            </Link>
          </Button>
        ) : null
      }
      toolbar={
        <Toolbar>
          <Select
            aria-label="Employee"
            className="w-64"
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

          {filteredEmployee ? (
            <button
              onClick={() => setEmployeeId('')}
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
        <DataTable<Contract>
          rows={contracts.data?.data}
          loading={contracts.isLoading}
          rowKey={(row) => row.id}
          onRowClick={(row) => router.push(`/contracts/${row.id}`)}
          // The one contract that is actually in force gets the accent stripe.
          rowAccent={(row) => row.status === 'RUNNING'}
          emptyTitle="No contracts yet"
          emptyDescription="A payslip cannot be computed for an employee without a running contract."
          columns={[
            {
              key: 'employee',
              header: 'Employee',
              cell: (row) => (
                <span className="font-medium text-[var(--text-primary)]">
                  {row.employee?.name ?? '—'}
                </span>
              ),
            },
            { key: 'position', header: 'Position', cell: (row) => row.jobPosition ?? '—' },
            { key: 'start', header: 'Start', cell: (row) => formatDate(row.startDate) },
            {
              key: 'end',
              header: 'End',
              cell: (row) =>
                row.endDate ? (
                  formatDate(row.endDate)
                ) : (
                  <span className="text-[var(--text-muted)]">Open-ended</span>
                ),
            },
            {
              key: 'wage',
              header: 'Wage',
              numeric: true,
              cell: (row) => (
                <span>
                  {formatMoney(row.wage)}
                  <span className="ml-1 text-[10px] text-[var(--text-muted)]">
                    /{row.wageType === 'Hourly' ? 'hr' : 'mo'}
                  </span>
                </span>
              ),
            },
            {
              key: 'structure',
              header: 'Salary structure',
              cell: (row) => row.salaryStructure?.name ?? '—',
            },
            { key: 'status', header: 'Status', cell: (row) => <StatusChip status={row.status} /> },
          ]}
        />
      </Card>
    </PageShell>
  );
}

export default function ContractsPage() {
  // useSearchParams needs a Suspense boundary during prerender.
  return (
    <React.Suspense fallback={null}>
      <ContractsView />
    </React.Suspense>
  );
}
