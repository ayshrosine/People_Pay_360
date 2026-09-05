'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarRange, PencilLine, X } from 'lucide-react';
import { PageShell, Toolbar } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Avatar, Card, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/data-table';
import { Dialog, SheetContent } from '@/components/ui/overlay';
import { StatusChip } from '@/components/ui/status';
import { useAttendance, useEmployees, useUpdateAttendance } from '@/hooks/use-resources';
import { useAuth } from '@/lib/auth/auth-provider';
import { formatDate, formatDuration, formatTime, monthBounds } from '@/lib/utils';
import type { Attendance, AttendanceStatus } from '@/lib/api/types';

const STATUSES: AttendanceStatus[] = [
  'PRESENT',
  'LATE',
  'ABSENT',
  'OVERTIME',
  'MISSING_CHECKOUT',
  'MANUALLY_EDITED',
];

function AttendanceView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can, selfService } = useAuth();

  const bounds = React.useMemo(() => monthBounds(), []);

  // The URL is the source of truth for this filter, so a filtered view is
  // shareable and the browser Back button behaves as the user expects.
  const employeeId = searchParams.get('employeeId') ?? '';
  const setEmployeeId = React.useCallback(
    (value: string) => {
      router.replace(value ? `/attendance?employeeId=${value}` : '/attendance');
    },
    [router],
  );

  const [dateFrom, setDateFrom] = React.useState(bounds.start);
  const [dateTo, setDateTo] = React.useState(bounds.end);
  const [status, setStatus] = React.useState('');
  const [selected, setSelected] = React.useState<Attendance | null>(null);

  const employees = useEmployees({ limit: 200 });
  const attendance = useAttendance({
    employeeId: employeeId || undefined,
    dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
    // Include the whole final day, not just its first instant.
    dateTo: dateTo ? new Date(`${dateTo}T23:59:59`).toISOString() : undefined,
    status: status || undefined,
  });

  const canCorrect = can('update', 'Attendance') && !selfService;
  const filteredEmployee = employees.data?.data.find((employee) => employee.id === employeeId);

  return (
    <PageShell
      wide
      title="Attendance"
      description="Worked hours here feed the payslip computation directly."
      actions={
        can('read', 'WorkingSchedule') ? (
          <Button asChild variant="secondary">
            <Link href="/working-schedules">
              <CalendarRange className="h-3.5 w-3.5" aria-hidden />
              Working schedules
            </Link>
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

          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              aria-label="From date"
              className="w-36"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
            <span className="text-[var(--text-muted)]">→</span>
            <Input
              type="date"
              aria-label="To date"
              className="w-36"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>

          <Select
            aria-label="Status"
            className="w-44"
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
        <DataTable<Attendance>
          rows={attendance.data?.data}
          loading={attendance.isLoading}
          rowKey={(row) => row.id}
          onRowClick={canCorrect ? (row) => setSelected(row) : undefined}
          emptyTitle="No attendance in this range"
          emptyDescription="Change the date range, or check in from the widget in the corner."
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
            { key: 'date', header: 'Date', cell: (row) => formatDate(row.checkIn) },
            {
              key: 'in',
              header: 'Check in',
              numeric: true,
              cell: (row) => formatTime(row.checkIn),
            },
            {
              key: 'out',
              header: 'Check out',
              numeric: true,
              cell: (row) =>
                row.checkOut ? (
                  formatTime(row.checkOut)
                ) : (
                  <span className="text-[var(--text-muted)]">—</span>
                ),
            },
            {
              key: 'worked',
              header: 'Worked',
              numeric: true,
              cell: (row) => formatDuration(row.workedHours),
            },
            {
              key: 'status',
              header: 'Status',
              cell: (row) => (
                <span className="flex items-center gap-1.5">
                  <StatusChip status={row.status} />
                  {row.isManualEdit ? (
                    <PencilLine
                      className="h-3 w-3 text-[var(--text-muted)]"
                      aria-label="Manually corrected"
                    />
                  ) : null}
                </span>
              ),
            },
          ]}
        />
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        {selected ? (
          <CorrectionSheet record={selected} onDone={() => setSelected(null)} />
        ) : null}
      </Dialog>
    </PageShell>
  );
}

/** HR-only manual correction. Every save is flagged as a manual edit. */
function CorrectionSheet({ record, onDone }: { record: Attendance; onDone: () => void }) {
  const update = useUpdateAttendance();

  const toLocalInput = (value: string | null) =>
    value ? new Date(new Date(value).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';

  const [checkOut, setCheckOut] = React.useState(toLocalInput(record.checkOut));
  const [status, setStatus] = React.useState<AttendanceStatus>(record.status);
  const [notes, setNotes] = React.useState(record.notes ?? '');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await update.mutateAsync({
      id: record.id,
      checkOut: checkOut ? new Date(checkOut).toISOString() : undefined,
      status,
      notes: notes.trim() || undefined,
    });
    onDone();
  }

  return (
    <SheetContent
      title="Correct attendance"
      description={`${record.employee?.name ?? 'Employee'} · ${formatDate(record.checkIn)}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4 p-5">
        <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Recorded
          </p>
          <p className="ledger-num mt-1 text-[13px] text-[var(--text-primary)]">
            {formatTime(record.checkIn)} <span className="text-[var(--text-muted)]">→</span>{' '}
            {record.checkOut ? formatTime(record.checkOut) : 'open'}
            <span className="ml-2 text-[var(--text-tertiary)]">
              {formatDuration(record.workedHours)}
            </span>
          </p>
        </div>

        <Field label="Check out" htmlFor="checkOut" hint="Worked hours are recalculated on save.">
          <Input
            id="checkOut"
            type="datetime-local"
            className="font-mono"
            value={checkOut}
            onChange={(event) => setCheckOut(event.target.value)}
          />
        </Field>

        <Field label="Status" htmlFor="status">
          <Select
            id="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as AttendanceStatus)}
          >
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value.replace('_', ' ')}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Notes" htmlFor="notes" hint="Why this record was corrected.">
          <Textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>

        <p className="text-[11px] text-[var(--text-muted)]">
          Saving marks this record as manually edited and records who changed it.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={update.isPending}>
            Save correction
          </Button>
        </div>
      </form>
    </SheetContent>
  );
}

export default function AttendancePage() {
  return (
    <React.Suspense fallback={null}>
      <AttendanceView />
    </React.Suspense>
  );
}
