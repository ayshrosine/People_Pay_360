'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, Plus, Trash2, XCircle } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  Field,
  Input,
  SectionRule,
  Select,
  Switch,
  Textarea,
} from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/data-table';
import { Dialog, DialogContent } from '@/components/ui/overlay';
import { Badge, CategoryChip } from '@/components/ui/status';
import {
  useDeleteSalaryRule,
  useSalaryRules,
  useSalaryStructure,
  useSaveSalaryRule,
  useValidateFormula,
} from '@/hooks/use-resources';
import { useAuth } from '@/lib/auth/auth-provider';
import { cn, formatMoneyPrecise } from '@/lib/utils';
import type { ComputationType, SalaryCategory, SalaryRule } from '@/lib/api/types';

const CATEGORIES: SalaryCategory[] = ['BASIC', 'ALLOWANCE', 'DEDUCTION', 'GROSS', 'NET'];
const COMPUTATION_TYPES: { value: ComputationType; label: string; hint: string }[] = [
  { value: 'FIXED', label: 'Fixed amount', hint: 'A flat figure, e.g. 50000.' },
  { value: 'PERCENTAGE', label: 'Percentage of', hint: 'A share of an earlier rule, e.g. 40% of BASIC.' },
  { value: 'FORMULA', label: 'Formula', hint: 'An expression over earlier rule codes.' },
];

/** The variables every formula can rely on, shown next to the editor. */
const SAMPLE_CONTEXT = { BASIC: 50000, basicWage: 50000, workedDays: 22, totalDays: 30 };

export default function SalaryRulesPage() {
  const params = useParams<{ structureId: string }>();
  const { can } = useAuth();

  const structureId = params.structureId;
  const structure = useSalaryStructure(structureId);
  const rules = useSalaryRules(structureId);
  const remove = useDeleteSalaryRule(structureId);

  const [editing, setEditing] = React.useState<SalaryRule | 'new' | null>(null);

  const canManage = can('update', 'SalaryRule');
  const sorted = [...(rules.data?.data ?? [])].sort((a, b) => a.sequence - b.sequence);

  return (
    <PageShell
      wide
      breadcrumbs={[
        { label: 'Structures', href: '/payroll/structures' },
        { label: structure.data?.name ?? 'Rules' },
      ]}
      title={structure.data?.name ?? 'Salary rules'}
      description="Rules run in sequence order; each result is available to every rule after it."
      actions={
        can('create', 'SalaryRule') ? (
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add rule
          </Button>
        ) : null
      }
    >
      <Card>
        <CardHeader
          title="Rules"
          description={`${sorted.length} rule(s) · executed top to bottom`}
        />
        <DataTable<SalaryRule>
          rows={sorted}
          loading={rules.isLoading}
          rowKey={(row) => row.id}
          onRowClick={canManage ? (row) => setEditing(row) : undefined}
          emptyTitle="No rules in this structure"
          emptyDescription="Without at least one active rule, no payslip can be computed."
          columns={[
            {
              key: 'sequence',
              header: 'Seq',
              width: '56px',
              numeric: true,
              cell: (row) => <span className="text-[var(--text-muted)]">{row.sequence}</span>,
            },
            {
              key: 'name',
              header: 'Name',
              cell: (row) => (
                <span
                  className={cn(
                    'font-medium',
                    row.active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] line-through',
                  )}
                >
                  {row.name}
                </span>
              ),
            },
            {
              key: 'code',
              header: 'Code',
              cell: (row) => <span className="font-mono text-[12px]">{row.code}</span>,
            },
            {
              key: 'category',
              header: 'Category',
              cell: (row) => <CategoryChip category={row.category} />,
            },
            {
              key: 'computation',
              header: 'Computation',
              cell: (row) => <RuleExpression rule={row} />,
            },
            {
              key: 'active',
              header: 'Active',
              cell: (row) => (
                <Badge tone={row.active ? 'success' : 'neutral'}>{row.active ? 'ON' : 'OFF'}</Badge>
              ),
            },
            {
              key: 'actions',
              header: '',
              width: '48px',
              cell: (row) =>
                can('delete', 'SalaryRule') ? (
                  <div className="flex justify-end">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete rule ${row.code}`}
                      className="text-[var(--status-danger)] hover:bg-[var(--status-danger-bg)]"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (window.confirm(`Delete the rule "${row.name}"?`)) remove.mutate(row.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                ) : null,
            },
          ]}
        />
      </Card>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        {editing ? (
          <RuleDialog
            structureId={structureId}
            rule={editing === 'new' ? null : editing}
            existing={sorted}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Dialog>
    </PageShell>
  );
}

/** Renders a rule's computation the way it would read on paper. */
function RuleExpression({ rule }: { rule: SalaryRule }) {
  switch (rule.computationType) {
    case 'FIXED':
      return <span className="ledger-num">{formatMoneyPrecise(rule.amount)}</span>;
    case 'PERCENTAGE':
      return (
        <span className="ledger-num">
          {rule.percentageValue}% of <span className="text-[var(--accent)]">{rule.percentageOf}</span>
        </span>
      );
    default:
      return (
        <code className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-secondary)]">
          {rule.formula}
        </code>
      );
  }
}

function RuleDialog({
  structureId,
  rule,
  existing,
  onDone,
}: {
  structureId: string;
  rule: SalaryRule | null;
  existing: SalaryRule[];
  onDone: () => void;
}) {
  const save = useSaveSalaryRule(structureId);
  const validate = useValidateFormula();

  const nextSequence = existing.length ? Math.max(...existing.map((r) => r.sequence)) + 1 : 1;

  const [name, setName] = React.useState(rule?.name ?? '');
  const [code, setCode] = React.useState(rule?.code ?? '');
  const [category, setCategory] = React.useState<SalaryCategory>(rule?.category ?? 'ALLOWANCE');
  const [sequence, setSequence] = React.useState(String(rule?.sequence ?? nextSequence));
  const [computationType, setComputationType] = React.useState<ComputationType>(
    rule?.computationType ?? 'FIXED',
  );
  const [amount, setAmount] = React.useState(rule?.amount ?? '');
  const [percentageOf, setPercentageOf] = React.useState(rule?.percentageOf ?? 'BASIC');
  const [percentageValue, setPercentageValue] = React.useState(rule?.percentageValue ?? '');
  const [formula, setFormula] = React.useState(rule?.formula ?? '');
  const [condition, setCondition] = React.useState(rule?.condition ?? '');
  const [active, setActive] = React.useState(rule?.active ?? true);

  // The check carries the formula it was produced for, so a result belonging to
  // an older keystroke is simply ignored during render - no effect has to reset
  // it synchronously when the input changes.
  const [check, setCheck] = React.useState<
    { formula: string; valid: boolean; result?: number; error?: string } | null
  >(null);

  const currentCheck = check && check.formula === formula.trim() ? check : null;

  // Codes a formula may reference: earlier rules plus the seeded base context.
  const availableCodes = React.useMemo(() => {
    const earlier = existing
      .filter((entry) => entry.id !== rule?.id && entry.sequence < Number(sequence || 0))
      .map((entry) => entry.code);
    return [...new Set([...Object.keys(SAMPLE_CONTEXT), ...earlier])];
  }, [existing, rule?.id, sequence]);

  /**
   * Live formula validation. Debounced, and dry-run on the server so the
   * author sees the real evaluator's verdict rather than a client guess.
   */
  React.useEffect(() => {
    const expression = formula.trim();
    if (computationType !== 'FORMULA' || !expression) return;

    const timer = window.setTimeout(async () => {
      const context: Record<string, number> = { ...SAMPLE_CONTEXT };
      for (const entry of existing) {
        if (entry.sequence < Number(sequence || 0)) context[entry.code] = 10000;
      }
      const result = await validate
        .mutateAsync({ formula: expression, context })
        .catch(() => null);
      setCheck({
        formula: expression,
        ...(result ?? { valid: false, error: 'Could not reach the validator' }),
      });
    }, 400);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formula, computationType, sequence]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    await save.mutateAsync({
      ...(rule ? { id: rule.id } : {}),
      name: name.trim(),
      code: code.trim().toUpperCase(),
      category,
      sequence: Number(sequence),
      computationType,
      // Send only the fields this computation type actually uses.
      amount: computationType === 'FIXED' ? Number(amount) : undefined,
      percentageOf: computationType === 'PERCENTAGE' ? percentageOf : undefined,
      percentageValue: computationType === 'PERCENTAGE' ? Number(percentageValue) : undefined,
      formula: computationType === 'FORMULA' ? formula.trim() : undefined,
      condition: condition.trim() || undefined,
      active,
    });

    onDone();
  }

  return (
    <DialogContent
      title={rule ? `Edit rule · ${rule.code}` : 'New salary rule'}
      description="Rules execute in sequence order and can reference any earlier rule by its code."
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="ruleName">
            <Input
              id="ruleName"
              required
              placeholder="House Rent Allowance"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          <Field label="Code" htmlFor="ruleCode" hint="Referenced by other rules. Unique per structure.">
            <Input
              id="ruleCode"
              required
              className="font-mono uppercase"
              placeholder="HRA"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_120px_100px]">
          <Field label="Category" htmlFor="ruleCategory">
            <Select
              id="ruleCategory"
              value={category}
              onChange={(event) => setCategory(event.target.value as SalaryCategory)}
            >
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Sequence" htmlFor="ruleSequence">
            <Input
              id="ruleSequence"
              type="number"
              min="1"
              required
              className="ledger-num"
              value={sequence}
              onChange={(event) => setSequence(event.target.value)}
            />
          </Field>

          <Field label="Active" htmlFor="ruleActive">
            <div className="flex h-9 items-center">
              <Switch id="ruleActive" checked={active} onCheckedChange={setActive} />
            </div>
          </Field>
        </div>

        <SectionRule label="Computation" />

        <Field label="Computation type" htmlFor="ruleComputation">
          <Select
            id="ruleComputation"
            value={computationType}
            onChange={(event) => setComputationType(event.target.value as ComputationType)}
          >
            {COMPUTATION_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        {/* Only the inputs this computation type needs are rendered. */}
        {computationType === 'FIXED' ? (
          <Field label="Amount" htmlFor="ruleAmount">
            <Input
              id="ruleAmount"
              type="number"
              step="0.01"
              min="0"
              required
              className="ledger-num"
              value={String(amount)}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
        ) : computationType === 'PERCENTAGE' ? (
          <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
            <Field label="Percentage" htmlFor="rulePercent">
              <Input
                id="rulePercent"
                type="number"
                step="0.01"
                min="0"
                required
                className="ledger-num"
                placeholder="40"
                value={String(percentageValue)}
                onChange={(event) => setPercentageValue(event.target.value)}
              />
            </Field>

            <Field label="Of code" htmlFor="rulePercentOf" hint="Must be computed by an earlier rule.">
              <Select
                id="rulePercentOf"
                value={percentageOf}
                onChange={(event) => setPercentageOf(event.target.value)}
              >
                {availableCodes.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : (
          <Field
            label="Formula"
            htmlFor="ruleFormula"
            hint={`Available: ${availableCodes.join(', ')}`}
          >
            <Textarea
              id="ruleFormula"
              required
              spellCheck={false}
              className="font-mono text-[12px]"
              placeholder="BASIC * (workedDays / totalDays)"
              value={formula}
              onChange={(event) => setFormula(event.target.value)}
            />
          </Field>
        )}

        {computationType === 'FORMULA' && formula.trim() ? (
          <div
            className={cn(
              'flex items-start gap-2 rounded-[var(--radius-ctl)] border px-3 py-2 text-[12px]',
              currentCheck === null
                ? 'border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-[var(--text-muted)]'
                : currentCheck.valid
                  ? 'border-[var(--status-success)] bg-[var(--status-success-bg)] text-[var(--status-success)]'
                  : 'border-[var(--status-danger)] bg-[var(--status-danger-bg)] text-[var(--status-danger)]',
            )}
            aria-live="polite"
          >
            {currentCheck === null ? (
              <span>Checking…</span>
            ) : currentCheck.valid ? (
              <>
                <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  Valid. On the sample context this evaluates to{' '}
                  <span className="ledger-num font-semibold">
                    {formatMoneyPrecise(currentCheck.result)}
                  </span>
                  .
                </span>
              </>
            ) : (
              <>
                <XCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{currentCheck.error}</span>
              </>
            )}
          </div>
        ) : null}

        <Field
          label="Condition"
          htmlFor="ruleCondition"
          hint="Optional guard. The rule is skipped when this evaluates to false, e.g. workedDays >= 20."
        >
          <Input
            id="ruleCondition"
            spellCheck={false}
            className="font-mono text-[12px]"
            value={condition}
            onChange={(event) => setCondition(event.target.value)}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={save.isPending}
            disabled={computationType === 'FORMULA' && currentCheck !== null && !currentCheck.valid}
          >
            Save rule
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
