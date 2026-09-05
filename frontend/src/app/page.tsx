'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';

export default function RootPage() {
  const router = useRouter();
  const { accessToken, hydrated } = useAuthStore();

  useEffect(() => {
    if (!hydrated) return;

    if (accessToken) {
      router.replace('/dashboard');
    }
  }, [accessToken, hydrated, router]);

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground mb-4">PeoplePay360</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-background/80">
      <nav className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-white font-bold">P</span>
            </div>
            <span className="font-semibold text-foreground">PeoplePay360</span>
          </div>
          <Button onClick={() => router.push('/login')} className="gap-2">
            Sign In
          </Button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className="text-5xl font-bold text-foreground mb-6 leading-tight">
              HR & Payroll Management Made Simple
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Streamline your entire HR and payroll operations with PeoplePay360. From employee management to complex payroll computations, everything you need in one powerful platform.
            </p>
            <div className="flex gap-4">
              <Button size="lg" onClick={() => router.push('/login')}>
                Get Started
              </Button>
              <Button size="lg" variant="secondary">
                Learn More
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="text-3xl font-bold text-primary mb-2">100+</div>
              <p className="text-sm text-muted-foreground">Global Companies</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="text-3xl font-bold text-primary mb-2">50k+</div>
              <p className="text-sm text-muted-foreground">Active Employees</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="text-3xl font-bold text-primary mb-2">24/7</div>
              <p className="text-sm text-muted-foreground">Support Available</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="text-3xl font-bold text-primary mb-2">99.9%</div>
              <p className="text-sm text-muted-foreground">Uptime SLA</p>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mt-20">
          <div className="bg-card border border-border rounded-lg p-8">
            <div className="text-2xl mb-4">👥</div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Employee Management</h3>
            <p className="text-sm text-muted-foreground">Complete employee lifecycle from onboarding to offboarding with comprehensive profiles and document management.</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-8">
            <div className="text-2xl mb-4">💰</div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Smart Payroll</h3>
            <p className="text-sm text-muted-foreground">Flexible rule engine for complex salary structures, automatic calculations, and compliance with local regulations.</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-8">
            <div className="text-2xl mb-4">📊</div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Analytics & Reports</h3>
            <p className="text-sm text-muted-foreground">Real-time dashboards, attendance tracking, payroll insights, and customizable reports for data-driven decisions.</p>
          </div>
        </div>
      </main>

      <footer className="border-t border-border/40 mt-20 py-8 text-center text-sm text-muted-foreground">
        <p>&copy; 2026 PeoplePay360. All rights reserved.</p>
      </footer>
    </div>
  );
}
