'use client';

import * as React from 'react';
import { AlertCircle, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The ledger table.
 *
 * Rows are dense (28px of padding total) because scanning is the job here;
 * numeric columns are right-aligned tabular mono so digits line up into a
 * column you can read down like a ledger rail. Every state the data can be in
 * - loading, empty, failed - is a first-class render path, because a table
 * that only handles the happy case is the fastest way to look unfinished.
 */

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  /** Right-aligns and applies tabular mono. Use for money, hours, counts. */
  numeric?: boolean;
  width?: string;
  className?: string;
  cell: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRowClick?: (row: T) => void;
  /** Accent stripe on the left edge, e.g. the active contract row. */
  rowAccent?: (row: T) => boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  skeletonRows?: number;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRowClick,
  rowAccent,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction,
  skeletonRows = 6,
  className,
}: DataTableProps<T>) {
  const interactive = Boolean(onRowClick);

  return (
    // Wide tables scroll inside their own container; the page never does.
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full min-w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[var(--border-default)]">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                className={cn(
                  'whitespace-nowrap px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]',
                  column.numeric ? 'text-right' : 'text-left',
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {loading ? (
            Array.from({ length: skeletonRows }).map((_, rowIndex) => (
              <tr key={rowIndex} className="border-b border-[var(--border-subtle)]">
                {columns.map((column) => (
                  <td key={column.key} className="px-3 py-2.5">
                    <div
                      className="h-3.5 animate-pulse rounded bg-[var(--surface-hover)]"
                      style={{ width: `${45 + ((rowIndex * 13 + column.key.length * 7) % 45)}%` }}
                    />
                  </td>
                ))}
              </tr>
            ))
          ) : error ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-14">
                <EmptyState
                  icon={<AlertCircle className="h-5 w-5 text-[var(--status-danger)]" />}
                  title="Could not load this list"
                  description={error}
                />
              </td>
            </tr>
          ) : !rows || rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-14">
                <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const accented = rowAccent?.(row) ?? false;
              return (
                <tr
                  key={rowKey(row)}
                  onClick={interactive ? () => onRowClick?.(row) : undefined}
                  onKeyDown={
                    interactive
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onRowClick?.(row);
                          }
                        }
                      : undefined
                  }
                  tabIndex={interactive ? 0 : undefined}
                  role={interactive ? 'button' : undefined}
                  className={cn(
                    'border-b border-[var(--border-subtle)] transition-colors duration-100',
                    interactive &&
                      'cursor-pointer hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] focus-visible:outline-none',
                    accented && 'shadow-[inset_2px_0_0_0_var(--status-success)]',
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        'px-3 py-2.5 align-middle text-[var(--text-secondary)]',
                        column.numeric && 'ledger-num text-right text-[var(--text-primary)]',
                        column.className,
                      )}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center text-center">
      <div className="mb-3 grid h-10 w-10 place-items-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
        {icon ?? <Inbox className="h-4 w-4 text-[var(--text-muted)]" />}
      </div>
      <p className="text-[13px] font-medium text-[var(--text-primary)]">{title}</p>
      {description ? (
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-tertiary)]">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-[var(--surface-hover)]', className)} />;
}
