'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/overlay';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { useUiStore } from '@/stores/ui-store';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // A 401 is handled by the client's refresh interceptor; a 403/404 will
        // never succeed on retry, so only retry genuine transport failures.
        retry: (failureCount, error) => {
          const status = (error as { response?: { status?: number } })?.response?.status;
          if (status && status >= 400 && status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

/** Applies the stored theme to <html> so the token blocks switch together. */
function ThemeSync() {
  const theme = useUiStore((state) => state.theme);

  React.useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }, [theme]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <ThemeSync />
        <AuthProvider>{children}</AuthProvider>
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: 'var(--surface-raised)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              borderRadius: 'var(--radius-card)',
            },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
