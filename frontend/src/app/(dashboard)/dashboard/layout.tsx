'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-provider';
import { homeRouteFor } from '@/lib/abilities';

/**
 * The payroll dashboard is an HR view. A self-service employee reaching it
 * directly (a bookmark, a shared link) is sent to their own home rather than
 * shown a page of widgets their role is forbidden to load.
 */
export default function DashboardSectionLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { loading, role, can } = useAuth();
  const allowed = can('read', 'Dashboard');

  React.useEffect(() => {
    if (!loading && role && !allowed) {
      router.replace(homeRouteFor(role));
    }
  }, [loading, role, allowed, router]);

  if (!loading && role && !allowed) return null;

  return <>{children}</>;
}
