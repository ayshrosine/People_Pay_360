'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

export default function RootPage() {
  const router = useRouter();
  const { accessToken } = useAuthStore();

  useEffect(() => {
    // If authenticated, redirect to dashboard
    if (accessToken) {
      router.replace('/dashboard');
    } else {
      // If not authenticated, redirect to login
      router.replace('/login');
    }
  }, [accessToken, router]);

  // Show a brief loading state while redirecting
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-foreground mb-4">PeoplePay360</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
