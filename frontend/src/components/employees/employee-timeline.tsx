'use client';

import * as React from 'react';
import { CalendarClock, FileText, Palmtree } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/primitives';
import { EmptyState, Skeleton } from '@/components/ui/data-table';
import { StatusChip } from '@/components/ui/status';
import { useEmployeeTimeline } from '@/hooks/use-resources';
import { formatDate, formatDuration, formatMoney, formatTime } from '@/lib/utils';

const ENTRY_META: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; label: string; colour: string }
> = {
  contract: { icon: FileText, label: 'Contract', colour: 'var(--accent)' },
  time_off: { icon: Palmtree, label: 'Time off', colour: 'var(--status-info)' },
  attendance: { icon: CalendarClock, label: 'Attendance', colour: 'var(--status-neutral)' },
};

/**
 * The time-travel timeline: contracts, leave and attendance on one axis, so
 * "what was true for this person on 15 March" is a single glance rather than
 * three cross-referenced screens. This is the visible payoff of storing every
 * record with its own validity period.
 */
export function EmployeeTimeline({ employeeId }: { employeeId: string }) {
  const timeline = useEmployeeTimeline(employeeId);

  const grouped = React.useMemo(() => {
    const entries = timeline.data ?? [];
    const map = new Map<string, typeof entries>();

    for (const entry of entries) {
      const month = new Date(entry.date).toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
      });
      const bucket = map.get(month);
      if (bucket) bucket.push(entry);
      else map.set(month, [entry]);
    }

    return [...map.entries()];
  }, [timeline.data]);

  return (
    <Card>
      <CardHeader
        title="Employee timeline"
        description="Contracts, leave and attendance on a single axis"
      />

      <div className="p-4">
        {timeline.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-12" />
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <div className="py-10">
            <EmptyState
              title="Nothing recorded yet"
              description="Contracts, approved leave and attendance will appear here as they are created."
            />
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([month, entries]) => (
              <section key={month}>
                <h3 className="mb-3 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  {month}
                </h3>

                <ol className="relative space-y-0">
                  {/* The spine: one hairline the whole month hangs from. */}
                  <span
                    className="absolute bottom-2 left-[11px] top-2 w-px bg-[var(--border-subtle)]"
                    aria-hidden
                  />

                  {entries.map((entry, index) => {
                    const meta = ENTRY_META[entry.type] ?? ENTRY_META.attendance;
                    const Icon = meta.icon;
                    const data = entry.data as Record<string, unknown>;

                    return (
                      <li
                        key={`${entry.type}-${index}-${entry.date}`}
                        className="relative flex gap-3 py-2"
                      >
                        <span
                          className="relative z-10 mt-0.5 grid h-[23px] w-[23px] shrink-0 place-items-center rounded-full border border-[var(--border-default)] bg-[var(--surface-base)]"
                          style={{ color: meta.colour }}
                        >
                          <Icon className="h-3 w-3" aria-hidden />
                        </span>

                        <div className="min-w-0 flex-1 pb-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
                              {meta.label}
                            </span>
                            <span className="ledger-num text-[11px] text-[var(--text-tertiary)]">
                              {formatDate(entry.date)}
                            </span>
                            {typeof data.status === 'string' ? (
                              <StatusChip status={data.status} />
                            ) : null}
                          </div>

                          <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">
                            {describeEntry(entry.type, data)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function describeEntry(type: string, data: Record<string, unknown>): string {
  switch (type) {
    case 'contract': {
      const wage = formatMoney(Number(data.wage ?? 0));
      const end = data.endDate ? formatDate(String(data.endDate)) : 'open-ended';
      return `${wage} ${String(data.wageType ?? 'Monthly').toLowerCase()} · ${formatDate(
        String(data.startDate),
      )} to ${end}`;
    }
    case 'time_off': {
      const typeName =
        (data.timeOffType as { name?: string } | undefined)?.name ?? 'Leave';
      return `${typeName} · ${data.duration} day(s), ${formatDate(
        String(data.startDate),
      )} to ${formatDate(String(data.endDate))}`;
    }
    default: {
      const checkOut = data.checkOut ? formatTime(String(data.checkOut)) : 'no checkout';
      const worked =
        typeof data.workedHours === 'number' ? ` · ${formatDuration(data.workedHours)}` : '';
      return `${formatTime(String(data.checkIn))} → ${checkOut}${worked}`;
    }
  }
}
