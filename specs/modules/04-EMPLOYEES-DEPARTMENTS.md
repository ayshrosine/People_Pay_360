# 04 · Employees & Departments

The people directory, and the department-head authority built on top of it.

---

## The files

| File | Purpose |
|---|---|
| `src/employees/employees.controller.ts` | Employee routes, including "smart button" sub-routes |
| `src/employees/employees.service.ts` | Search, filter, create, update, archive |
| `src/employees/dto/create-employee.dto.ts` | Required fields for a new employee |
| `src/employees/dto/update-employee.dto.ts` | All fields optional — a patch |
| `src/departments/departments.controller.ts` | Department routes |
| `src/departments/departments.service.ts` | CRUD plus head appointment |
| `src/departments/dto/*.ts` | Name and `headId` |
| `src/common/abilities/department-head.service.ts` | **Decides who leads whom** |

---

## Employee endpoints

| Method | Path | Does |
|---|---|---|
| `GET` | `/employees` | List, with `search`, `departmentId`, `status`, paging |
| `GET` | `/employees/:id` | One employee |
| `POST` | `/employees` | Create |
| `PATCH` | `/employees/:id` | Update |
| `DELETE` | `/employees/:id` | Delete **only** if they have no history |
| `GET` | `/employees/:id/contracts` | Their contracts |
| `GET` | `/employees/:id/attendance` | Their attendance |
| `GET` | `/employees/:id/time-off` | Their leave |
| `GET` | `/employees/:id/payslips` | Their payslips |
| `GET` | `/employees/:id/timeline` | Everything, merged into one history |

The last five are **smart buttons** — the counters on an employee's page that
open a filtered list. Each is a small dedicated endpoint rather than making the
client stitch four calls together.

---

## Searching

```ts
if (search) {
  where.OR = [
    { name: { contains: search, mode: 'insensitive' } },
    { workEmail: { contains: search, mode: 'insensitive' } },
    { jobPosition: { contains: search, mode: 'insensitive' } },
  ];
}
```

`mode: 'insensitive'` matters — without it, searching "priya" would not find
"Priya".

---

## Archiving, not deleting

```ts
const blockers = [
  payslips && `${payslips} payslip(s)`,
  contracts && `${contracts} contract(s)`,
  attendance && `${attendance} attendance record(s)`,
  …
].filter(Boolean);

if (blockers.length > 0) {
  throw new ConflictException({
    message: `${employee.name} still has ${blockers.join(', ')} and cannot be deleted. ` +
             'Set their status to TERMINATED to archive them instead…',
    code: 'EMPLOYEE_HAS_RECORDS',
  });
}
```

**Why:** a paid payslip must always name the person it paid. Deleting the
employee would leave a legal record pointing at nothing.

> This used to surface as a raw Prisma foreign-key error and a `500`. The
> database was right to refuse; the API was wrong to be unhelpful about it. Now
> it says exactly what is holding the record and what to do instead.

Before deleting a clean record, reports are detached:

```ts
await this.prisma.employee.updateMany({
  where: { managerId: id },
  data: { managerId: null },
});
```

Otherwise the self-referencing `managerId` foreign key blocks the delete.

---

## Departments

| Method | Path | Does |
|---|---|---|
| `GET` | `/departments` | List, with `head` and employee count |
| `GET` | `/departments/:id` | One department with its members |
| `POST` | `/departments` | Create |
| `PATCH` | `/departments/:id` | Rename, **or appoint/remove the head** |
| `DELETE` | `/departments/:id` | Delete |

Every list includes the head, because the head decides who can approve that
department's leave — it is part of the department's identity in the UI.

---

## Department heads

This is the most interesting authority in the system, because **it is not a
role**.

Two people can both be `EMPLOYEE` and have completely different powers,
depending only on whether `Department.headId` points at them. No role grid can
express that. So it is modelled as a relationship and checked per record.

### The three pieces

**1. `DepartmentHeadService`** — answers the questions.

```ts
async leads(user, employeeId): Promise<boolean> {
  const departmentIds = await this.departmentsHeadedBy(user);
  if (departmentIds.length === 0) return false;

  // A head does not approve their own leave - that has to go up the chain.
  if (employeeId === user?.employeeId) return false;

  const employee = await this.prisma.employee.findUnique({
    where: { id: employeeId }, select: { departmentId: true },
  });
  return Boolean(employee?.departmentId && departmentIds.includes(employee.departmentId));
}
```

Note the middle check. A head approving their own leave would be marking their
own homework, so their requests go to HR like anyone else's.

**2. `@AllowDepartmentHead()`** — lets them past the role guard.

```ts
if (allowsDepartmentHead && (await this.departmentHeads.isHeadOfAnyDepartment(user))) {
  return true;
}
```

> **This grants nothing by itself.** It only stops the *role* check from
> rejecting. A handler carrying this decorator that does not then authorise the
> specific record is an open endpoint.

**3. The handler authorises the record.**

```ts
@Patch(':id/approve')
@CheckAbility({ action: 'update', subject: 'TimeOffRequest' })
@AllowDepartmentHead()
async approve(@Param('id') id: string, @CurrentUser() user: RequestUser) {
  // The guard only lets a department head this far; whether they lead *this*
  // employee's department is decided here, per record.
  await this.timeOffRequestsService.assertMayDecide(id, user);
  return this.timeOffRequestsService.approve(id, user.id);
}
```

### Listings are scoped the same way

A head must also *see* their department's requests — and only those:

```ts
if (departmentIds.length > 0) {
  return { OR: [{ employeeId: own }, { employee: { departmentId: { in: departmentIds } } }] };
}
return { employeeId: own };
```

| Caller | Sees |
|---|---|
| HR roles / admin | Every request |
| Department head | Their department, plus their own |
| Everyone else | Only their own |

> Before this existed, **any employee could list every colleague's leave**. The
> permission check passed — reading leave requests is allowed — but nothing
> narrowed the rows. Row scoping is a separate question from permission, and it
> has to be asked separately.

### A head must belong to the department

```ts
if (departmentId && employee.departmentId !== departmentId) {
  throw new BadRequestException({
    message: `${employee.name} is not in this department, so they cannot lead it.`,
    code: 'HEAD_NOT_IN_DEPARTMENT',
  });
}
```

They must also be `ACTIVE` — a terminated head would leave a department unable
to get anything approved.

### In the UI

`frontend/src/components/employees/department-leadership.tsx` shows who leads
the department and lets an administrator appoint or remove a head. The employee
page renders it **outside** the form's `fieldset`, so it stays usable while the
form itself is read-only — appointing a head is its own action, not a form
field.

The requests table decides per row:

```ts
const canDecide = (row) => canDecideLeaveFor(row.employeeId, row.employee?.departmentId);
```

### Try it

Sign in as `john.doe@odoopnx.com` (`password123`). He heads Engineering. He is
still denied the dashboard, payruns and employee management — but on
**Time & Attendance → Leave requests** he can approve his own department's
pending leave, and only that.

`npm run test:heads` proves all thirteen cases, including every refusal.
