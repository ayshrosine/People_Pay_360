'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarClock,
  ChevronDown,
  FileText,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  Palmtree,
  Receipt,
  Shield,
  Sun,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/overlay';
import { useAuth } from '@/lib/auth/auth-provider';
import { ROLE_LABELS, type Subject } from '@/lib/abilities';
import { useUiStore, type Theme } from '@/stores/ui-store';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  subject: Subject;
  /** Extra path prefixes that should also light this item up. */
  match?: string[];
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, subject: 'Dashboard' },
  { href: '/employees', label: 'Employees', icon: Users, subject: 'Employee' },
  { href: '/contracts', label: 'Contracts', icon: FileText, subject: 'Contract' },
  {
    href: '/attendance',
    label: 'Attendance',
    icon: CalendarClock,
    subject: 'Attendance',
    match: ['/working-schedules'],
  },
  { href: '/time-off', label: 'Time Off', icon: Palmtree, subject: 'TimeOffRequest' },
  { href: '/payroll', label: 'Payroll', icon: Receipt, subject: 'Payslip' },
];

/**
 * A top module bar rather than a sidebar: it matches the source mockups, and
 * it hands the full page width back to the dense tables that are the point of
 * this product.
 */
export function TopNav() {
  const pathname = usePathname() ?? '';
  const { user, role, can, logout } = useAuth();
  const { theme, setTheme } = useUiStore();

  const visible = NAV.filter((item) => can('read', item.subject));
  const isAdmin = can('read', 'User');

  function isActive(item: NavItem) {
    const targets = [item.href, ...(item.match ?? [])];
    return targets.some((target) => pathname === target || pathname.startsWith(`${target}/`));
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[var(--surface-base)]/85 backdrop-blur-md">
      <div className="flex h-13 items-center gap-1 px-4" style={{ height: 52 }}>
        <Link href="/dashboard" className="mr-3 flex shrink-0 items-center gap-2">
          <span className="grid h-6.5 w-6.5 place-items-center rounded-[6px] bg-[var(--accent)]" style={{ width: 26, height: 26 }}>
            <span className="font-mono text-[11px] font-bold text-white">P</span>
          </span>
          <span className="hidden text-[13px] font-semibold tracking-[-0.01em] sm:inline">
            PeoplePay360
          </span>
        </Link>

        <nav aria-label="Modules" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {visible.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex shrink-0 items-center gap-1.5 rounded-[var(--radius-ctl)] px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150',
                  active
                    ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                    : 'text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {item.label}
              </Link>
            );
          })}

          {isAdmin ? (
            <Link
              href="/admin/users"
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-[var(--radius-ctl)] px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150',
                pathname.startsWith('/admin')
                  ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                  : 'text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
              )}
            >
              <Shield className="h-3.5 w-3.5" aria-hidden />
              Users
            </Link>
          ) : null}
        </nav>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="ml-2 flex shrink-0 items-center gap-2 rounded-[var(--radius-ctl)] px-1.5 py-1 transition-colors hover:bg-[var(--surface-hover)]"
              aria-label="Account menu"
            >
              <Avatar name={user?.employee?.name ?? user?.email ?? '?'} src={user?.employee?.avatarUrl} size={26} />
              <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" aria-hidden />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="min-w-56">
            <div className="px-2.5 py-2">
              <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                {user?.employee?.name ?? user?.email}
              </p>
              <p className="truncate text-[11px] text-[var(--text-tertiary)]">{user?.email}</p>
              {role ? (
                <p className="mt-1.5 inline-flex rounded bg-[var(--accent-subtle)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--accent)]">
                  {ROLE_LABELS[role]}
                </p>
              ) : null}
            </div>

            <DropdownMenuSeparator />
            <DropdownMenuLabel>Appearance</DropdownMenuLabel>
            {(
              [
                { value: 'dark', label: 'Dark', icon: Moon },
                { value: 'light', label: 'Light', icon: Sun },
                { value: 'system', label: 'System', icon: Monitor },
              ] as { value: Theme; label: string; icon: React.ComponentType<{ className?: string }> }[]
            ).map((option) => (
              <DropdownMenuItem
                key={option.value}
                onSelect={() => setTheme(option.value)}
                className={cn(theme === option.value && 'text-[var(--accent)]')}
              >
                <option.icon className="h-3.5 w-3.5" aria-hidden />
                {option.label}
              </DropdownMenuItem>
            ))}

            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={logout} className="text-[var(--status-danger)]">
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
