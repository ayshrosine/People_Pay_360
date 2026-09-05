'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Plus, X } from 'lucide-react';
import { Accent, PageShell, Toolbar } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Avatar, Card, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/data-table';
import { Dialog, DialogContent, Tooltip } from '@/components/ui/overlay';
import { StatusChip } from '@/components/ui/status';
import {
  useAllocations,
  useCreateTimeOffRequest,
  useDecideTimeOffRequest,
  useEmployees,
  useTimeOffRequests,
  useTimeOffTypes,
} from '@/hooks/use-resources';
import { useAuth } from '@/lib/auth/auth-provider';
import { normaliseError } from '@/lib/api/client';
import { formatDate, formatNumber, toISODate } from '@/lib/utils';
import type { TimeOffRequest } from '@/lib/api/types';

function RequestsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can, selfService, user, canDecideLeaveFor } = useAuth();

  // The URL is the source of truth for this filter, so a filtered view is
  // shareable and the browser Back button behaves as the user expects.
  const employeeId = searchParams.get('employeeId') ?? '';
  const setEmployeeId = React.useCallback(
    (value: string) => {
      router.replace(value ? `/time-off/requests?employeeId=${value}` : '/time-off/requests');
    },
    [router],
  );

  const [status, setStatus] = React.useState('');
  const [creating, setCreating] = React.useState(false);

  const employees = useEmployees({ limit: 200 });
  const requests = useTimeOffRequests({
    employeeId: employeeId || undefined,
    status: status || undefined,
  });
  const decide = useDecideTimeOffRequest();

  // A department head is an ordinary EMPLOYEE whose authority comes from
  // leading a department, so this is decided per row rather than per role.
  const canDecide = (row: { employeeId: string; employee?: { departmentId?: string | null } | null }) =>
    canDecideLeaveFor(row.employeeId, row.employee?.departmentId);
  const filteredEmployee = employees.data?.data.find((employee) => employee.id === employeeId);

  return (
    <PageShell
      wide
      eyebrow="TIME & ATTENDANCE"
      title={<>Leave <Accent>requests</Accent></>}
      description="Approving a request debits the employee's allocation in the same transaction."
      actions={
        can('create', 'TimeOffRequest') ? (
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New request
          </Button>
        ) : null
      }
      toolbar={
        <Toolbar>
          {!selfService ? (
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
          ) : null}

          <Select
            aria-label="Status"
            className="w-44"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="TO_APPROVE">To approve</option>
            <option value="APPROVED">Approved</option>
            <option value="REFUSED">Refused</option>
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
        <DataTable<TimeOffRequest>
          rows={requests.data?.data}
          loading={requests.isLoading}
          rowKey={(row) => row.id}
          emptyTitle="No time off requests"
          emptyDescription="Requests submitted by employees appear here for approval."
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
              key: 'dates',
              header: 'Dates',
              cell: (row) => `${formatDate(row.startDate)} → ${formatDate(row.endDate)}`,
            },
            {
              key: 'duration',
              header: 'Duration',
              numeric: true,
              cell: (row) =>
                `${formatNumber(row.duration, 1)} ${row.timeOffType?.unit === 'HOURS' ? 'h' : 'd'}`,
            },
            {
              key: 'reason',
              header: 'Reason',
              cell: (row) => (
                <span className="line-clamp-1 text-[var(--text-tertiary)]">{row.reason ?? '—'}</span>
              ),
            },
            { key: 'status', header: 'Status', cell: (row) => <StatusChip status={row.status} /> },
            {
              key: 'actions',
              header: '',
              width: '86px',
              cell: (row) =>
                canDecide(row) && row.status === 'TO_APPROVE' ? (
                  <div className="flex justify-end gap-1">
                    <Tooltip content="Approve">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Approve request for ${row.employee?.name}`}
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ id: row.id, decision: 'approve' })}
                        className="text-[var(--status-success)] hover:bg-[var(--status-success-bg)]"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </Tooltip>
                    <Tooltip content="Refuse">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Refuse request for ${row.employee?.name}`}
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ id: row.id, decision: 'refuse' })}
                        className="text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </Tooltip>
                  </div>
                ) : null,
            },
          ]}
        />
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        {creating ? (
          <RequestDialog
            defaultEmployeeId={selfService ? (user?.employeeId ?? '') : employeeId}
            lockEmployee={selfService}
            onDone={() => setCreating(false)}
          />
        ) : null}
      </Dialog>
    </PageShell>
  );
}

function RequestDialog({
  defaultEmployeeId,
  lockEmployee,
  onDone,
}: {
  defaultEmployeeId: string;
  lockEmployee: boolean;
  onDone: () => void;
}) {
  const employees = useEmployees({ limit: 200 });
  const types = useTimeOffTypes();
  const create = useCreateTimeOffRequest();

  const [employeeId, setEmployeeId] = React.useState(defaultEmployeeId);
  const [timeOffTypeId, setTimeOffTypeId] = React.useState('');
  const [startDate, setStartDate] = React.useState(toISODate(new Date()));
  const [endDate, setEndDate] = React.useState(toISODate(new Date()));
  const [reason, setReason] = React.useState('');
  const [banner, setBanner] = React.useState<string | null>(null);

  const allocations = useAllocations({ employeeId: employeeId || undefined });

  const selectedType = types.data?.data.find((type) => type.id === timeOffTypeId);

  // Inclusive day count, so a single-day request is 1 rather than 0.
  const duration = React.useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
    return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  }, [startDate, endDate]);

  const balance = allocations.data?.data.find(
    (allocation) => allocation.timeOffTypeId === timeOffTypeId && allocation.status === 'Approved',
  );

  const overBalance =
    Boolean(selectedType?.requiresAllocation) &&
    balance !== undefined &&
    duration > Number(balance.remaining);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBanner(null);

    try {
      await create.mutateAsync({
        employeeId: employeeId || undefined,
        timeOffTypeId,
        startDate,
        endDate,
        duration,
        reason: reason.trim() || undefined,
      });
      onDone();
    } catch (error) {
      const normalised = normaliseError(error);
      setBanner(
        normalised.code === 'INSUFFICIENT_BALANCE' || normalised.code === 'NO_ALLOCATION'
          ? normalised.message
          : normalised.message,
      );
    }
  }

  return (
    <DialogContent
      title="New time off request"
      description="The balance is checked when you submit and again at approval."
    >
      <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto p-5">
        {!lockEmployee ? (
          <Field label="Employee" htmlFor="requestEmployee">
            <Select
              id="requestEmployee"
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
        ) : null}

        <Field label="Time off type" htmlFor="requestType">
          <Select
            id="requestType"
            required
            value={timeOffTypeId}
            onChange={(event) => setTimeOffTypeId(event.target.value)}
          >
            <option value="">Select a type</option>
            {types.data?.data.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From" htmlFor="requestStart">
            <Input
              id="requestStart"
              type="date"
              required
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                if (endDate < event.target.value) setEndDate(event.target.value);
              }}
            />
          </Field>

          <Field label="To" htmlFor="requestEnd">
            <Input
              id="requestEnd"
              type="date"
              required
              min={startDate}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-2.5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Duration
            </p>
            <p className="ledger-num text-[17px] font-semibold text-[var(--text-primary)]">
              {duration} {selectedType?.unit === 'HOURS' ? 'hours' : 'day(s)'}
            </p>
          </div>

          {selectedType?.requiresAllocation ? (
            <div className="text-right">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Remaining balance
              </p>
              <p
                className="ledger-num text-[17px] font-semibold"
                style={{
                  color: overBalance ? 'var(--status-danger)' : 'var(--text-primary)',
                }}
              >
                {balance ? formatNumber(balance.remaining, 1) : '—'}
              </p>
            </div>
          ) : null}
        </div>

        {overBalance ? (
          <p role="alert" className="text-[12px] text-[var(--status-danger)]">
            This request exceeds the remaining balance and will be rejected.
          </p>
        ) : null}

        <Field label="Reason" htmlFor="requestReason">
          <Textarea
            id="requestReason"
            placeholder="Optional context for the approver"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>

        {banner ? (
          <div
            role="alert"
            className="rounded-[var(--radius-ctl)] border border-[var(--status-danger)] bg-[var(--status-danger-bg)] px-3 py-2 text-[12px] text-[var(--status-danger)]"
          >
            {banner}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={create.isPending}
            disabled={duration < 1 || !timeOffTypeId}
          >
            Submit request
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

export default function TimeOffRequestsPage() {
  return (
    <React.Suspense fallback={null}>
      <RequestsView />
    </React.Suspense>
  );
}
