'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Clock, LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlay';
import { StatusChip } from '@/components/ui/status';
import { useAttendanceToday, useCheckIn, useCheckOut } from '@/hooks/use-resources';
import { useAuth } from '@/lib/auth/auth-provider';
import { formatDuration, formatTime } from '@/lib/utils';

/**
 * The wall clock is an external system, so it is read through
 * `useSyncExternalStore` rather than mirrored into state by an effect. The
 * server snapshot is `null`, which keeps the first client render identical to
 * the server output and avoids a hydration mismatch on the time.
 */
function subscribeToClock(onChange: () => void) {
  const id = window.setInterval(onChange, 1000);
  return () => window.clearInterval(id);
}

let clockSnapshot = Math.floor(Date.now() / 1000);

function getClockSnapshot() {
  const seconds = Math.floor(Date.now() / 1000);
  // Return a stable value within the same second so React does not see a new
  // snapshot on every read and loop.
  if (seconds !== clockSnapshot) clockSnapshot = seconds;
  return clockSnapshot;
}

function useLiveClock(): Date | null {
  const seconds = React.useSyncExternalStore(
    subscribeToClock,
    getClockSnapshot,
    () => null,
  );

  return React.useMemo(() => (seconds === null ? null : new Date(seconds * 1000)), [seconds]);
}

/**
 * The floating attendance widget: present on every authenticated page, showing
 * the live clock and today's open session, with a single primary button that
 * flips between Check In and Check Out.
 *
 * Clicking opens a confirmation popover first - a mis-clicked punch is a real
 * correction request for HR, so it is worth one deliberate step.
 */
export function AttendanceWidget() {
  const { user } = useAuth();
  const now = useLiveClock();
  const [open, setOpen] = React.useState(false);

  const hasEmployeeRecord = Boolean(user?.employeeId);
  const { data: session, isLoading } = useAttendanceToday(hasEmployeeRecord);

  const checkIn = useCheckIn();
  const checkOut = useCheckOut();

  if (!hasEmployeeRecord) return null;

  const isCheckedIn = Boolean(session && !session.checkOut);
  const elapsedHours =
    isCheckedIn && session && now
      ? (now.getTime() - new Date(session.checkIn).getTime()) / 3_600_000
      : null;

  const greeting = (() => {
    const hour = now?.getHours() ?? 9;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const pending = checkIn.isPending || checkOut.isPending;

  async function handleAction() {
    if (isCheckedIn && session) {
      await checkOut.mutateAsync(session.id);
    } else {
      await checkIn.mutateAsync({});
    }
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={isCheckedIn ? 'Attendance: checked in' : 'Attendance: not checked in'}
          className="fixed bottom-5 right-5 z-30 flex items-center gap-2.5 rounded-full border border-[var(--border-default)] bg-[var(--surface-raised)] py-2 pl-2.5 pr-3.5 shadow-[var(--shadow-overlay)] transition-transform duration-150 [transition-timing-function:var(--ease-out)] hover:-translate-y-0.5 active:scale-[0.97]"
        >
          <span className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--surface-sunken)]">
            <Clock className="h-3.5 w-3.5 text-[var(--text-secondary)]" aria-hidden />
            {isCheckedIn ? (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--status-success)] ring-2 ring-[var(--surface-raised)]" />
            ) : null}
          </span>

          <span className="text-left">
            <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {isCheckedIn ? 'Working' : 'Attendance'}
            </span>
            <span className="ledger-num block text-[13px] font-semibold leading-tight text-[var(--text-primary)]">
              {isCheckedIn && elapsedHours !== null
                ? formatDuration(elapsedHours)
                : now
                  ? now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
                  : '--:--'}
            </span>
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent side="top" align="end" className="w-72 p-0">
        <div className="border-b border-[var(--border-subtle)] px-4 py-3">
          <p className="text-[13px] font-semibold text-[var(--text-primary)]">
            {greeting}, {user?.employee?.name?.split(' ')[0] ?? 'there'}
          </p>
          <p className="ledger-num mt-0.5 text-[11px] text-[var(--text-tertiary)]">
            {now
              ? now.toLocaleString('en-GB', {
                  weekday: 'short',
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false,
                })
              : '—'}
          </p>
        </div>

        <div className="px-4 py-3">
          <AnimatePresence mode="wait" initial={false}>
            {isLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-9 animate-pulse rounded bg-[var(--surface-hover)]"
              />
            ) : isCheckedIn && session ? (
              <motion.div
                key="in"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                className="space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    Today
                  </span>
                  <StatusChip status={session.status} />
                </div>
                <p className="ledger-num text-[13px] text-[var(--text-secondary)]">
                  {formatTime(session.checkIn)} <span className="text-[var(--text-muted)]">→</span> now
                  <span className="ml-2 font-semibold text-[var(--text-primary)]">
                    {formatDuration(elapsedHours)}
                  </span>
                </p>
              </motion.div>
            ) : (
              <motion.p
                key="out"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                className="text-[12px] leading-relaxed text-[var(--text-tertiary)]"
              >
                You have no open session today. Check in to start recording your worked hours.
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <div className="border-t border-[var(--border-subtle)] p-3">
          <Button
            variant={isCheckedIn ? 'secondary' : 'primary'}
            className="w-full"
            loading={pending}
            onClick={handleAction}
          >
            {isCheckedIn ? (
              <>
                <LogOut className="h-3.5 w-3.5" aria-hidden /> Check out
              </>
            ) : (
              <>
                <LogIn className="h-3.5 w-3.5" aria-hidden /> Check in
              </>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
