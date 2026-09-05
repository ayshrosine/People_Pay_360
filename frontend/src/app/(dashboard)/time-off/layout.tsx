'use client';

import { SubNav } from '@/components/layout/page-shell';

/**
 * Attendance sits here rather than in a module of its own: leave and
 * attendance are two answers to one question - who was at work - and payroll
 * reads both to decide what a period is worth.
 */
const ITEMS = [
  { href: '/time-off/attendance', label: 'Attendance' },
  { href: '/time-off/requests', label: 'Leave requests' },
  { href: '/time-off/allocations', label: 'Allocations' },
  { href: '/time-off/types', label: 'Leave types' },
];

export default function TimeOffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-base)] px-4 sm:px-6">
        <div className="mx-auto max-w-[1600px]">
          <SubNav items={ITEMS} />
        </div>
      </div>
      {children}
    </div>
  );
}
