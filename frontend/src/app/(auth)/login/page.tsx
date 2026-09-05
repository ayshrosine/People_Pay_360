'use client';

import * as React from 'react';
import { ArrowRight, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/primitives';
import { LatticeBackground } from '@/components/layout/lattice-background';
import { useAuth } from '@/lib/auth/auth-provider';
import { normaliseError } from '@/lib/api/client';

/** Seeded logins, shown only outside production so a reviewer can get in. */
const DEMO_ACCOUNTS = [
  { label: 'Administrator', email: 'admin@peoplepay360.com' },
  { label: 'HR Payroll', email: 'hrpayroll@peoplepay360.com' },
  { label: 'Employee', email: 'john.doe@peoplepay360.com' },
];

export default function LoginPage() {
  const { login } = useAuth();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const showDemo = process.env.NODE_ENV !== 'production';

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      await login(email.trim(), password);
    } catch (error) {
      const normalised = normaliseError(error);
      setFieldErrors(normalised.fieldErrors);

      // The API distinguishes a bad password from a validation failure; say
      // which, instead of one generic "login failed".
      setFormError(
        normalised.code === 'INVALID_CREDENTIALS'
          ? 'That email and password combination is not recognised.'
          : normalised.message,
      );
      setSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[var(--surface-canvas)] px-4 py-6">
      <LatticeBackground />

      <div className="relative flex items-center gap-2.5">
        <div className="grid h-8 w-8 place-items-center rounded-[7px] bg-[var(--accent)]">
          <span className="font-mono text-[13px] font-bold text-white">P</span>
        </div>
        <p className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
          PeoplePay360
        </p>
      </div>

      <div className="relative grid place-items-center px-1 py-10 sm:py-16">
        {/* Translucent over the lattice, so the grid reads through the card
            edges without ever competing with the form. */}
        <div className="w-full max-w-[440px] rounded-[var(--radius-overlay)] border border-[var(--border-default)] bg-[var(--surface-base)]/85 p-7 shadow-[var(--shadow-overlay)] backdrop-blur-xl sm:p-9">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
            HR &amp; Payroll · v1.0
          </p>

          <h1 className="mt-4 text-[30px] font-bold leading-[1.1] tracking-[-0.03em] text-[var(--text-primary)]">
            Sign in to PeoplePay360
          </h1>
          <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--text-tertiary)]">
            Employees, contracts, attendance and payroll — one workspace.
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
            <Field label="Work email" htmlFor="email" error={fieldErrors.email}>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                autoFocus
                required
                placeholder="you@company.com"
                value={email}
                invalid={Boolean(fieldErrors.email)}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>

            <Field label="Password" htmlFor="password" error={fieldErrors.password}>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                value={password}
                invalid={Boolean(fieldErrors.password)}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>

            {formError ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-[var(--radius-control)] border border-[var(--status-danger)] bg-[var(--status-danger-bg)] px-3 py-2 text-[12px] text-[var(--status-danger)]"
              >
                <KeyRound className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{formError}</span>
              </div>
            ) : null}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              loading={submitting}
            >
              {submitting ? 'Signing in' : 'Continue'}
              {submitting ? null : <ArrowRight className="h-4 w-4" aria-hidden />}
            </Button>

            <div className="flex justify-center">
              <button
                type="button"
                className="text-[12px] text-[var(--text-tertiary)] underline-offset-4 hover:text-[var(--text-primary)] hover:underline"
                onClick={() => setFormError('Password resets are handled by your administrator.')}
              >
                Forgot password?
              </button>
            </div>
          </form>

          {showDemo ? (
            <div className="mt-7 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                Demo accounts · password123
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => {
                      setEmail(account.email);
                      setPassword('password123');
                    }}
                    className="rounded-[var(--radius-control)] border border-[var(--border-default)] px-2 py-1 font-mono text-[10.5px] text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                  >
                    {account.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <p className="mt-5 text-center text-[11px] leading-relaxed text-[var(--text-muted)]">
            Accounts are created by an administrator. Contact your HR team if you need access.
          </p>
        </div>
      </div>
    </main>
  );
}
