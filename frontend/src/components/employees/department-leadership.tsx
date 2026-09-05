'use client';

import * as React from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, Card, CardHeader } from '@/components/ui/primitives';
import { useDepartments, useSetDepartmentHead } from '@/hooks/use-resources';
import { useAuth } from '@/lib/auth/auth-provider';

/**
 * Who leads this employee's department, and — for an administrator — the
 * control to change it.
 *
 * A department head is an ordinary employee: the authority to approve their
 * department's leave comes from this relationship, not from their role. That is
 * worth stating on the page, because nothing in the role badge reveals it.
 */
export function DepartmentLeadership({
  employeeId,
  employeeName,
  departmentId,
}: {
  employeeId: string;
  employeeName: string;
  departmentId: string | null | undefined;
}) {
  const { can } = useAuth();
  const departments = useDepartments();
  const setHead = useSetDepartmentHead();

  const department = departments.data?.data.find((d) => d.id === departmentId);
  const mayAppoint = can('update', 'Department');

  if (!departmentId) {
    return (
      <Card className="self-start">
        <CardHeader title="Department leadership" description="Who approves this employee's leave" />
        <p className="p-4 text-[13px] text-[var(--text-tertiary)]">
          This employee is not in a department, so only HR can decide their leave requests.
        </p>
      </Card>
    );
  }

  const head = department?.head ?? null;
  const isHead = head?.id === employeeId;

  return (
    <Card className="self-start">
      <CardHeader
        title="Department leadership"
        description={`Who approves leave in ${department?.name ?? 'this department'}`}
      />

      <div className="space-y-4 p-4">
        {isHead ? (
          <div className="flex items-start gap-2.5 rounded-[var(--radius-control)] border border-[var(--accent)] bg-[var(--accent-subtle)] p-3">
            <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[var(--text-primary)]">
                Head of {department?.name}
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--text-tertiary)]">
                {employeeName} can approve and refuse leave for this department — but never their
                own, which still goes to HR.
              </p>
            </div>
          </div>
        ) : head ? (
          <div className="flex items-center gap-2.5">
            <Avatar name={head.name} src={head.avatarUrl} size={30} />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                {head.name}
              </p>
              <p className="truncate font-mono text-[11px] text-[var(--text-muted)]">
                Head of {department?.name}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-[var(--text-tertiary)]">
            {department?.name} has no head yet, so only HR can decide its leave requests.
          </p>
        )}

        {mayAppoint ? (
          <div className="border-t border-[var(--border-subtle)] pt-4">
            {isHead ? (
              <Button
                variant="secondary"
                size="sm"
                loading={setHead.isPending}
                onClick={() => setHead.mutate({ departmentId, headId: null })}
              >
                Remove as head
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                loading={setHead.isPending}
                onClick={() => setHead.mutate({ departmentId, headId: employeeId })}
              >
                {head ? `Make head instead of ${head.name.split(' ')[0]}` : 'Make department head'}
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
