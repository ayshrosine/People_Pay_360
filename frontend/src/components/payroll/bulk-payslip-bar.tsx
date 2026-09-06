'use client';

import * as React from 'react';
import { Check, Mail, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BulkPayslipAction } from '@/hooks/use-resources';
import type { Payslip } from '@/lib/api/types';

/**
 * The bar that appears once payslips are selected.
 *
 * Each action states what it will do to how many people, and disables itself
 * with a reason when the selection is not in the right state — a payrun moves
 * money, so "why is this greyed out" should never be a guess.
 */

interface BulkAction {
  action: BulkPayslipAction;
  label: (n: number) => string;
  icon: React.ComponentType<{ className?: string }>;
  danger?: boolean;
  /** Payslip statuses this action accepts. */
  accepts: Payslip['status'][];
  reason: string;
}

const ACTIONS: BulkAction[] = [
  {
    action: 'validate',
    label: (n) => `Validate ${n}`,
    icon: Check,
    accepts: ['COMPUTED'],
    reason: 'Only computed payslips can be validated.',
  },
  {
    action: 'mark-paid',
    label: (n) => `Mark ${n} paid`,
    icon: Check,
    accepts: ['VALIDATED'],
    reason: 'Only validated payslips can be marked paid.',
  },
  {
    action: 'send',
    label: (n) => `Send ${n}`,
    icon: Mail,
    accepts: ['VALIDATED', 'PAID'],
    reason: 'Validate a payslip before sending it.',
  },
  {
    action: 'remove',
    label: (n) => `Remove ${n}`,
    icon: Trash2,
    danger: true,
    accepts: ['DRAFT', 'COMPUTED', 'VALIDATED', 'WAITING', 'ERROR'],
    reason: 'A paid payslip cannot be removed.',
  },
];

export function BulkPayslipBar({
  selected,
  payslips,
  pending,
  onRun,
  onClear,
}: {
  selected: Set<string>;
  payslips: Payslip[];
  pending: BulkPayslipAction | null;
  onRun: (action: BulkPayslipAction) => void;
  onClear: () => void;
}) {
  if (selected.size === 0) return null;

  const chosen = payslips.filter((slip) => selected.has(slip.id));
  const blocked = chosen.filter((slip) =>
    slip.warnings?.some((warning) => warning.severity === 'blocking'),
  );

  return (
    <div className="sticky top-14 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[var(--accent)] bg-[var(--accent-subtle)] px-3 py-2.5 backdrop-blur-md">
      <span className="ledger-num text-[13px] font-semibold text-[var(--text-primary)]">
        {selected.size}
      </span>
      <span className="text-[13px] text-[var(--text-secondary)]">
        payslip{selected.size === 1 ? '' : 's'} selected
      </span>

      {blocked.length > 0 ? (
        <span className="rounded bg-[var(--status-warning-bg)] px-1.5 py-0.5 text-[11px] text-[var(--status-warning)]">
          {blocked.length} blocked
        </span>
      ) : null}

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {ACTIONS.map((entry) => {
          const eligible = chosen.filter((slip) => entry.accepts.includes(slip.status));
          const usable = eligible.length > 0;
          const Icon = entry.icon;

          return (
            <Button
              key={entry.action}
              size="sm"
              variant={entry.danger ? 'danger' : 'secondary'}
              disabled={!usable}
              loading={pending === entry.action}
              title={usable ? undefined : entry.reason}
              onClick={() => onRun(entry.action)}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {/* The count is of what this action can actually touch, which may
                  be fewer than are selected. */}
              {entry.label(eligible.length)}
            </Button>
          );
        })}

        <Button size="icon-sm" variant="ghost" aria-label="Clear selection" onClick={onClear}>
          <X className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
