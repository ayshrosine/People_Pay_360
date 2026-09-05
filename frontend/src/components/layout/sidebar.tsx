'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FileText,
  LayoutDashboard,
  LogOut,
  Palmtree,
  Receipt,
  Shield,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Brand } from '@/components/layout/brand';
import { useAuth } from '@/lib/auth/auth-provider';
import type { Subject } from '@/lib/abilities';

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  subject: Subject;
  /** Extra path prefixes that should also light this item up. */
  match?: string[];
}

export const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, subject: 'Dashboard' },
  { href: '/employees', label: 'Employees', icon: Users, subject: 'Employee' },
  { href: '/contracts', label: 'Contracts', icon: FileText, subject: 'Contract' },
  {
    // Attendance now lives inside Time Off, alongside leave: both answer the
    // same question - who was at work, and who was not.
    href: '/time-off',
    label: 'Time & Attendance',
    icon: Palmtree,
    subject: 'Attendance',
    match: ['/attendance', '/working-schedules'],
  },
  { href: '/payroll', label: 'Payroll', icon: Receipt, subject: 'Payslip' },
];

export const ADMIN_ITEM: NavItem = {
  href: '/admin/users',
  label: 'Users',
  icon: Shield,
  subject: 'User',
  match: ['/admin'],
};

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  const targets = [item.href, ...(item.match ?? [])];
  return targets.some((target) => pathname === target || pathname.startsWith(`${target}/`));
}

/**
 * A fixed left rail. The eyebrow label and the flush-left active marker are the
 * two things that make a sidebar readable at a glance: you can tell where you
 * are without reading any of the labels.
 */
export function Sidebar() {
  const pathname = usePathname() ?? '';
  const { can, logout } = useAuth();

  const items = NAV.filter((item) => can('read', item.subject));
  const showAdmin = can('read', 'User');

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-base)] lg:flex">
      <Brand href="/dashboard" className="px-5 py-5" />

      <p className="px-5 pb-2 pt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
        HR Workspace
      </p>

      <nav aria-label="Modules" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
        {[...items, ...(showAdmin ? [ADMIN_ITEM] : [])].map((item) => {
          const active = isNavItemActive(item, pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-[13.5px] transition-colors duration-150 [transition-timing-function:var(--ease-out)]',
                active
                  ? 'bg-[var(--surface-active)] font-semibold text-[var(--text-primary)]'
                  : 'font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
              )}
            >
              {active ? (
                <span
                  aria-hidden
                  className="absolute -left-3 top-1/2 h-5 w-[2.5px] -translate-y-1/2 rounded-r bg-[var(--accent)]"
                />
              ) : null}
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--border-subtle)] p-3">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-[13.5px] font-medium text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Log out
        </button>
      </div>
    </aside>
  );
}

/**
 * The same destinations as a horizontal strip, for viewports too narrow for the
 * rail. Icons only, so all six modules fit without scrolling on a phone.
 */
export function MobileNav() {
  const pathname = usePathname() ?? '';
  const { can } = useAuth();

  const items = NAV.filter((item) => can('read', item.subject));
  if (can('read', 'User')) items.push(ADMIN_ITEM);

  return (
    <nav
      aria-label="Modules"
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-[var(--border-subtle)] bg-[var(--surface-base)] lg:hidden"
    >
      {items.map((item) => {
        const active = isNavItemActive(item, pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            aria-label={item.label}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
              active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span className="max-w-full truncate px-1">{item.label.split(' ')[0]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Icon-only variant of the sidebar item, used by the mobile drawer trigger. */
export function useCurrentNavLabel(): string {
  const pathname = usePathname() ?? '';
  const all = [...NAV, ADMIN_ITEM];
  return all.find((item) => isNavItemActive(item, pathname))?.label ?? 'Workspace';
}
