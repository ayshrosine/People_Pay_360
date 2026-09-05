'use client';

import { useEffect } from 'react';
import { ErrorFallback } from '@/components/ui/error-fallback';

export default function SegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Reported with a section tag so an error in one module is immediately
    // attributable when reviewing incidents.
    console.error('[contracts]', error);
  }, [error]);

  return <ErrorFallback section="contracts" error={error} onRetry={reset} />;
}
