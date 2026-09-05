# 10 · Frontend pages

Every screen, what it does, and the pattern it demonstrates.

Each page lives at `frontend/src/app/(dashboard)/<route>/page.tsx`. A `[id]`
folder is a **dynamic route**: `/employees/abc` renders `employees/[id]/page.tsx`
with `id = "abc"`.

Every folder also has an `error.tsx` — a React error boundary. If a page throws,
that route shows a recoverable message instead of blanking the whole app.

---

## The map

| Route | File | What it does |
|---|---|---|
| `/login` | `(auth)/login/page.tsx` | Sign in |
| `/` | `app/page.tsx` | Redirects to your home |
| `/dashboard` | `dashboard/page.tsx` | Live payroll figures |
| `/employees` | `employees/page.tsx` | Directory, kanban or list |
| `/employees/[id]` | `employees/[id]/page.tsx` | One employee, plus `new` |
| `/contracts` | `contracts/page.tsx` | All contracts |
| `/contracts/[id]` | `contracts/[id]/page.tsx` | One contract |
| `/working-schedules` | `working-schedules/page.tsx` | Rosters |
| `/working-schedules/[id]` | `working-schedules/[id]/page.tsx` | Edit a roster |
| `/time-off` | `time-off/page.tsx` | Redirects to attendance |
| `/time-off/attendance` | `time-off/attendance/page.tsx` | Attendance records |
| `/time-off/requests` | `time-off/requests/page.tsx` | Leave requests |
| `/time-off/allocations` | `time-off/allocations/page.tsx` | Balances |
| `/time-off/types` | `time-off/types/page.tsx` | Kinds of leave |
| `/payroll` | `payroll/page.tsx` | Redirects to payruns |
| `/payroll/payruns` | `payroll/payruns/page.tsx` | Payroll cycles |
| `/payroll/payruns/new` | `payroll/payruns/new/page.tsx` | Create a payrun |
| `/payroll/payruns/[id]` | `payroll/payruns/[id]/page.tsx` | Run the state machine |
| `/payroll/payslips` | `payroll/payslips/page.tsx` | All payslips |
| `/payroll/payslips/[id]` | `payroll/payslips/[id]/page.tsx` | The breakdown |
| `/payroll/structures` | `payroll/structures/page.tsx` | Salary structures |
| `/payroll/rules/[structureId]` | `payroll/rules/[structureId]/page.tsx` | Edit rules |
| `/admin/users` | `admin/users/page.tsx` | Accounts |

Sub-navigation lives in `layout.tsx` files: `time-off/layout.tsx` renders the
Attendance / Leave requests / Allocations / Leave types tabs, and
`payroll/layout.tsx` the Payruns / Payslips / Structures tabs.

---

## Sign-in

Email and password, an animated lattice background, and — outside production —
one-click demo account buttons.

```tsx
const showDemo = process.env.NODE_ENV !== 'production';
```

The error message distinguishes a wrong password from a malformed request,
because the API distinguishes them:

```tsx
setFormError(
  normalised.code === 'INVALID_CREDENTIALS'
    ? 'That email and password combination is not recognised.'
    : normalised.message,
);
```

---

## Employees

### The list

Two views, kanban or list, remembered in the UI store. The kanban groups by
department — unless you have *filtered* by department, in which case it groups by
status:

```tsx
// Kanban columns: by department normally, by status once a department is
// already the filter - grouping by the thing you filtered on says nothing.
const key = departmentId ? 'status' : 'department';
```

Search is debounced so typing does not fire a request per keystroke:

```tsx
React.useEffect(() => {
  const id = window.setTimeout(() => setDebounced(search), 250);
  return () => window.clearTimeout(id);
}, [search]);
```

### The record

One page serves both create and edit; `id === 'new'` switches the mode.

**Form state is initialised at mount, not synced in an effect.** The parent
waits for the record and remounts the form with `key={record.id}`:

```tsx
<EmployeeForm key={record.id} record={record} />
```

> **Why:** copying props into state inside an effect means the form renders
> once with the wrong values, then again with the right ones — and it silently
> discards anything the user typed in between. Mount-time initialisation plus a
> `key` has neither problem.

Below the form sits **Department leadership** — who leads this person's
department, and for an administrator, the control to appoint them. It is
rendered *outside* the form's `fieldset` so it stays usable while the form is
read-only: appointing a head is its own action, not a form field.

> **The employee form has no working schedule field.** That moved to the
> contract — see [05](05-CONTRACTS-SCHEDULES.md).

---

## Contracts

The contract form carries wage, period, salary structure and **working
schedule**. Saving an overlapping contract surfaces the API's own error inline:

```
409 OVERLAPPING_CONTRACT
This employee already has a running contract covering that period.
```

---

## Time & Attendance

### Attendance

Filters — employee, date range, status — live **in the URL**:

```tsx
router.replace(value ? `/time-off/attendance?employeeId=${value}` : '/time-off/attendance');
```

> URL as state means a filtered list can be bookmarked, shared, and survives a
> reload. It also removed a `setState`-in-effect that used to sync the filter
> from props.

### Leave requests

The approve and refuse controls are decided **per row**, because a department
head's authority depends on which row it is:

```tsx
const canDecide = (row) => canDecideLeaveFor(row.employeeId, row.employee?.departmentId);
```

### Allocations and types

Straightforward tables. Approving an allocation and creating a type both go
through the shared mutation wrapper, so they invalidate and toast for free.

---

## Payroll

### The payrun wizard

`payroll/payruns/new` asks for a period and a structure, calls
`POST /payroll/payruns/preview-scope`, and shows exactly who will be included
before anything is created.

The payrun name is **derived during render** until you type your own:

```tsx
const name = nameTouched ? typedName : derivedName;
```

> Not `setState` in an effect. Deriving during render cannot get out of sync,
> and typing simply flips a flag.

### The payrun detail page

Drives the state machine. Which action is available, and why it is not:

```tsx
const ENABLED_IN = { compute: ['DRAFT', 'COMPUTED', 'ERROR'], validate: ['COMPUTED'], … };
const DISABLED_REASON = { … };
```

A disabled button explains itself — *"Validation is only possible once the
payrun has been computed"* — rather than being mysteriously grey.

> `ActionButton` is defined at **module scope**, not inside the page component.
> A component created during render is a new type every render, so React
> unmounts and remounts it, losing focus and state.

### The payslip breakdown

The stored `PayslipLine` rows in the ledger rail, plus a plain-English
explanation from `GET /payroll/payslips/:id/explain`, plus a PDF download that
streams through the authenticated endpoint.

### Salary rules

Edit a structure's rules and validate a formula before saving:

```
POST /payroll/rules/validate   { "formula": "GROSS - PF" }
```

The check result carries the formula it was produced for, so a stale result is
ignored during render rather than being cleared in an effect.

---

## Patterns these pages share

**1. URL as state for lists.** Anything worth sharing goes in the query string.

**2. Mount-time form state + `key` to remount.** Never sync props into state in
an effect.

**3. Derive during render.** If a value can be computed from what you already
have, compute it — do not store it.

**4. Module-scope components.** Never define a component inside another
component.

**5. Permissions hide actions.** `can('create', 'Employee')` decides whether the
button renders. The API decides whether it works.

**6. Every route has an `error.tsx`.** One page throwing must not take down the
shell.
