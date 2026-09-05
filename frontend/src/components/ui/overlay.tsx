'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Overlays are the one place this product uses shadow rather than a border:
 * they genuinely float above the page, and a ring alone would not say so.
 *
 * Nothing appears from nothing - entrances start at scale(0.97), and popovers
 * grow from their trigger rather than from their own centre.
 */

const overlayBackdrop =
  'fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0';

const panelMotion =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-[0.97] data-[state=closed]:zoom-out-[0.97] duration-200';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  size = 'md',
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const widths = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  } as const;

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayBackdrop} />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col',
          'rounded-[var(--radius-overlay)] border border-[var(--border-default)] bg-[var(--surface-raised)]',
          'shadow-[var(--shadow-overlay)]',
          panelMotion,
          widths[size],
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-5 py-3.5">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-[15px] font-semibold text-[var(--text-primary)]">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-0.5 text-[12px] text-[var(--text-tertiary)]">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close
            aria-label="Close"
            className="-m-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-ctl)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** A right-edge drawer for record detail and inline correction forms. */
export function SheetContent({
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  title: string;
  description?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayBackdrop} />
      <DialogPrimitive.Content
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-[var(--border-default)] bg-[var(--surface-raised)]',
          'shadow-[var(--shadow-overlay)]',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right duration-[250ms]',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-5 py-3.5">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-[14px] font-semibold text-[var(--text-primary)]">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-0.5 text-[12px] text-[var(--text-tertiary)]">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close
            aria-label="Close"
            className="-m-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-ctl)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        sideOffset={6}
        className={cn(
          'z-50 min-w-44 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-raised)] p-1',
          'shadow-[var(--shadow-overlay)]',
          // Grows from the trigger, not from its own centre.
          'origin-[var(--radix-dropdown-menu-content-transform-origin)]',
          panelMotion,
          className,
        )}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item>) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2.5 py-1.5 text-[13px] text-[var(--text-secondary)] outline-none transition-colors',
        'data-[highlighted]:bg-[var(--surface-hover)] data-[highlighted]:text-[var(--text-primary)]',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator() {
  return <DropdownPrimitive.Separator className="my-1 h-px bg-[var(--border-subtle)]" />;
}

export function DropdownMenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <DropdownPrimitive.Label className="px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
      {children}
    </DropdownPrimitive.Label>
  );
}

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={8}
        className={cn(
          'z-50 rounded-[var(--radius-card)] border border-[var(--border-default)] bg-[var(--surface-raised)] p-3',
          'shadow-[var(--shadow-overlay)]',
          'origin-[var(--radix-popover-content-transform-origin)]',
          panelMotion,
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <TooltipPrimitive.Root delayDuration={200}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            'z-50 max-w-64 rounded-[6px] border border-[var(--border-default)] bg-[var(--surface-raised)] px-2 py-1 text-[11px] text-[var(--text-secondary)]',
            'shadow-[var(--shadow-overlay)]',
            panelMotion,
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
