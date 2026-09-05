'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Field, Input, Select, Switch } from '@/components/ui/primitives';
import { Skeleton } from '@/components/ui/data-table';
import { useSaveWorkingSchedule, useWorkingSchedule } from '@/hooks/use-resources';
import { useAuth } from '@/lib/auth/auth-provider';
import { cn } from '@/lib/utils';
import type { WorkingSchedule, WorkingScheduleLine } from '@/lib/api/types';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface DayRow extends WorkingScheduleLine {
  enabled: boolean;
}

const DEFAULT_ROWS: DayRow[] = DAYS.map((_, index) => ({
  dayOfWeek: index,
  startTime: '09:00',
  endTime: '18:00',
  breakMinutes: 60,
  // Mon-Fri on by default; the common case should need no clicks.
  enabled: index < 5,
}));

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function rowsFrom(schedule: WorkingSchedule): DayRow[] {
  const byDay = new Map(schedule.lines?.map((line) => [line.dayOfWeek, line]));
  return DAYS.map((_, index) => {
    const line = byDay.get(index);
    return line
      ? { ...line, enabled: true }
      : {
          dayOfWeek: index,
          startTime: '09:00',
          endTime: '18:00',
          breakMinutes: 60,
          enabled: false,
        };
  });
}

/**
 * Waits for the record, then mounts the editor keyed on it, so the weekly grid
 * is initialised once at mount rather than mirrored in by an effect.
 */
export default function WorkingSchedulePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const schedule = useWorkingSchedule(id);

  if (id !== 'new' && schedule.isLoading) {
    return (
      <PageShell title={<Skeleton className="h-6 w-52" />}>
        <Skeleton className="h-96" />
      </PageShell>
    );
  }

  return <WorkingScheduleForm key={schedule.data?.id ?? id} />;
}

function WorkingScheduleForm() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = useAuth();

  const id = params.id;
  const isNew = id === 'new';

  const schedule = useWorkingSchedule(id);
  const save = useSaveWorkingSchedule();

  const record = schedule.data;

  const [name, setName] = React.useState(record?.name ?? '');
  const [company, setCompany] = React.useState(record?.company ?? 'My Company');
  const [timezone, setTimezone] = React.useState(record?.timezone ?? 'Asia/Kolkata');
  const [scheduleType, setScheduleType] = React.useState(record?.scheduleType ?? 'Fixed');
  const [status, setStatus] = React.useState(record?.status ?? 'Active');
  const [rows, setRows] = React.useState<DayRow[]>(() =>
    record ? rowsFrom(record) : DEFAULT_ROWS,
  );

  /**
   * Recomputed on every keystroke so the operator sees the consequence of a
   * change immediately. The server recalculates it too and its value wins on
   * save - this is feedback, not the source of truth.
   */
  const totalWeeklyHours = React.useMemo(
    () =>
      rows
        .filter((row) => row.enabled)
        .reduce((sum, row) => {
          const worked = minutesOf(row.endTime) - minutesOf(row.startTime) - (row.breakMinutes || 0);
          return sum + Math.max(0, worked) / 60;
        }, 0),
    [rows],
  );

  const invalidRows = rows.filter(
    (row) => row.enabled && minutesOf(row.endTime) <= minutesOf(row.startTime),
  );

  const editable = can(isNew ? 'create' : 'update', 'WorkingSchedule');

  function updateRow(dayOfWeek: number, patch: Partial<DayRow>) {
    setRows((previous) =>
      previous.map((row) => (row.dayOfWeek === dayOfWeek ? { ...row, ...patch } : row)),
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (invalidRows.length > 0) return;

    const saved = await save.mutateAsync({
      ...(isNew ? {} : { id }),
      name: name.trim(),
      company: company.trim(),
      timezone,
      scheduleType,
      status,
      lines: rows
        .filter((row) => row.enabled)
        .map(({ dayOfWeek, startTime, endTime, breakMinutes }) => ({
          dayOfWeek,
          startTime,
          endTime,
          breakMinutes: Number(breakMinutes) || 0,
        })),
    });

    if (isNew && saved?.id) router.replace(`/working-schedules/${saved.id}`);
  }

  return (
    <PageShell
      breadcrumbs={[
        { label: 'Working schedules', href: '/working-schedules' },
        { label: isNew ? 'New' : name },
      ]}
      title={isNew ? 'New working schedule' : name}
      actions={
        editable ? (
          <Button
            variant="primary"
            form="schedule-form"
            type="submit"
            loading={save.isPending}
            disabled={invalidRows.length > 0}
          >
            <Save className="h-3.5 w-3.5" aria-hidden />
            Save
          </Button>
        ) : null
      }
    >
      <form id="schedule-form" onSubmit={handleSubmit} noValidate>
        <fieldset disabled={!editable} className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <Card className="self-start">
            <CardHeader title="Schedule" />
            <div className="space-y-4 p-4">
              <Field label="Schedule name" htmlFor="name">
                <Input
                  id="name"
                  required
                  placeholder="Standard 40 Hours/Week"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>

              <Field label="Company" htmlFor="company">
                <Input
                  id="company"
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                />
              </Field>

              <Field label="Timezone" htmlFor="timezone">
                <Input
                  id="timezone"
                  className="font-mono"
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                />
              </Field>

              <Field label="Schedule type" htmlFor="scheduleType">
                <Select
                  id="scheduleType"
                  value={scheduleType}
                  onChange={(event) => setScheduleType(event.target.value)}
                >
                  <option value="Fixed">Fixed</option>
                  <option value="Flexible">Flexible</option>
                  <option value="Full Flexible">Full Flexible</option>
                </Select>
              </Field>

              <Field label="Status" htmlFor="status">
                <Select id="status" value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </Select>
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Weekly schedule"
              description="Turn a day on to include it in the working week"
            />

            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border-default)]">
                    {['Day', 'Working', 'Start', 'End', 'Break (min)', 'Hours'].map((heading, index) => (
                      <th
                        key={heading}
                        scope="col"
                        className={cn(
                          'px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]',
                          index === 5 ? 'text-right' : 'text-left',
                        )}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row) => {
                    const worked = Math.max(
                      0,
                      minutesOf(row.endTime) - minutesOf(row.startTime) - (row.breakMinutes || 0),
                    );
                    const invalid =
                      row.enabled && minutesOf(row.endTime) <= minutesOf(row.startTime);

                    return (
                      <tr
                        key={row.dayOfWeek}
                        className={cn(
                          'border-b border-[var(--border-subtle)] transition-opacity',
                          !row.enabled && 'opacity-45',
                        )}
                      >
                        <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                          {DAYS[row.dayOfWeek]}
                        </td>
                        <td className="px-3 py-2">
                          <Switch
                            checked={row.enabled}
                            aria-label={`${DAYS[row.dayOfWeek]} is a working day`}
                            onCheckedChange={(checked) =>
                              updateRow(row.dayOfWeek, { enabled: checked })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="time"
                            className="h-8 w-28 font-mono"
                            aria-label={`${DAYS[row.dayOfWeek]} start time`}
                            disabled={!row.enabled}
                            invalid={invalid}
                            value={row.startTime}
                            onChange={(event) =>
                              updateRow(row.dayOfWeek, { startTime: event.target.value })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="time"
                            className="h-8 w-28 font-mono"
                            aria-label={`${DAYS[row.dayOfWeek]} end time`}
                            disabled={!row.enabled}
                            invalid={invalid}
                            value={row.endTime}
                            onChange={(event) =>
                              updateRow(row.dayOfWeek, { endTime: event.target.value })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min="0"
                            step="5"
                            className="h-8 w-20 ledger-num"
                            aria-label={`${DAYS[row.dayOfWeek]} break minutes`}
                            disabled={!row.enabled}
                            value={row.breakMinutes}
                            onChange={(event) =>
                              updateRow(row.dayOfWeek, { breakMinutes: Number(event.target.value) })
                            }
                          />
                        </td>
                        <td className="ledger-num px-3 py-2 text-right text-[var(--text-primary)]">
                          {row.enabled ? `${(worked / 60).toFixed(2)}h` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                <tfoot>
                  <tr className="bg-[var(--surface-sunken)]">
                    <td
                      colSpan={5}
                      className="px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]"
                    >
                      Total weekly hours
                    </td>
                    <td className="ledger-num px-3 py-2.5 text-right text-[15px] font-semibold text-[var(--text-primary)]">
                      {totalWeeklyHours.toFixed(2)}h
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {invalidRows.length > 0 ? (
              <p
                role="alert"
                className="border-t border-[var(--border-subtle)] px-4 py-2.5 text-[12px] text-[var(--status-danger)]"
              >
                {invalidRows.map((row) => DAYS[row.dayOfWeek]).join(', ')}: the end time must be
                after the start time.
              </p>
            ) : null}
          </Card>
        </fieldset>
      </form>
    </PageShell>
  );
}
