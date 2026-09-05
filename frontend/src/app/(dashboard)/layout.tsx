'use client';

import { Loader2 } from 'lucide-react';
import { Sidebar, MobileNav } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { AttendanceWidget } from '@/components/attendance/attendance-widget';
import { useAuth } from '@/lib/auth/auth-provider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, authenticated } = useAuth();

  // The provider redirects unauthenticated visitors; this only keeps the shell
  // from flashing a half-built page while that decision is still pending.
  if (loading || !authenticated) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[var(--surface-canvas)]">
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-tertiary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading your workspace
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--surface-canvas)]">
      <Sidebar />
      {/* The rail is fixed, so the content column is inset by its width. */}
      <div className="lg:pl-[248px]">
        <Topbar />
        <main className="pb-20 lg:pb-0">{children}</main>
      </div>
      <MobileNav />
      <AttendanceWidget />
    </div>
  );
}
