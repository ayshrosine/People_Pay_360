'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { Accent, PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, Field, Input, Select, Switch } from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/data-table';
import { Dialog, DialogContent } from '@/components/ui/overlay';
import { Badge } from '@/components/ui/status';
import { useSaveTimeOffType, useTimeOffTypes } from '@/hooks/use-resources';
import { useAuth } from '@/lib/auth/auth-provider';
import type { TimeOffType } from '@/lib/api/types';

const SWATCHES = ['#6366F1', '#22D3EE', '#22C55E', '#F59E0B', '#EF4444', '#A855F7', '#64748B'];

export default function TimeOffTypesPage() {
  const { can } = useAuth();
  const types = useTimeOffTypes();
  const [editing, setEditing] = React.useState<TimeOffType | 'new' | null>(null);

  const canManage = can('update', 'TimeOffType');

  return (
    <PageShell
      eyebrow="TIME & ATTENDANCE"
      title={<>Leave <Accent>types</Accent></>}
      description="Each type decides whether leave needs an allocation, an approval, and whether it reduces pay."
      actions={
        can('create', 'TimeOffType') ? (
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New type
          </Button>
        ) : null
      }
    >
      <Card>
        <DataTable<TimeOffType>
          rows={types.data?.data}
          loading={types.isLoading}
          rowKey={(row) => row.id}
          onRowClick={canManage ? (row) => setEditing(row) : undefined}
          emptyTitle="No time off types yet"
          emptyDescription="Create at least one type before employees can request leave."
          columns={[
            {
              key: 'name',
              header: 'Name',
              cell: (row) => (
                <span className="inline-flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: row.colorHex }}
                    aria-hidden
                  />
                  <span className="font-medium text-[var(--text-primary)]">{row.name}</span>
                </span>
              ),
            },
            { key: 'unit', header: 'Unit', cell: (row) => (row.unit === 'HOURS' ? 'Hours' : 'Days') },
            {
              key: 'allocation',
              header: 'Requires allocation',
              cell: (row) => <YesNo value={row.requiresAllocation} />,
            },
            {
              key: 'approval',
              header: 'Requires approval',
              cell: (row) => <YesNo value={row.requiresApproval} />,
            },
            {
              key: 'payroll',
              header: 'Affects payroll',
              cell: (row) => (
                <span className="inline-flex items-center gap-2">
                  <YesNo value={row.affectsPayroll} />
                  {row.affectsPayroll ? null : (
                    <span className="text-[11px] text-[var(--text-muted)]">counts as worked</span>
                  )}
                </span>
              ),
            },
          ]}
        />
      </Card>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        {editing ? (
          <TypeDialog
            record={editing === 'new' ? null : editing}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Dialog>
    </PageShell>
  );
}

function YesNo({ value }: { value: boolean }) {
  return <Badge tone={value ? 'success' : 'neutral'}>{value ? 'YES' : 'NO'}</Badge>;
}

function TypeDialog({ record, onDone }: { record: TimeOffType | null; onDone: () => void }) {
  const save = useSaveTimeOffType();

  const [name, setName] = React.useState(record?.name ?? '');
  const [unit, setUnit] = React.useState(record?.unit ?? 'DAYS');
  const [requiresAllocation, setRequiresAllocation] = React.useState(
    record?.requiresAllocation ?? true,
  );
  const [requiresApproval, setRequiresApproval] = React.useState(record?.requiresApproval ?? true);
  const [affectsPayroll, setAffectsPayroll] = React.useState(record?.affectsPayroll ?? true);
  const [colorHex, setColorHex] = React.useState(record?.colorHex ?? SWATCHES[0]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await save.mutateAsync({
      ...(record ? { id: record.id } : {}),
      name: name.trim(),
      unit,
      requiresAllocation,
      requiresApproval,
      affectsPayroll,
      colorHex,
    });
    onDone();
  }

  return (
    <DialogContent
      title={record ? 'Edit time off type' : 'New time off type'}
      description="The colour is used for this type's chip everywhere in the app."
    >
      <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto p-5">
        <Field label="Name" htmlFor="typeName">
          <Input
            id="typeName"
            required
            placeholder="Paid Time Off"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field label="Unit" htmlFor="typeUnit">
          <Select
            id="typeUnit"
            value={unit}
            onChange={(event) => setUnit(event.target.value as TimeOffType['unit'])}
          >
            <option value="DAYS">Days</option>
            <option value="HOURS">Hours</option>
          </Select>
        </Field>

        <fieldset className="space-y-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] p-3">
          <legend className="px-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Behaviour
          </legend>

          <ToggleRow
            label="Requires allocation"
            description="Employees must have a balance before requesting."
            checked={requiresAllocation}
            onChange={setRequiresAllocation}
          />
          <ToggleRow
            label="Requires approval"
            description="Requests start as To Approve rather than auto-approved."
            checked={requiresApproval}
            onChange={setRequiresApproval}
          />
          <ToggleRow
            label="Affects payroll"
            description="When off, approved leave still counts as worked days."
            checked={affectsPayroll}
            onChange={setAffectsPayroll}
          />
        </fieldset>

        <Field label="Chip colour" htmlFor="typeColour">
          <div className="flex flex-wrap items-center gap-2">
            {SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={`Use colour ${swatch}`}
                aria-pressed={colorHex.toLowerCase() === swatch.toLowerCase()}
                onClick={() => setColorHex(swatch)}
                className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  background: swatch,
                  borderColor:
                    colorHex.toLowerCase() === swatch.toLowerCase()
                      ? 'var(--text-primary)'
                      : 'transparent',
                }}
              />
            ))}
            <Input
              id="typeColour"
              className="ml-1 w-28 font-mono uppercase"
              value={colorHex}
              onChange={(event) => setColorHex(event.target.value)}
            />
          </div>
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            Save type
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = React.useId();

  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-[13px] font-medium text-[var(--text-primary)]">{label}</span>
        <span className="block text-[11px] leading-relaxed text-[var(--text-tertiary)]">
          {description}
        </span>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
