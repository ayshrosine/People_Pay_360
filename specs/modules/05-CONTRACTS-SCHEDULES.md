# 05 · Contracts & Working schedules

A **contract** says what someone is paid and when they work. Payroll reads it
for every calculation, which makes it the most consequential record in the
system.

---

## The files

| File | Purpose |
|---|---|
| `src/contracts/contracts.controller.ts` | Contract routes |
| `src/contracts/contracts.service.ts` | CRUD plus overlap prevention |
| `src/contracts/dto/create-contract.dto.ts` | Required fields |
| `src/contracts/dto/update-contract.dto.ts` | Patch shape |
| `src/working-schedules/working-schedules.controller.ts` | Schedule routes |
| `src/working-schedules/working-schedules.service.ts` | CRUD plus hour calculation |
| `src/working-schedules/dto/*.ts` | Schedule and its day lines |
| `prisma/sql/001_no_overlapping_running_contracts.sql` | The database guarantee |

---

## What a contract holds

| Field | Meaning |
|---|---|
| `employeeId` | Who |
| `startDate` / `endDate` | When. `endDate: null` = open-ended |
| `wage` | How much, as `Decimal(12,2)` |
| `wageType` | `Monthly` or `Hourly` |
| `salaryStructureId` | **Which rules compute their pay** |
| `workingScheduleId` | **Which days they are rostered** |
| `status` | `DRAFT`, `RUNNING`, `EXPIRED`, `CANCELLED` |

Only a `RUNNING` contract is used by payroll.

---

## The working schedule belongs to the contract

It used to sit on the employee. It was moved, deliberately.

> **Why:** a schedule is a *term of employment*. Someone who moves to part time
> in July must still be judged against the full-time roster for June. A field on
> the person can only ever describe "now", so every schedule change silently
> rewrote history — and last month's payslip would recompute differently from
> how it was actually paid.
>
> On the contract, the question "which roster applied during this period?" has
> exactly one correct answer.

Everything that needs a roster now resolves it through the contract:

```ts
// backend/src/attendance/attendance.service.ts
private async scheduleOn(employeeId: string, when: Date) {
  const contract = await this.prisma.contract.findFirst({
    where: {
      employeeId,
      status: 'RUNNING',
      startDate: { lte: when },
      OR: [{ endDate: null }, { endDate: { gte: when } }],
    },
    orderBy: { startDate: 'desc' },
    include: { workingSchedule: { include: { lines: true } } },
  });
  return contract?.workingSchedule ?? null;
}
```

That `where` clause — *starts on or before the date, and either never ends or
ends on or after it* — is the "which contract applied then?" question, and it
appears in payroll too.

**What changed elsewhere:** the employee form no longer has a schedule field;
the employee list no longer shows weekly hours; the schedule list counts
**contracts** rather than employees.

---

## One running contract at a time

This is the rule the whole module exists to protect.

### In the service

```ts
const overlapping = await this.prisma.contract.findFirst({
  where: {
    employeeId,
    status: 'RUNNING',
    id: { not: excludeId },
    AND: [
      { startDate: { lte: newEnd ?? MAX_DATE } },
      { OR: [{ endDate: null }, { endDate: { gte: newStart } }] },
    ],
  },
});

if (overlapping) {
  throw new ConflictException({
    message: 'This employee already has a running contract covering that period.',
    code: 'OVERLAPPING_CONTRACT',
  });
}
```

### In the database

Application checks have a race condition: two simultaneous requests can both
look, both see nothing, and both insert. Postgres closes it:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Contract" ADD CONSTRAINT no_overlapping_running_contracts
  EXCLUDE USING gist (
    "employeeId" WITH =,
    daterange("startDate"::date, COALESCE("endDate"::date, 'infinity'::date), '[]') WITH &&
  ) WHERE (status = 'RUNNING');
```

In English: *no two `RUNNING` rows may share an `employeeId` **and** have
overlapping date ranges*. `COALESCE(…, 'infinity')` handles open-ended
contracts; `WHERE (status = 'RUNNING')` means drafts and expired contracts may
overlap freely.

Apply it once per database:

```bash
psql "$DATABASE_URL" -f backend/prisma/sql/001_no_overlapping_running_contracts.sql
```

> **Both layers are needed.** The service gives a friendly error; the constraint
> is the guarantee. Never remove the constraint because the service "already
> checks".

---

## Working schedules

A schedule is a header plus one line per rostered day.

```prisma
model WorkingScheduleLine {
  dayOfWeek    Int     // 0 = Monday .. 6 = Sunday
  startTime    String  // "09:00"
  endTime      String  // "18:00"
  breakMinutes Int
}
```

### Weekly hours are calculated, not typed

```ts
private calculateTotalWeeklyHours(lines) {
  return lines.reduce((total, line) => {
    const start = toMinutes(line.startTime);
    const end = toMinutes(line.endTime);
    let span = end - start;
    if (span <= 0) span += 24 * 60;   // a night shift wraps past midnight
    return total + (span - line.breakMinutes) / 60;
  }, 0);
}
```

Two things to notice: **breaks are unpaid**, and a **night shift** ending before
it starts (22:00 → 07:00) is handled by adding a day rather than producing a
negative.

### Editing replaces the lines

```ts
await this.prisma.workingScheduleLine.deleteMany({ where: { scheduleId: id } });
// …then create the new set
```

Diffing days would be more code and no more correct. The whole set is replaced
inside one update.

### Two day-numbering systems

`dayOfWeek` is 0 = Monday. JavaScript's `Date#getDay()` is 0 = Sunday. Any code
crossing between them rotates:

```ts
if (rosteredDays.has((cursor.getDay() + 6) % 7)) count += 1;
```

Getting this wrong shifts everyone's week by a day — and would quietly change
what payroll pays.

---

## Why this feeds payroll

Payroll pro-rates pay by **days worked ÷ days rostered**:

```
BASIC = basicWage * (workedDays / totalDays)
```

`totalDays` counts the days the **schedule** rosters in that period — not
calendar days.

> This was a real bug. `totalDays` counted every day in the month (~30) while
> `workedDays` could only ever count working days (~22), so perfect attendance
> paid 73% of the contract wage. Every employee was quietly docked a quarter of
> their salary.

Full detail in [07 · Payroll](07-PAYROLL.md).
