'use client';

import { SubNav } from '@/components/layout/page-shell';

const ITEMS = [
  { href: '/time-off/requests', label: 'Requests' },
  { href: '/time-off/allocations', label: 'Allocations' },
  { href: '/time-off/types', label: 'Types' },
];

export default function TimeOffLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-base)] px-4">
        <div className="mx-auto max-w-[1600px]">
          <SubNav items={ITEMS} />
        </div>
      </div>
      {children}
    </div>
  );
}
