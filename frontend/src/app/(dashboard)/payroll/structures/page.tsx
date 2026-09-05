'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Accent, PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card, Field, Input, Textarea } from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/data-table';
import { Dialog, DialogContent } from '@/components/ui/overlay';
import { Badge } from '@/components/ui/status';
import { useSalaryStructures, useSaveSalaryStructure } from '@/hooks/use-resources';
import { useAuth } from '@/lib/auth/auth-provider';
import type { SalaryStructure } from '@/lib/api/types';

export default function SalaryStructuresPage() {
  const router = useRouter();
  const { can } = useAuth();
  const structures = useSalaryStructures();
  const [creating, setCreating] = React.useState(false);

  return (
    <PageShell
      eyebrow="PAYROLL RULES"
      title={<>Salary <Accent>structures</Accent></>}
      description="A structure is an ordered set of rules; those rules are what compute every payslip."
      actions={
        can('create', 'SalaryStructure') ? (
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New structure
          </Button>
        ) : null
      }
    >
      <Card>
        <DataTable<SalaryStructure>
          rows={structures.data?.data}
          loading={structures.isLoading}
          rowKey={(row) => row.id}
          onRowClick={(row) => router.push(`/payroll/rules/${row.id}`)}
          emptyTitle="No salary structures yet"
          emptyDescription="A payrun cannot be created without one."
          columns={[
            {
              key: 'name',
              header: 'Name',
              cell: (row) => (
                <span className="font-medium text-[var(--text-primary)]">{row.name}</span>
              ),
            },
            {
              key: 'description',
              header: 'Description',
              cell: (row) => (
                <span className="line-clamp-1 text-[var(--text-tertiary)]">
                  {row.description ?? '—'}
                </span>
              ),
            },
            {
              key: 'rules',
              header: 'Rules',
              numeric: true,
              cell: (row) => row.rules?.length ?? row._count?.rules ?? 0,
            },
            {
              key: 'active',
              header: 'Status',
              cell: (row) => (
                <Badge tone={row.isActive ? 'success' : 'neutral'}>
                  {row.isActive ? 'ACTIVE' : 'INACTIVE'}
                </Badge>
              ),
            },
          ]}
        />
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        {creating ? <StructureDialog onDone={() => setCreating(false)} /> : null}
      </Dialog>
    </PageShell>
  );
}

function StructureDialog({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const save = useSaveSalaryStructure();

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const structure = await save.mutateAsync({
      name: name.trim(),
      description: description.trim() || undefined,
      isActive: true,
    });
    onDone();
    // A structure with no rules is useless; go straight to the rule editor.
    if (structure?.id) router.push(`/payroll/rules/${structure.id}`);
  }

  return (
    <DialogContent
      title="New salary structure"
      description="You will add the rules that compute pay in the next step."
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4 p-5">
        <Field label="Name" htmlFor="structureName">
          <Input
            id="structureName"
            required
            placeholder="Standard Salary Structure"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field label="Description" htmlFor="structureDescription">
          <Textarea
            id="structureDescription"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            Create and add rules
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
