'use client';

import * as React from 'react';
import { Info, Plus } from 'lucide-react';
import { PageShell, Toolbar } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Avatar, Card, Field, Input, Select, Switch } from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/data-table';
import { Dialog, DialogContent } from '@/components/ui/overlay';
import { Badge } from '@/components/ui/status';
import {
  useCreateUser,
  useEmployees,
  useUpdateUser,
  useUsers,
} from '@/hooks/use-resources';
import { ROLE_LABELS } from '@/lib/abilities';
import { normaliseError } from '@/lib/api/client';
import { formatDate } from '@/lib/utils';
import type { AppUser, RoleName } from '@/lib/api/types';

const ROLES: RoleName[] = [
  'EMPLOYEE',
  'HR_MANAGER',
  'HR_PAYROLL_USER',
  'HR_PAYROLL_MANAGER',
  'ADMIN',
];

const ROLE_SUMMARY: Record<RoleName, string> = {
  EMPLOYEE: 'Sees only their own attendance, leave and payslips.',
  HR_MANAGER: 'Full access to people data. No payroll access.',
  HR_PAYROLL_USER: 'People data, plus running payruns. Salary rules are read-only.',
  HR_PAYROLL_MANAGER: 'Everything above, plus editing salary structures and rules.',
  ADMIN: 'Unrestricted, including user management.',
};

export default function UsersPage() {
  const [roleFilter, setRoleFilter] = React.useState('');
  const [creating, setCreating] = React.useState(false);

  const users = useUsers({ role: roleFilter || undefined, limit: 100 });
  const update = useUpdateUser();

  return (
    <PageShell
      title="User management"
      description="Accounts and roles. Users can never assign or elevate their own role."
      actions={
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New user
        </Button>
      }
      toolbar={
        <Toolbar>
          <Select
            aria-label="Role"
            className="w-56"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
          >
            <option value="">All roles</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </Toolbar>
      }
    >
      <Card>
        <DataTable<AppUser>
          rows={users.data?.data}
          loading={users.isLoading}
          rowKey={(row) => row.id}
          emptyTitle="No users match this filter"
          columns={[
            {
              key: 'user',
              header: 'User',
              cell: (row) => (
                <div className="flex items-center gap-2.5">
                  <Avatar name={row.employee?.name ?? row.email} src={row.employee?.avatarUrl} size={26} />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--text-primary)]">
                      {row.employee?.name ?? '—'}
                    </p>
                    <p className="truncate font-mono text-[11px] text-[var(--text-muted)]">
                      {row.email}
                    </p>
                  </div>
                </div>
              ),
            },
            {
              key: 'employee',
              header: 'Linked employee',
              cell: (row) =>
                row.employee ? (
                  row.employee.workEmail
                ) : (
                  <span className="text-[var(--text-muted)]">Not linked</span>
                ),
            },
            {
              key: 'role',
              header: 'Role',
              cell: (row) => (
                <Select
                  aria-label={`Role for ${row.email}`}
                  className="h-8 w-48"
                  value={row.role}
                  onChange={(event) =>
                    update.mutate({ id: row.id, role: event.target.value as RoleName })
                  }
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </Select>
              ),
            },
            {
              key: 'created',
              header: 'Created',
              cell: (row) => formatDate(row.createdAt),
            },
            {
              key: 'status',
              header: 'Status',
              cell: (row) => (
                <div className="flex items-center gap-2">
                  <Switch
                    checked={row.isActive}
                    aria-label={`${row.email} is active`}
                    onCheckedChange={(checked) => update.mutate({ id: row.id, isActive: checked })}
                  />
                  <Badge tone={row.isActive ? 'success' : 'neutral'}>
                    {row.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </Badge>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        {creating ? <UserDialog onDone={() => setCreating(false)} /> : null}
      </Dialog>
    </PageShell>
  );
}

function UserDialog({ onDone }: { onDone: () => void }) {
  const employees = useEmployees({ limit: 200 });
  const create = useCreateUser();

  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState<RoleName>('EMPLOYEE');
  const [employeeId, setEmployeeId] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [banner, setBanner] = React.useState<string | null>(null);

  // Prefill the account email from the linked employee's work email.
  function handleEmployeeChange(value: string) {
    setEmployeeId(value);
    const employee = employees.data?.data.find((entry) => entry.id === value);
    if (employee && !email) setEmail(employee.workEmail);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setBanner(null);

    try {
      await create.mutateAsync({
        email: email.trim(),
        role,
        password,
        employeeId: employeeId || undefined,
      });
      onDone();
    } catch (error) {
      const normalised = normaliseError(error);
      setErrors(normalised.fieldErrors);
      setBanner(
        normalised.code === 'EMAIL_ALREADY_EXISTS'
          ? 'An account already exists for this email address.'
          : normalised.message,
      );
    }
  }

  return (
    <DialogContent
      title="New user"
      description="The account is created immediately with the temporary password you set."
    >
      <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto p-5">
        <Field label="Linked employee" htmlFor="userEmployee" hint="Optional, but required for self-service attendance and leave.">
          <Select
            id="userEmployee"
            value={employeeId}
            onChange={(event) => handleEmployeeChange(event.target.value)}
          >
            <option value="">No linked employee</option>
            {employees.data?.data.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name} · {employee.workEmail}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Work email" htmlFor="userEmail" error={errors.email}>
          <Input
            id="userEmail"
            type="email"
            required
            value={email}
            invalid={Boolean(errors.email)}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field label="Temporary password" htmlFor="userPassword" error={errors.password}>
          <Input
            id="userPassword"
            type="text"
            required
            minLength={8}
            className="font-mono"
            placeholder="At least 8 characters"
            value={password}
            invalid={Boolean(errors.password)}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        <Field label="Role" htmlFor="userRole">
          <Select
            id="userRole"
            value={role}
            onChange={(event) => setRole(event.target.value as RoleName)}
          >
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {ROLE_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <p className="flex items-start gap-2 rounded-[var(--radius-ctl)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-2 text-[12px] text-[var(--text-tertiary)]">
          <Info className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--status-info)]" aria-hidden />
          <span>
            <strong className="font-medium text-[var(--text-secondary)]">
              {ROLE_LABELS[role]}:
            </strong>{' '}
            {ROLE_SUMMARY[role]} Users cannot assign or elevate their own roles.
          </span>
        </p>

        {banner ? (
          <div
            role="alert"
            className="rounded-[var(--radius-ctl)] border border-[var(--status-danger)] bg-[var(--status-danger-bg)] px-3 py-2 text-[12px] text-[var(--status-danger)]"
          >
            {banner}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={create.isPending}>
            Create user
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
