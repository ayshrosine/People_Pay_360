'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Accent, PageShell } from '@/components/layout/page-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/data-table';
import { StatusChip } from '@/components/ui/status';
import { useWorkingSchedules } from '@/hooks/use-resources';
import { useAuth } from '@/lib/auth/auth-provider';
import type { WorkingSchedule } from '@/lib/api/types';

export default function WorkingSchedulesPage() {
  const router = useRouter();
  const { can } = useAuth();
  const schedules = useWorkingSchedules();

  return (
    <PageShell
      eyebrow="ROSTERED HOURS"
      title={<>Working <Accent>schedules</Accent></>}
      description="Weekly hours are derived from the day lines, never entered by hand."
      actions={
        can('create', 'WorkingSchedule') ? (
          <Button asChild variant="primary">
            <Link href="/working-schedules/new">
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New schedule
            </Link>
          </Button>
        ) : null
      }
    >
      <Card>
        <DataTable<WorkingSchedule>
          rows={schedules.data?.data}
          loading={schedules.isLoading}
          rowKey={(row) => row.id}
          onRowClick={(row) => router.push(`/working-schedules/${row.id}`)}
          emptyTitle="No working schedules yet"
          emptyDescription="Create one to define expected hours for attendance and payroll."
          columns={[
            {
              key: 'name',
              header: 'Name',
              cell: (row) => (
                <span className="font-medium text-[var(--text-primary)]">{row.name}</span>
              ),
            },
            { key: 'company', header: 'Company', cell: (row) => row.company },
            { key: 'type', header: 'Type', cell: (row) => row.scheduleType },
            { key: 'timezone', header: 'Timezone', cell: (row) => row.timezone },
            {
              key: 'days',
              header: 'Days / week',
              numeric: true,
              cell: (row) => row.lines?.length ?? 0,
            },
            {
              key: 'hours',
              header: 'Hours / week',
              numeric: true,
              cell: (row) => `${Number(row.totalWeeklyHours ?? 0).toFixed(1)}h`,
            },
            {
              // A schedule is attached to contracts, not to people directly, so
              // this counts the contracts that roster against it.
              key: 'contracts',
              header: 'Contracts',
              numeric: true,
              cell: (row) => row._count?.contracts ?? 0,
            },
            { key: 'status', header: 'Status', cell: (row) => <StatusChip status={row.status} /> },
          ]}
        />
      </Card>
    </PageShell>
  );
}
