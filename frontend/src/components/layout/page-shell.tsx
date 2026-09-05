'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The page frame every screen sits in.
 *
 * There is exactly one focal element per view - the page title and its primary
 * action - and everything else is deliberately demoted: breadcrumbs to 11px
 * muted, metadata to mono micro-labels.
 */
export function PageShell({
  title,
  description,
  breadcrumbs,
  actions,
  toolbar,
  children,
  wide,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn('mx-auto w-full px-4 py-5', wide ? 'max-w-[1600px]' : 'max-w-[1400px]')}>
      {breadcrumbs?.length ? (
        <nav aria-label="Breadcrumb" className="mb-2.5 flex items-center gap-1 text-[11px]">
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

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.025em] text-[var(--text-primary)]">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[var(--text-tertiary)]">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>

      {toolbar ? <div className="mt-4">{toolbar}</div> : null}

      <div className="mt-4">{children}</div>
    </div>
  );
}

/** The horizontal sub-navigation used inside Time Off and Payroll. */
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
