'use client';

import * as React from 'react';
import { cn, humanize } from '@/lib/utils';

/**
 * One status vocabulary for the whole product.
 *
 * A green chip means "settled" whether it is an Approved leave request, a
 * Running contract or a Paid payslip. Mapping every module's enum through this
 * single table is what makes the colour actually mean something.
 */
export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

const TONE_BY_STATUS: Record<string, Tone> = {
  // Employee
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  ON_LEAVE: 'info',
  TERMINATED: 'danger',
  // Contract
  DRAFT: 'neutral',
  RUNNING: 'success',
  EXPIRED: 'warning',
  CANCELLED: 'danger',
  // Attendance
  PRESENT: 'success',
  LATE: 'warning',
  ABSENT: 'danger',
  OVERTIME: 'info',
  MISSING_CHECKOUT: 'warning',
  MANUALLY_EDITED: 'neutral',
  // Time off
  TO_APPROVE: 'warning',
  APPROVED: 'success',
  REFUSED: 'danger',
  'To Approve': 'warning',
  Approved: 'success',
  Refused: 'danger',
  // Payroll
  COMPUTING: 'info',
  COMPUTED: 'info',
  WAITING: 'warning',
  VALIDATED: 'accent',
  PAID: 'success',
  ERROR: 'danger',
};

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'text-[var(--status-neutral)] bg-[var(--status-neutral-bg)]',
  success: 'text-[var(--status-success)] bg-[var(--status-success-bg)]',
  warning: 'text-[var(--status-warning)] bg-[var(--status-warning-bg)]',
  danger: 'text-[var(--status-danger)] bg-[var(--status-danger-bg)]',
  info: 'text-[var(--status-info)] bg-[var(--status-info-bg)]',
  accent: 'text-[var(--accent)] bg-[var(--accent-subtle)]',
};

export function toneForStatus(status: string | null | undefined): Tone {
  if (!status) return 'neutral';
  return TONE_BY_STATUS[status] ?? 'neutral';
}

export function StatusChip({
  status,
  tone,
  label,
  className,
}: {
  status?: string | null;
  tone?: Tone;
  label?: string;
  className?: string;
}) {
  const resolved = tone ?? toneForStatus(status);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium leading-5',
        TONE_CLASSES[resolved],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden />
      {label ?? humanize(status)}
    </span>
  );
}

const CATEGORY_TONE: Record<string, Tone> = {
  BASIC: 'accent',
  ALLOWANCE: 'success',
  DEDUCTION: 'danger',
  GROSS: 'info',
  NET: 'accent',
};

export function CategoryChip({ category }: { category: string }) {
  return (
    <span
      className={cn(
        'inline-flex rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.06em]',
        TONE_CLASSES[CATEGORY_TONE[category] ?? 'neutral'],
      )}
    >
      {category}
    </span>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-[0.04em]',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
