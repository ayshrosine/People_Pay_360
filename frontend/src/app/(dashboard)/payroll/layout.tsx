'use client';

import { SubNav } from '@/components/layout/page-shell';
import { useAuth } from '@/lib/auth/auth-provider';

export default function PayrollLayout({ children }: { children: React.ReactNode }) {
  const { can } = useAuth();

  // Structures and rules are configuration, not day-to-day payroll operation;
  // roles that cannot read them should not see dead tabs.
  const items = [
    { href: '/payroll/payruns', label: 'Payruns' },
    { href: '/payroll/payslips', label: 'Payslips' },
    ...(can('read', 'SalaryStructure')
      ? [{ href: '/payroll/structures', label: 'Structures' }]
      : []),
  ];

  return (
    <div>
      <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-base)] px-4">
        <div className="mx-auto max-w-[1600px]">
          <SubNav items={items} />
        </div>
      </div>
      {children}
    </div>
  );
}
