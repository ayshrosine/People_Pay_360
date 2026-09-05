'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';

/**
 * A crash in one module must not white-screen the rest of the app; each route
 * segment mounts this so the nav and the other modules stay usable.
 */
export function ErrorFallback({
  section,
  error,
  onRetry,
}: {
  section: string;
  error?: Error;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <Card className="p-8 text-center">
        <h2 className="text-[17px] font-semibold text-[var(--text-primary)]">
          Something went wrong in {section}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[var(--text-tertiary)]">
          The rest of the app is still working. Retry this screen, or move to another module from
          the navigation above.
        </p>

        {error?.message ? (
          <pre className="mx-auto mt-4 max-w-md overflow-x-auto rounded-[var(--radius-ctl)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-2 text-left font-mono text-[11px] text-[var(--text-tertiary)]">
            {error.message}
          </pre>
        ) : null}

        <Button variant="primary" className="mt-5" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Try again
        </Button>
      </Card>
    </div>
  );
}
