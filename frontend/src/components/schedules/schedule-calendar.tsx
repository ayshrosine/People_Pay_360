'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { WorkingSchedule } from '@/lib/api/types';

/**
 * The weekly timetable.
 *
 * A schedule's list row tells you it is "40 hours over 5 days"; this tells you
 * *when* those hours are, which is the question you actually have when two
 * rosters have to cover the same week.
 *
 * Days are Monday-first because `WorkingScheduleLine.dayOfWeek` is 0 = Monday.
 */

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** One colour per schedule, so a block is traceable back to its row. */
const TONES = [
  'var(--accent)',
  'var(--status-success)',
  'var(--status-warning)',
  'var(--status-info)',
  'var(--status-danger)',
  'var(--status-neutral)',
];

const minutesOf = (time: string) => {
  const [hours, minutes] = (time ?? '').split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

const label = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

interface Block {
  scheduleId: string;
  scheduleName: string;
  tone: string;
  day: number;
  from: number;
  to: number;
  /** True for the tail of a shift that ran past midnight. */
  continuation?: boolean;
}

function blocksFor(schedules: WorkingSchedule[]): Block[] {
  const blocks: Block[] = [];

  schedules.forEach((schedule, index) => {
    const tone = TONES[index % TONES.length];

    for (const line of schedule.lines ?? []) {
      const from = minutesOf(line.startTime);
      const to = minutesOf(line.endTime);

      if (to > from) {
        blocks.push({
          scheduleId: schedule.id,
          scheduleName: schedule.name,
          tone,
          day: line.dayOfWeek,
          from,
          to,
        });
        continue;
      }

      // A night shift wraps past midnight, so it is drawn as two blocks: the
      // evening on its own day, and the small hours on the next.
      blocks.push({
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        tone,
        day: line.dayOfWeek,
        from,
        to: 24 * 60,
      });
      blocks.push({
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        tone,
        day: (line.dayOfWeek + 1) % 7,
        from: 0,
        to,
        continuation: true,
      });
    }
  });

  return blocks;
}

export function ScheduleCalendar({
  schedules,
  onOpen,
  className,
}: {
  schedules: WorkingSchedule[];
  onOpen?: (scheduleId: string) => void;
  className?: string;
}) {
  const blocks = React.useMemo(() => blocksFor(schedules), [schedules]);

  // Show only the hours that are actually used, with an hour of air either
  // side. A fixed 00:00–24:00 grid would be mostly empty for a 9-to-6 office.
  const { startHour, endHour } = React.useMemo(() => {
    if (blocks.length === 0) return { startHour: 8, endHour: 19 };
    const earliest = Math.min(...blocks.map((b) => b.from));
    const latest = Math.max(...blocks.map((b) => b.to));
    return {
      startHour: Math.max(0, Math.floor(earliest / 60) - 1),
      endHour: Math.min(24, Math.ceil(latest / 60) + 1),
    };
  }, [blocks]);

  const totalMinutes = (endHour - startHour) * 60;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const PIXELS_PER_HOUR = 44;
  const gridHeight = (endHour - startHour) * PIXELS_PER_HOUR;

  if (schedules.length === 0) {
    return (
      <div className={cn('py-16 text-center text-[13px] text-[var(--text-tertiary)]', className)}>
        No working schedules to plot yet.
      </div>
    );
  }

  return (
    <div className={cn('p-4', className)}>
      {/* Which colour is which schedule. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {schedules.map((schedule, index) => (
          <button
            key={schedule.id}
            onClick={() => onOpen?.(schedule.id)}
            className="group flex items-center gap-2 text-left"
          >
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: TONES[index % TONES.length] }}
            />
            <span className="text-[12.5px] text-[var(--text-secondary)] transition-colors group-hover:text-[var(--text-primary)]">
              {schedule.name}
            </span>
            <span className="ledger-num text-[11px] text-[var(--text-muted)]">
              {Number(schedule.totalWeeklyHours ?? 0).toFixed(1)}h
            </span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-[680px] gap-px">
          {/* The hour axis. */}
          <div className="w-12 shrink-0 pt-6">
            <div className="relative" style={{ height: gridHeight }}>
              {hours.map((hour) => (
                <span
                  key={hour}
                  className="absolute right-2 -translate-y-1/2 font-mono text-[10px] text-[var(--text-muted)]"
                  style={{ top: ((hour - startHour) / (endHour - startHour)) * gridHeight }}
                >
                  {String(hour % 24).padStart(2, '0')}
                </span>
              ))}
            </div>
          </div>

          {DAYS.map((day, dayIndex) => (
            <div key={day} className="min-w-0 flex-1">
              <p className="pb-1.5 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                {day}
              </p>

              <div
                className="relative rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)]"
                style={{ height: gridHeight }}
              >
                {/* Hour rules, so a block's position is readable. */}
                {hours.slice(1, -1).map((hour) => (
                  <div
                    key={hour}
                    aria-hidden
                    className="absolute inset-x-0 border-t border-[var(--border-subtle)]"
                    style={{ top: ((hour - startHour) / (endHour - startHour)) * gridHeight }}
                  />
                ))}

                {blocks
                  .filter((block) => block.day === dayIndex)
                  .map((block, index) => {
                    const top = ((block.from - startHour * 60) / totalMinutes) * gridHeight;
                    const height = ((block.to - block.from) / totalMinutes) * gridHeight;

                    return (
                      <button
                        key={`${block.scheduleId}-${index}`}
                        onClick={() => onOpen?.(block.scheduleId)}
                        title={`${block.scheduleName} · ${label(block.from)}–${label(block.to)}`}
                        className="absolute inset-x-1 overflow-hidden rounded-[4px] px-1.5 py-1 text-left transition-[filter,transform] duration-150 [transition-timing-function:var(--ease-out)] hover:z-10 hover:brightness-125"
                        style={{
                          top: Math.max(0, top),
                          height: Math.max(14, height),
                          backgroundColor: block.tone,
                          // The block is a solid colour, so its label needs to
                          // hold up against every tone in the palette.
                          color: '#fff',
                          opacity: block.continuation ? 0.55 : 0.9,
                        }}
                      >
                        <span className="block truncate font-mono text-[9.5px] leading-tight">
                          {label(block.from)}
                        </span>
                        <span className="block truncate text-[10px] font-medium leading-tight">
                          {block.scheduleName}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 text-[11.5px] text-[var(--text-muted)]">
        Blocks show rostered time before breaks. A faded block is the tail of a shift that started
        the previous day.
      </p>
    </div>
  );
}
