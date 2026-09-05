'use client';

import * as React from 'react';
import { Check, Plus } from 'lucide-react';
import { PageShell, Toolbar } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Avatar, Card, Field, Input, Select } from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/data-table';
import { Dialog, DialogContent } from '@/components/ui/overlay';
import { StatusChip } from '@/components/ui/status';
import {
  useAllocations,
  useApproveAllocation,
  useCreateAllocation,
  useEmployees,
  useTimeOffTypes,
} from '@/hooks/use-resources';
import { useAuth } from '@/lib/auth/auth-provider';
import { formatDate, formatNumber, toISODate } from '@/lib/utils';
import type { TimeOffAllocation } from '@/lib/api/types';

export default function AllocationsPage() {
  const { can, selfService } = useAuth();
  const [employeeId, setEmployeeId] = React.useState('');
  const [creating, setCreating] = React.useState(false);

  const employees = useEmployees({ limit: 200 });
  const allocations = useAllocations({ employeeId: employeeId || undefined });
  const approve = useApproveAllocation();

  const canManage = can('update', 'TimeOffAllocation') && !selfService;

  return (
    <PageShell
      wide
      title="Allocations"
      description="Approved leave draws down from these balances; remaining is never client-supplied."
      actions={
        can('create', 'TimeOffAllocation') && !selfService ? (
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New allocation
          </Button>
        ) : null
      }
      toolbar={
        !selfService ? (
          <Toolbar>
            <Select
              aria-label="Employee"
              className="w-56"
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
          </Toolbar>
        ) : undefined
      }
    >
      <Card>
        <DataTable<TimeOffAllocation>
          rows={allocations.data?.data}
          loading={allocations.isLoading}
          rowKey={(row) => row.id}
          emptyTitle="No allocations yet"
          emptyDescription="Without an allocation, leave types that require one cannot be requested."
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
            {
              key: 'type',
              header: 'Type',
              cell: (row) => (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: row.timeOffType?.colorHex ?? 'var(--status-neutral)' }}
                    aria-hidden
                  />
                  {row.timeOffType?.name ?? '—'}
                </span>
              ),
            },
            {
              key: 'allocated',
              header: 'Allocated',
              numeric: true,
              cell: (row) => formatNumber(row.allocated, 1),
            },
            {
              key: 'taken',
              header: 'Taken',
              numeric: true,
              cell: (row) => formatNumber(row.taken, 1),
            },
            {
              key: 'remaining',
              header: 'Remaining',
              numeric: true,
              cell: (row) => (
                <span
                  className="font-semibold"
                  style={{
                    color:
                      Number(row.remaining) <= 0
                        ? 'var(--status-danger)'
                        : 'var(--text-primary)',
                  }}
                >
                  {formatNumber(row.remaining, 1)}
                </span>
              ),
            },
            {
              key: 'validity',
              header: 'Validity',
              cell: (row) =>
                `${formatDate(row.validFrom)} → ${row.validTo ? formatDate(row.validTo) : 'open'}`,
            },
            { key: 'status', header: 'Status', cell: (row) => <StatusChip status={row.status} /> },
            {
              key: 'actions',
              header: '',
              width: '110px',
              cell: (row) =>
                canManage && row.status !== 'Approved' ? (
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={approve.isPending}
                      onClick={() => approve.mutate(row.id)}
                    >
                      <Check className="h-3 w-3" aria-hidden />
                      Approve
                    </Button>
                  </div>
                ) : null,
            },
          ]}
        />
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        {creating ? <AllocationDialog onDone={() => setCreating(false)} /> : null}
      </Dialog>
    </PageShell>
  );
}

function AllocationDialog({ onDone }: { onDone: () => void }) {
  const employees = useEmployees({ limit: 200 });
  const types = useTimeOffTypes();
  const create = useCreateAllocation();

  const [employeeId, setEmployeeId] = React.useState('');
  const [timeOffTypeId, setTimeOffTypeId] = React.useState('');
  const [allocated, setAllocated] = React.useState('12');
  const [validFrom, setValidFrom] = React.useState(toISODate(new Date()));
  const [validTo, setValidTo] = React.useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await create.mutateAsync({
      employeeId,
      timeOffTypeId,
      allocated: Number(allocated),
      validFrom,
      validTo: validTo || undefined,
    });
    onDone();
  }

  return (
    <DialogContent
      title="New allocation"
      description="Created as To Approve; the balance only becomes usable once approved."
    >
      <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto p-5">
        <Field label="Employee" htmlFor="allocEmployee">
          <Select
            id="allocEmployee"
            required
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
          >
            <option value="">Select an employee</option>
            {employees.data?.data.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Time off type" htmlFor="allocType">
          <Select
            id="allocType"
            required
            value={timeOffTypeId}
            onChange={(event) => setTimeOffTypeId(event.target.value)}
          >
            <option value="">Select a type</option>
            {types.data?.data.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name} ({type.unit === 'HOURS' ? 'hours' : 'days'})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Allocated" htmlFor="allocAmount">
          <Input
            id="allocAmount"
            type="number"
            min="0"
            step="0.5"
            required
            className="ledger-num"
            value={allocated}
            onChange={(event) => setAllocated(event.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valid from" htmlFor="allocFrom">
            <Input
              id="allocFrom"
              type="date"
              required
              value={validFrom}
              onChange={(event) => setValidFrom(event.target.value)}
            />
          </Field>

          <Field label="Valid to" htmlFor="allocTo" hint="Leave empty for no expiry">
            <Input
              id="allocTo"
              type="date"
              value={validTo}
              onChange={(event) => setValidTo(event.target.value)}
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={create.isPending}>
            Create allocation
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
