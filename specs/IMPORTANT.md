# IMPORTANT — read before changing anything

The rules here are not style preferences. Each one exists because breaking it
produced a real bug in this codebase.

---

## 1. Infrastructure is fixed

**Neon Postgres, Cloudflare R2, Prisma ORM.** Not local Postgres, not AWS S3,
not TypeORM. R2 is reached through `@aws-sdk/client-s3` with `region: 'auto'`
and the R2 endpoint.

The schema is applied with `prisma db push`. There is **no `_prisma_migrations`
table**, so `prisma migrate deploy` will not work — do not add it to a deploy
script expecting it to run.

```bash
npx prisma generate
npx prisma db push
```

---

## 2. Secrets

`backend/.env` is gitignored and must stay that way. Never print, log, commit,
or paste its values.

The credentials currently in use were exposed in a chat transcript and **should
be rotated**: Neon password, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and the
R2 access key.

Only three variables are required to boot: `DATABASE_URL`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`. Redis, R2, Resend and Sentry are all
optional and each degrades explicitly.

---

## 3. Payroll invariants

These are the rules that make payroll trustworthy. Do not weaken them.

**A payslip is a snapshot, not a view.** Every computed line is persisted as a
`PayslipLine`. Editing a salary rule next month must never change what someone
was already paid.

**A `PAID` payrun is immutable.** No recompute, no re-validate, no edit.

**Validation is blocked by blocking warnings** — missing bank details, no
active contract. Do not add a bypass.

**One `RUNNING` contract per employee per period.** Enforced twice: the service
returns `409 OVERLAPPING_CONTRACT`, and a Postgres GiST exclusion constraint
guarantees it underneath. Apply it once per database:

```bash
psql "$DATABASE_URL" -f backend/prisma/sql/001_no_overlapping_running_contracts.sql
```

**Pro-rating divides worked days by *rostered* days**, not calendar days. A
full month of attendance must produce a ratio of exactly 1.0. Dividing ~22
attended days by ~30 calendar days silently docks everyone a quarter of their
salary — this was a real bug.

**`BASIC` derives from the contract wage.** A fixed amount pays every employee
the same regardless of their contract. This was also a real bug.

**Balances are never client-supplied.** Approving leave updates the request and
debits the allocation inside one transaction; `remaining` is derived
server-side.

---

## 4. API contract

**Every successful response is `{ data, meta? }`.** One interceptor enforces
it. `null` is a real answer and must still be wrapped as `{ data: null }` —
returning a bare `null` produces an empty body that every client reads as
`undefined`. Only `undefined` (a genuine 204) is left unwrapped.

**Errors carry a `code`** — `OVERLAPPING_CONTRACT`, `INSUFFICIENT_BALANCE`,
`BLOCKING_WARNINGS`, `PAYRUN_IMMUTABLE`, `EMPLOYEE_HAS_RECORDS` — so the UI can
show a precise message instead of a generic toast. Add a code when you add an
error.

**Never hard-delete a record with history.** Return `409` and point at
archiving. Payroll records are legal documents.

**The API is the only security boundary.** `frontend/src/lib/abilities` mirrors
the CASL policy to hide unavailable actions; it protects nothing. Every rule
must exist in the backend guard first.

**Self-service roles are row-scoped.** "May this role read employees" and "may
this role read *this* employee" are different questions. List queries for
`EMPLOYEE` are scoped to the caller's own `employeeId`.

---

## 4a. Department heads

A department head is **not a role**. Two people with the identical `EMPLOYEE`
role differ only in whether `Department.headId` points at them, which the CASL
role grid cannot express. So the authority is modelled as a relationship:

- `@AllowDepartmentHead()` lets a head **past the role guard** — it grants
  nothing on its own.
- The handler must then call `DepartmentHeadService.assertLeads(...)` or
  `TimeOffRequestsService.assertMayDecide(...)`. **A handler that carries the
  decorator without that call is an open endpoint.**
- A head decides leave for their own department only, and **never their own** —
  that goes to HR.
- A head must be an **active member** of the department they lead.
- Listings are scoped the same way: a head sees their department's requests plus
  their own, nobody else's.

The frontend mirrors this with `canDecideLeaveFor(employeeId, departmentId)`
from `useAuth()`, fed by `headedDepartments` on `/auth/me`. As always, that
decides what renders, never what is permitted.

---

## 5. Performance

Neon is remote: **~290 ms per round-trip**. Query count, not query complexity,
is what makes a page slow.

- Never `await` independent queries in sequence — use `Promise.all`.
- Never query inside a loop over rows. Read once and group in memory.
- Each Prisma `include` is another round-trip; ask for only what you render.

---

## 6. Frontend rules

**All server state goes through `hooks/use-resources.ts`.** No ad-hoc `fetch`
in a component.

**Never define a component during render.** React treats it as a new type each
time and remounts the whole subtree, losing state and focus.

**No `setState` in an effect to mirror props or derive values.** Derive during
render; use `key` to remount a form when the record changes.

**Never put a `<div>` inside a `<p>`.** It is invalid HTML and causes a
hydration mismatch — this bit the dashboard skeletons.

**Never key a list by a data-derived label.** Two departments can share a name.

**Colours come from tokens only.** Both themes are complete palettes in
`app/globals.css`; hard-coding a colour breaks one of them.

**Dates in a local calendar use `toISODate`**, never `toISOString().slice(0,10)`
— the latter converts to UTC first and shifts the date by a day in any timezone
ahead of UTC.

---

## 7. Where things live

Attendance is **inside** Time & Attendance (`/time-off/attendance`), not a
module of its own. `/attendance` redirects there. Leave and attendance answer
the same question and payroll reads both.

---

## 8. Before you call it done

```bash
cd backend  && npm run build && npm run lint
cd frontend && npm run typecheck && npm run lint && npm run build
cd backend  && npm run test:all    # needs both servers running
```

`test:all` runs the API sweep, the department-head checks, the browser
walkthrough, and the head's own UI check.

The UI walkthrough fails on console errors, failed API calls, and blank pages —
not just on crashes. Keep it at zero.
