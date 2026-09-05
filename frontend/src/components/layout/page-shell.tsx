'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The page frame every screen sits in.
 *
 * Each view has one focal element: a large display title, introduced by a mono
 * micro-label that says which part of the product you are in. Everything else -
 * description, filters, metadata - is deliberately demoted beneath it.
 */
export function PageShell({
  eyebrow,
  title,
  description,
  breadcrumbs,
  actions,
  toolbar,
  children,
  wide,
}: {
  /** Mono uppercase micro-label above the title, e.g. "WORK ORDER QUEUE". */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /**
   * Detail pages only. The top bar already names the module, so a list page
   * needs no trail; a record inside one does.
   */
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn('mx-auto w-full px-4 py-7 sm:px-6', wide ? 'max-w-[1600px]' : 'max-w-[1400px]')}>
      {breadcrumbs?.length ? (
        <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-[11.5px]">
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={`${crumb.label}-${index}`}>
              {index > 0 ? (
                <ChevronRight className="h-3 w-3 text-[var(--text-muted)]" aria-hidden />
              ) : null}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="text-[var(--text-tertiary)] underline-offset-4 transition-colors hover:text-[var(--text-primary)] hover:underline"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-[var(--text-muted)]">{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-[34px] font-bold leading-[1.05] tracking-[-0.035em] text-[var(--text-primary)] sm:text-[40px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-2.5 max-w-2xl text-[13.5px] leading-relaxed text-[var(--text-tertiary)]">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>

      {toolbar ? <div className="mt-6">{toolbar}</div> : null}

      <div className="mt-6">{children}</div>
    </div>
  );
}

/**
 * The accent word inside a display title. Used for exactly one word per page,
 * so the eye lands in the same place on every screen.
 */
export function Accent({ children }: { children: React.ReactNode }) {
  return <span className="text-[var(--accent)]">{children}</span>;
}

/** The horizontal sub-navigation used inside Time & Attendance and Payroll. */
export function SubNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname() ?? '';

  return (
    <nav className="flex items-center gap-1 overflow-x-auto border-b border-[var(--border-subtle)]">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors',
              active
                ? 'border-[var(--accent)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** A labelled toolbar row: search on the left, filters and actions on the right. */
export function Toolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>
  );
}
