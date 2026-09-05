'use client';

import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/** The product name, in one place, so a rename is a one-line change. */
export const APP_NAME = 'Odoo PNX';

/**
 * The logo mark.
 *
 * Rendered from `/icon.svg` rather than inlined so the same file serves as the
 * favicon — one asset, never two that can drift apart.
 */
export function LogoMark({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/icon.svg"
      alt=""
      aria-hidden
      width={size}
      height={size}
      priority
      className={cn('shrink-0 rounded-[7px]', className)}
    />
  );
}

/**
 * Mark plus wordmark. `href` makes it a link back to the workspace; omit it on
 * the sign-in screen, where there is nowhere to go yet.
 */
export function Brand({
  href,
  size = 30,
  className,
  showName = true,
}: {
  href?: string;
  size?: number;
  className?: string;
  showName?: boolean;
}) {
  const content = (
    <>
      <LogoMark size={size} />
      {showName ? (
        <span
          className="font-semibold tracking-[-0.02em] text-[var(--text-primary)]"
          style={{ fontSize: Math.round(size / 2) }}
        >
          {APP_NAME}
        </span>
      ) : null}
    </>
  );

  const classes = cn(
    'flex items-center gap-2.5 transition-opacity duration-150 [transition-timing-function:var(--ease-out)]',
    href && 'hover:opacity-80',
    className,
  );

  if (!href) return <span className={classes}>{content}</span>;

  return (
    <Link href={href} className={classes} aria-label={APP_NAME}>
      {content}
    </Link>
  );
}
