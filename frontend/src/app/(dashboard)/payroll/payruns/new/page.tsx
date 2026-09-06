'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, Checkbox, Field, Input, SectionRule, Select } from '@/components/ui/primitives';
import { EmptyState, Skeleton } from '@/components/ui/data-table';
import {
  useCreatePayrun,
  usePreviewScope,
  useSalaryStructures,
} from '@/hooks/use-resources';
import { normaliseError } from '@/lib/api/client';
import { cn, formatDate, formatMoney, monthBounds } from '@/lib/utils';
import type { ExcludedCandidate, ScopeCandidate } from '@/lib/api/types';

const EMPLOYEE_TYPES = ['Full-time', 'Part-time', 'Contract', 'Intern'];

/**
 * Payrun creation in two explicit steps.
 *
 * Step 1 only describes the scope. Nothing is written until "Create payrun" is
 * clicked on step 2 — the preview call is deliberately read-only, so backing
 * out of the wizard leaves no half-made payrun behind.
 */
export default function NewPayrunPage() {
  const router = useRouter();
  const bounds = React.useMemo(() => monthBounds(), []);

  const structures = useSalaryStructures();
  const preview = usePreviewScope();
  const create = useCreatePayrun();

  const [step, setStep] = React.useState<1 | 2>(1);
  const [typedName, setTypedName] = React.useState('');
  const [salaryStructureId, setSalaryStructureId] = React.useState('');

  // Default to the only sensible choice rather than starting on a blank select
  // that silently disables Continue. Deriving during render (rather than
  // syncing in an effect) means the default appears the moment the list loads
  // and never fights a choice the user has already made.
  const activeStructures = React.useMemo(
    () => (structures.data?.data ?? []).filter((structure) => structure.isActive),
    [structures.data],
  );
  const chosenStructureId =
    salaryStructureId || (activeStructures.length > 0 ? activeStructures[0].id : '');
  const [periodStart, setPeriodStart] = React.useState(bounds.start);
  const [periodEnd, setPeriodEnd] = React.useState(bounds.end);
  const [employeeType, setEmployeeType] = React.useState('');

  const [candidates, setCandidates] = React.useState<ScopeCandidate[]>([]);
  const [excluded, setExcluded] = React.useState<ExcludedCandidate[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [banner, setBanner] = React.useState<string | null>(null);

  /**
   * The name follows the period until the user types one of their own. Derived
   * during render rather than written back by an effect, so there is no moment
   * where the field shows a stale month.
   */
  const [nameTouched, setNameTouched] = React.useState(false);
  const derivedName = React.useMemo(() => {
    const date = new Date(periodStart);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }, [periodStart]);

  const name = nameTouched ? typedName : derivedName;

  async function goToStep2(event: React.FormEvent) {
    event.preventDefault();
    setBanner(null);

    try {
      const result = await preview.mutateAsync({
        salaryStructureId: chosenStructureId,
        periodStart,
        periodEnd,
        employeeType: employeeType || undefined,
      });

      setCandidates(result.candidates);
      setExcluded(result.excluded);
      setSelected(new Set(result.candidates.map((candidate) => candidate.id)));
      setStep(2);
    } catch (error) {
      setBanner(normaliseError(error).message);
    }
  }

  async function handleCreate() {
    setBanner(null);
    try {
      const payrun = await create.mutateAsync({
        name: name.trim(),
        salaryStructureId: chosenStructureId,
        periodStart,
        periodEnd,
        employeeType: employeeType || undefined,
        employeeIds: [...selected],
      });
      router.replace(`/payroll/payruns/${payrun.id}`);
    } catch (error) {
      const normalised = normaliseError(error);
      setBanner(
        normalised.code === 'EMPTY_SALARY_STRUCTURE'
          ? 'That salary structure has no active rules, so no payslip could be computed. Add rules first.'
          : normalised.message,
      );
    }
  }

  const allSelected = candidates.length > 0 && selected.size === candidates.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(candidates.map((candidate) => candidate.id)));
  }

  function toggleOne(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const mismatched = candidates.filter(
    (candidate) =>
      candidate.contractSalaryStructureId &&
      candidate.contractSalaryStructureId !== chosenStructureId &&
      selected.has(candidate.id),
  );

  return (
    <PageShell
      breadcrumbs={[{ label: 'Payruns', href: '/payroll/payruns' }, { label: 'New' }]}
      title="New payrun"
      description="Nothing is created until you confirm the employee selection."
    >
      <Stepper step={step} />

      {banner ? (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-[var(--radius-card)] border border-[var(--status-danger)] bg-[var(--status-danger-bg)] px-3 py-2.5 text-[12px] text-[var(--status-danger)]"
        >
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{banner}</span>
        </div>
      ) : null}

      {step === 1 ? (
        <Card className="mt-4 max-w-2xl">
          <form onSubmit={goToStep2} className="space-y-4 p-5">
            <Field label="Payrun name" htmlFor="payrunName">
              <Input
                id="payrunName"
                required
                value={name}
                onChange={(event) => {
                  setNameTouched(true);
                  setTypedName(event.target.value);
                }}
              />
            </Field>

            <Field
              label="Salary structure"
              htmlFor="structure"
              hint="Its rules are what actually compute every payslip in this run."
            >
              <Select
                id="structure"
                required
                value={chosenStructureId}
                onChange={(event) => setSalaryStructureId(event.target.value)}
              >
                {activeStructures.length === 0 ? (
                  <option value="">No active salary structure</option>
                ) : null}
                {activeStructures.map((structure) => (
                  <option key={structure.id} value={structure.id}>
                    {structure.name}
                  </option>
                ))}
              </Select>
            </Field>

            <SectionRule label="Period" />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Period start" htmlFor="periodStart">
                <Input
                  id="periodStart"
                  type="date"
                  required
                  value={periodStart}
                  onChange={(event) => setPeriodStart(event.target.value)}
                />
              </Field>

              <Field label="Period end" htmlFor="periodEnd">
                <Input
                  id="periodEnd"
                  type="date"
                  required
                  min={periodStart}
                  value={periodEnd}
                  onChange={(event) => setPeriodEnd(event.target.value)}
                />
              </Field>
            </div>

            <Field
              label="Employee type"
              htmlFor="employeeType"
              hint="Optional. Narrows which employees are eligible for this run."
            >
              <Select
                id="employeeType"
                value={employeeType}
                onChange={(event) => setEmployeeType(event.target.value)}
              >
                <option value="">All types</option>
                {EMPLOYEE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => router.push('/payroll/payruns')}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={preview.isPending}
                disabled={!chosenStructureId || !name.trim()}
                // A greyed-out button with no explanation is the single most
                // common way a form dead-ends.
                title={
                  !chosenStructureId
                    ? 'Create an active salary structure first — its rules are what compute the payslips.'
                    : !name.trim()
                      ? 'Give this payrun a name.'
                      : undefined
                }
              >
                Continue
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
            <div>
              <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">
                Select employee records
              </h2>
              <p className="mt-0.5 text-[12px] text-[var(--text-tertiary)]">
                Eligible employees with a running contract covering{' '}
                {formatDate(periodStart)} → {formatDate(periodEnd)}
              </p>
            </div>
            <span className="ledger-num rounded bg-[var(--surface-sunken)] px-2 py-1 text-[12px] text-[var(--text-secondary)]">
              {selected.size} / {candidates.length}
            </span>
          </div>

          {/* Somebody missing from this list is a question the operator will ask,
              so answer it before they have to. */}
          {excluded.length > 0 && !preview.isPending ? (
            <div className="border-b border-[var(--border-subtle)] bg-[var(--status-info-bg)] px-4 py-3">
              <p className="text-[12.5px] font-medium text-[var(--status-info)]">
                {excluded.length} employee{excluded.length === 1 ? '' : 's'} left out — already paid
                for this period
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {excluded.slice(0, 6).map((entry) => (
                  <li key={entry.id} className="text-[12px] text-[var(--text-tertiary)]">
                    <span className="text-[var(--text-secondary)]">{entry.name}</span>{' '}
                    — {entry.excludedMessage}
                  </li>
                ))}
                {excluded.length > 6 ? (
                  <li className="text-[12px] text-[var(--text-muted)]">
                    and {excluded.length - 6} more
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {preview.isPending ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-9" />
              ))}
            </div>
          ) : candidates.length === 0 ? (
            <div className="py-14">
              <EmptyState
                title={excluded.length > 0 ? 'Everyone is already paid for this period' : 'No eligible employees'}
                description={
                  excluded.length > 0
                    ? 'Every employee with a running contract already has a payslip covering these dates. Choose a different period.'
                    : 'Nobody has a RUNNING contract covering this period. Check the contracts module, then try again.'
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border-default)]">
                    <th scope="col" className="w-10 px-3 py-2">
                      <Checkbox
                        checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                        indeterminate={someSelected}
                        onCheckedChange={toggleAll}
                        aria-label="Select all employees"
                      />
                    </th>
                    {['Employee', 'Department', 'Working hours', 'Contract start', 'Wage'].map(
                      (heading, index) => (
                        <th
                          key={heading}
                          scope="col"
                          className={cn(
                            'px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]',
                            index === 4 ? 'text-right' : 'text-left',
                          )}
                        >
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>

                <tbody>
                  {candidates.map((candidate) => {
                    const checked = selected.has(candidate.id);
                    return (
                      <tr
                        key={candidate.id}
                        onClick={() => toggleOne(candidate.id)}
                        className={cn(
                          'cursor-pointer border-b border-[var(--border-subtle)] transition-colors',
                          checked ? 'bg-[var(--accent-subtle)]/40' : 'hover:bg-[var(--surface-hover)]',
                        )}
                      >
                        <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleOne(candidate.id)}
                            aria-label={`Include ${candidate.name}`}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="font-medium text-[var(--text-primary)]">
                            {candidate.name}
                          </span>
                          <span className="ml-2 text-[11px] text-[var(--text-muted)]">
                            {candidate.jobPosition ?? ''}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                          {candidate.department ?? '—'}
                        </td>
                        <td className="ledger-num px-3 py-2.5 text-[var(--text-secondary)]">
                          {candidate.workingHours ? `${candidate.workingHours}h/week` : '—'}
                        </td>
                        <td className="ledger-num px-3 py-2.5 text-[var(--text-secondary)]">
                          {candidate.startDate ? formatDate(candidate.startDate) : '—'}
                        </td>
                        <td className="ledger-num px-3 py-2.5 text-right font-medium text-[var(--text-primary)]">
                          {formatMoney(candidate.wage)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {mismatched.length > 0 ? (
            <p className="flex items-start gap-2 border-t border-[var(--border-subtle)] bg-[var(--status-warning-bg)] px-4 py-2.5 text-[12px] text-[var(--status-warning)]">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                {mismatched.length} selected employee(s) have a different salary structure on their
                contract. This payrun will use the structure you chose in step&nbsp;1 for everyone.
              </span>
            </p>
          ) : null}

          <div className="flex justify-between gap-2 border-t border-[var(--border-subtle)] p-4">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Back
            </Button>
            <Button
              variant="primary"
              loading={create.isPending}
              disabled={selected.size === 0}
              onClick={handleCreate}
            >
              <Check className="h-3.5 w-3.5" aria-hidden />
              Create payrun ({selected.size})
            </Button>
          </div>
        </Card>
      )}
    </PageShell>
  );
}

function Stepper({ step }: { step: 1 | 2 }) {
  const steps = [
    { number: 1, label: 'Scope', hint: 'Structure and period' },
    { number: 2, label: 'Employees', hint: 'Who is included' },
  ];

  return (
    <ol className="flex items-center gap-3">
      {steps.map((entry, index) => {
        const active = step === entry.number;
        const done = step > entry.number;

        return (
          <React.Fragment key={entry.number}>
            <li className="flex items-center gap-2.5">
              <span
                className={cn(
                  'grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold transition-colors',
                  done
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                    : active
                      ? 'border-[var(--accent)] text-[var(--accent)]'
                      : 'border-[var(--border-default)] text-[var(--text-muted)]',
                )}
              >
                {done ? <Check className="h-3 w-3" aria-hidden /> : entry.number}
              </span>
              <span>
                <span
                  className={cn(
                    'block text-[13px] font-medium',
                    active || done ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]',
                  )}
                >
                  {entry.label}
                </span>
                <span className="block text-[11px] text-[var(--text-muted)]">{entry.hint}</span>
              </span>
            </li>
            {index === 0 ? <div className="rule-dashed w-16 flex-1 sm:flex-none" /> : null}
          </React.Fragment>
        );
      })}
    </ol>
  );
}
