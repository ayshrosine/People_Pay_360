'use client';

import * as React from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, SectionRule } from '@/components/ui/primitives';
import { useAuth } from '@/lib/auth/auth-provider';
import { normaliseError } from '@/lib/api/client';

export default function LoginPage() {
  const { login } = useAuth();

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

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
    <main className="grid min-h-dvh place-items-center bg-[var(--surface-canvas)] px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-7 flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-[7px] bg-[var(--accent)]">
            <span className="font-mono text-[13px] font-bold text-white">P</span>
          </div>
          <div>
            <p className="text-[15px] font-semibold leading-tight tracking-[-0.02em]">
              PeoplePay360
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
              HR Portal
            </p>
          </div>
        </div>

        <div className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-6">
          <h1 className="text-[19px] font-semibold tracking-[-0.02em]">Welcome back</h1>
          <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">
            Sign in to continue to your workspace.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
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
                className="flex items-start gap-2 rounded-[var(--radius-ctl)] border border-[var(--status-danger)] bg-[var(--status-danger-bg)] px-3 py-2 text-[12px] text-[var(--status-danger)]"
              >
                <KeyRound className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{formError}</span>
              </div>
            ) : null}

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                className="text-[12px] text-[var(--text-tertiary)] underline-offset-4 hover:text-[var(--text-primary)] hover:underline"
                onClick={() =>
                  setFormError('Password resets are handled by your administrator.')
                }
              >
                Forgot password?
              </button>
            </div>

            <Button type="submit" variant="primary" size="lg" className="w-full" loading={submitting}>
              {submitting ? 'Signing in' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-6">
            <SectionRule />
          </div>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-[var(--text-muted)]">
            Accounts are created by an administrator. Contact your HR team if you need access.
          </p>
        </div>
      </div>
    </main>
  );
}
