'use client';

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { Check, Minus } from 'lucide-react';
import { cn, initials } from '@/lib/utils';

/* ---------------------------------------------------------------- surfaces */

/**
 * The base container. Borders-only depth: one hairline, no shadow, so a card
 * inside a card still reads as structure rather than as stacked paper.
 */
export function Card({
  className,
  children,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  /**
   * Set on cards that are themselves a target - a link, or something you
   * click. A card that only holds content should not react to the pointer,
   * or every dashboard panel would look clickable.
   */
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-base)]',
        'transition-[border-color,background-color,transform,box-shadow] duration-200',
        '[transition-timing-function:var(--ease-out)]',
        interactive &&
          'cursor-pointer hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:shadow-[0_10px_28px_-16px_rgba(0,0,0,0.55)]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-4 py-3',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-[12px] text-[var(--text-tertiary)]">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** The uppercase mono micro-label that names every value in this product. */
export function FieldLabel({
  className,
  children,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn(
        'font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]',
        className,
      )}
      {...props}
    >
      {children}
    </LabelPrimitive.Root>
  );
}

/** Dashed rule + corner ticks: the quiet structural motif between sections. */
export function SectionRule({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-1" role="separator">
      <div className="rule-dashed flex-1" />
      {label ? (
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          {label}
        </span>
      ) : null}
      <div className="rule-dashed flex-1" />
    </div>
  );
}

/* ------------------------------------------------------------------ inputs */

const controlBase =
  'w-full rounded-[var(--radius-ctl)] border border-[var(--control-border)] bg-[var(--control-bg)] px-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] ' +
  // Border and ring animate with the fill, so focus arrives as one movement.
  'transition-[background-color,border-color,box-shadow] duration-200 [transition-timing-function:var(--ease-out)] ' +
  'hover:bg-[var(--control-bg-hover)] hover:border-[var(--border-strong)] ' +
  'focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)] disabled:opacity-50';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <input
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      controlBase,
      'h-9',
      invalid && 'border-[var(--status-danger)] focus:ring-[var(--status-danger-bg)]',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(controlBase, 'min-h-20 py-2 leading-relaxed', className)} {...props} />
));
Textarea.displayName = 'Textarea';

/**
 * A styled native select. Native is deliberate: it is keyboard- and
 * screen-reader-correct for free, and these are all short, flat option lists.
 */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(controlBase, 'h-9 appearance-none pr-8', className)}
      {...props}
    >
      {children}
    </select>
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--text-muted)]"
    >
      <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  </div>
));
Select.displayName = 'Select';

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
      {error ? (
        <p className="text-[11px] text-[var(--status-danger)]">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-[var(--text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

export const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> & { indeterminate?: boolean }
>(({ className, indeterminate, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      // The visible box is 16px; the pseudo-element extends the hit area to 40.
      'relative grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border border-[var(--control-border)] bg-[var(--control-bg)] transition-colors',
      'before:absolute before:-inset-3 before:content-[""]',
      'data-[state=checked]:border-[var(--accent)] data-[state=checked]:bg-[var(--accent)]',
      'data-[state=indeterminate]:border-[var(--accent)] data-[state=indeterminate]:bg-[var(--accent)]',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ring)]',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="text-[var(--accent-fg)]">
      {indeterminate ? <Minus className="h-3 w-3" /> : <Check className="h-3 w-3" />}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = 'Checkbox';

export const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'relative h-5 w-9 shrink-0 rounded-full border border-[var(--control-border)] bg-[var(--control-bg)] transition-colors duration-150',
      'data-[state=checked]:border-[var(--accent)] data-[state=checked]:bg-[var(--accent)]',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ring)]',
      'disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-[var(--text-secondary)] transition-transform duration-150 [transition-timing-function:var(--ease-out)] data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-white" />
  </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';

/* ------------------------------------------------------------------ avatar */

export function Avatar({
  name,
  src,
  size = 32,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full border border-[var(--border-subtle)] bg-[var(--surface-sunken)]',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        <AvatarPrimitive.Image src={src} alt="" className="h-full w-full object-cover" />
      ) : null}
      <AvatarPrimitive.Fallback
        className="font-mono font-medium text-[var(--text-tertiary)]"
        style={{ fontSize: Math.max(9, Math.round(size * 0.34)) }}
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

/* -------------------------------------------------------------------- tabs */

export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('flex items-center gap-1 border-b border-[var(--border-subtle)]', className)}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'relative -mb-px border-b-2 border-transparent px-3 py-2 text-[13px] font-medium text-[var(--text-tertiary)] transition-colors',
        'hover:text-[var(--text-primary)]',
        'data-[state=active]:border-[var(--accent)] data-[state=active]:text-[var(--text-primary)]',
        className,
      )}
      {...props}
    />
  );
}

export const TabsContent = TabsPrimitive.Content;
