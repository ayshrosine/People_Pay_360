'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const button = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium',
    'rounded-[var(--radius-ctl)] border select-none',
    'transition-[background-color,border-color,color,transform] duration-150',
    '[transition-timing-function:var(--ease-out)]',
    // Tactile confirmation that the click was heard.
    'active:scale-[0.97]',
    'disabled:pointer-events-none disabled:opacity-45',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-ring)]',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--accent)] border-transparent text-[var(--accent-fg)] hover:bg-[var(--accent-hover)]',
        secondary:
          'bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] hover:border-[var(--border-strong)]',
        ghost:
          'bg-transparent border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
        danger:
          'bg-transparent border-[var(--border-default)] text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)] hover:border-[var(--status-danger)]',
        link: 'bg-transparent border-transparent text-[var(--accent)] hover:underline underline-offset-4 active:scale-100',
      },
      size: {
        // 40px keeps the hit area at the accessible minimum without bulk.
        md: 'h-9 px-3.5 text-[13px]',
        sm: 'h-8 px-3 text-[12px]',
        lg: 'h-10 px-4 text-sm',
        icon: 'h-9 w-9 p-0',
        'icon-sm': 'h-8 w-8 p-0',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        ref={ref}
        className={cn(button({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';
