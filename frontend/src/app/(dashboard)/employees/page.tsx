'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LayoutGrid, List, Plus, Search } from 'lucide-react';
import { Accent, PageShell, Toolbar } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Avatar, Card, Input, Select } from '@/components/ui/primitives';
import { DataTable, EmptyState, Skeleton } from '@/components/ui/data-table';
import { StatusChip } from '@/components/ui/status';
import { useDepartments, useEmployees } from '@/hooks/use-resources';
import { useAuth } from '@/lib/auth/auth-provider';
import { useUiStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';
import type { Employee } from '@/lib/api/types';

const STATUSES = ['ACTIVE', 'ON_LEAVE', 'INACTIVE', 'TERMINATED'];

export default function EmployeesPage() {
  const router = useRouter();
  const { can } = useAuth();
  const { employeeView, setEmployeeView } = useUiStore();

  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [departmentId, setDepartmentId] = React.useState('');
  const [status, setStatus] = React.useState('');

  // Typing should not fire a request per keystroke.
  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(search), 250);
    return () => window.clearTimeout(id);
  }, [search]);

  const departments = useDepartments();
  const employees = useEmployees({
    search: debounced || undefined,
    departmentId: departmentId || undefined,
    status: status || undefined,
    limit: 200,
  });

  // Memoised so the grouping below is not recomputed on every render just
  // because the `?? []` fallback produced a fresh array.
  const rows = React.useMemo(() => employees.data?.data ?? [], [employees.data]);

  // Kanban columns: by department normally, by status once a department is
  // already the filter - grouping by the thing you filtered on says nothing.
  const groups = React.useMemo(() => {
    const key = departmentId ? 'status' : 'department';
    const map = new Map<string, Employee[]>();

    for (const employee of rows) {
      const label =
        key === 'status' ? employee.status : (employee.department?.name ?? 'Unassigned');
      const bucket = map.get(label);
      if (bucket) bucket.push(employee);
      else map.set(label, [employee]);
    }

    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [rows, departmentId]);

  return (
    <PageShell
      wide
      eyebrow="PEOPLE DIRECTORY"
      title={<>The <Accent>team</Accent></>}
      description="The hub every other module links back to."
      actions={
        can('create', 'Employee') ? (
          <Button asChild variant="primary">
            <Link href="/employees/new">
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New employee
            </Link>
          </Button>
        ) : null
      }
      toolbar={
        <Toolbar>
          <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden
            />
            <Input
              className="pl-8"
              placeholder="Search name, email or position"
              aria-label="Search employees"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <Select
            aria-label="Department"
            className="w-44"
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
          >
            <option value="">All departments</option>
            {departments.data?.data.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Status"
            className="w-36"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value.replace('_', ' ')}
              </option>
            ))}
          </Select>

          <div
            className="ml-auto flex items-center gap-0.5 rounded-[var(--radius-ctl)] border border-[var(--border-default)] p-0.5"
            role="group"
            aria-label="View"
          >
            {(
              [
                { value: 'kanban', label: 'Kanban', icon: LayoutGrid },
                { value: 'list', label: 'List', icon: List },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                onClick={() => setEmployeeView(option.value)}
                aria-pressed={employeeView === option.value}
                title={`${option.label} view`}
                className={cn(
                  'grid h-7 w-7 place-items-center rounded-[4px] transition-colors',
                  employeeView === option.value
                    ? 'bg-[var(--surface-active)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
                )}
              >
                <option.icon className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">{option.label} view</span>
              </button>
            ))}
          </div>
        </Toolbar>
      }
    >
      {employeeView === 'list' ? (
        <Card>
          <DataTable<Employee>
            rows={rows}
            loading={employees.isLoading}
            rowKey={(row) => row.id}
            onRowClick={(row) => router.push(`/employees/${row.id}`)}
            emptyTitle="No employees match these filters"
            emptyDescription="Adjust the search or filters, or add your first employee."
            columns={[
              {
                key: 'employee',
                header: 'Employee',
                cell: (row) => (
                  <div className="flex items-center gap-2.5">
                    <Avatar name={row.name} src={row.avatarUrl} size={28} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[var(--text-primary)]">{row.name}</p>
                      <p className="truncate text-[11px] text-[var(--text-muted)]">
                        {row.jobPosition ?? 'No position set'}
                      </p>
                    </div>
                  </div>
                ),
              },
              {
                key: 'email',
                header: 'Work email',
                cell: (row) => <span className="font-mono text-[12px]">{row.workEmail}</span>,
              },
              { key: 'department', header: 'Department', cell: (row) => row.department?.name ?? '—' },
              { key: 'type', header: 'Type', cell: (row) => row.employeeType ?? '—' },
              {
                key: 'status',
                header: 'Status',
                cell: (row) => <StatusChip status={row.status} />,
              },
            ]}
          />
        </Card>
      ) : employees.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-[86px]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="py-16">
          <EmptyState
            title="No employees match these filters"
            description="Adjust the search or filters, or add your first employee."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {groups.map(([label, members]) => (
            <section key={label}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  {label.replace('_', ' ')}
                </h2>
                <span className="ledger-num rounded bg-[var(--surface-sunken)] px-1.5 text-[10px] text-[var(--text-tertiary)]">
                  {members.length}
                </span>
                <div className="rule-dashed flex-1" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {members.map((employee) => (
                  <Link
                    key={employee.id}
                    href={`/employees/${employee.id}`}
                    className="group rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3 transition-[border-color,background-color,transform,box-shadow] duration-200 [transition-timing-function:var(--ease-out)] hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:shadow-[0_10px_28px_-16px_rgba(0,0,0,0.55)]"
                  >
                    <div className="flex items-start gap-2.5">
                      <Avatar name={employee.name} src={employee.avatarUrl} size={34} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                          {employee.name}
                        </p>
                        <p className="truncate text-[11px] text-[var(--text-tertiary)]">
                          {employee.jobPosition ?? 'No position set'}
                        </p>
                      </div>
                      <StatusChip status={employee.status} />
                    </div>

                    <div className="mt-2.5 flex items-center gap-1.5 border-t border-[var(--border-subtle)] pt-2.5">
                      {employee.department ? (
                        <span className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)]">
                          {employee.department.name}
                        </span>
                      ) : null}
                      {employee.employeeType ? (
                        <span className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)]">
                          {employee.employeeType}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}
