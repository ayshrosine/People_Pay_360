'use client';

import * as React from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/overlay';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-provider';
import { useEmployees } from '@/hooks/use-resources';
import { ADMIN_ITEM, type NavItem } from '@/components/layout/sidebar';

interface Entry {
  id: string;
  label: string;
  hint: string;
  href: string;
  group: 'Go to' | 'Employees';
}

const PAGES: { label: string; href: string; subject: NavItem['subject'] }[] = [
  { label: 'Dashboard', href: '/dashboard', subject: 'Dashboard' },
  { label: 'Employees', href: '/employees', subject: 'Employee' },
  { label: 'Contracts', href: '/contracts', subject: 'Contract' },
  { label: 'Time off requests', href: '/time-off/requests', subject: 'TimeOffRequest' },
  { label: 'Attendance', href: '/time-off/attendance', subject: 'Attendance' },
  { label: 'Allocations', href: '/time-off/allocations', subject: 'TimeOffAllocation' },
  { label: 'Working schedules', href: '/working-schedules', subject: 'WorkingSchedule' },
  { label: 'Payruns', href: '/payroll/payruns', subject: 'Payrun' },
  { label: 'Payslips', href: '/payroll/payslips', subject: 'Payslip' },
  { label: 'Salary structures', href: '/payroll/structures', subject: 'SalaryStructure' },
  { label: 'Users', href: ADMIN_ITEM.href, subject: 'User' },
];

/**
 * One search field for the whole workspace: destinations plus live employee
 * lookup. It only queries employees once the user has typed, so opening the
 * palette costs nothing.
 */
export function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (href: string) => void;
}) {
  const { can } = useAuth();
  const [query, setQuery] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(id);
  }, [query]);

  const employees = useEmployees(
    { search: debounced || undefined, limit: 6 },
    // Only reach for the API once there is something to search for.
    open && debounced.length > 1,
  );

  const entries = React.useMemo<Entry[]>(() => {
    const needle = query.trim().toLowerCase();

    const pages: Entry[] = PAGES.filter((page) => can('read', page.subject))
      .filter((page) => !needle || page.label.toLowerCase().includes(needle))
      .map((page) => ({
        id: `page:${page.href}`,
        label: page.label,
        hint: page.href,
        href: page.href,
        group: 'Go to',
      }));

    const people: Entry[] =
      debounced.length > 1
        ? (employees.data?.data ?? []).map((employee) => ({
            id: `employee:${employee.id}`,
            label: employee.name,
            hint: employee.jobPosition ?? employee.workEmail,
            href: `/employees/${employee.id}`,
            group: 'Employees',
          }))
        : [];

    return [...pages, ...people];
  }, [query, debounced, employees.data, can]);

  // Keep the highlight inside the list as results change under it.
  const clampedActive = entries.length === 0 ? 0 : Math.min(active, entries.length - 1);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (entries.length ? (index + 1) % entries.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (entries.length ? (index - 1 + entries.length) % entries.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const entry = entries[clampedActive];
      if (entry) onNavigate(entry.href);
    }
  }

  let lastGroup: string | null = null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setQuery('');
          setActive(0);
        }
      }}
    >
      <DialogContent
        title="Search the workspace"
        description="Jump to a page or an employee"
        size="md"
        className="top-[18%] translate-y-0 p-0"
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--border-subtle)] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search pages and employees…"
            aria-label="Search pages and employees"
            className="w-full bg-transparent text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
          <kbd className="shrink-0 rounded bg-[var(--surface-active)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
            ESC
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {entries.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-[var(--text-tertiary)]">
              {employees.isFetching ? 'Searching…' : 'Nothing matches that.'}
            </p>
          ) : (
            entries.map((entry, index) => {
              const header = entry.group !== lastGroup ? entry.group : null;
              lastGroup = entry.group;
              return (
                <React.Fragment key={entry.id}>
                  {header ? (
                    <p className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                      {header}
                    </p>
                  ) : null}
                  <button
                    onClick={() => onNavigate(entry.href)}
                    onMouseEnter={() => setActive(index)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-left transition-colors',
                      index === clampedActive
                        ? 'bg-[var(--surface-active)]'
                        : 'hover:bg-[var(--surface-hover)]',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-[var(--text-primary)]">
                        {entry.label}
                      </span>
                      <span className="block truncate text-[11.5px] text-[var(--text-muted)]">
                        {entry.hint}
                      </span>
                    </span>
                    {index === clampedActive ? (
                      <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
                    ) : null}
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
