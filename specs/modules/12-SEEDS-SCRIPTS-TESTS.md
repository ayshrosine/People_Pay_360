# 12 · Seeds, scripts & tests

How the demo data gets there, and how the whole thing is verified.

---

## The files

| File | npm script | Purpose |
|---|---|---|
| `prisma/seed.ts` | `npm run prisma:seed` | Base data: users, 3 employees, salary structure |
| `prisma/seed-demo.js` | `npm run seed:demo` | Representative data: 9 more staff, ~1,700 attendance rows, leave |
| `prisma/seed-heads.js` | `npm run seed:heads` | Appoints a head for each department |
| `scripts/create-payruns.js` | `npm run payruns:demo` | Creates payruns **through the API** |
| `scripts/merge-departments.js` | — | One-off: merges departments sharing a name |
| `scripts/move-schedule-to-contract.js` | — | One-off: backfills contracts before the schema change |
| `scripts/rename-email-domain.js` | — | One-off: moved accounts to the new product domain |
| `test/api-e2e.js` | `npm run test:api` | 50 checks: contract, RBAC, business rules |
| `test/department-head-e2e.js` | `npm run test:heads` | 13 checks: head authority and its limits |
| `test/ui-e2e.js` | `npm run test:ui` | Browser walkthrough, 3 roles, every page |
| `test/head-ui-e2e.js` | `npm run test:head-ui` | The head's controls actually render |
| — | `npm run test:all` | All four, in order |

---

## Setting up a fresh database

```bash
cd backend
npx prisma generate
npx prisma db push
psql "$DATABASE_URL" -f prisma/sql/001_no_overlapping_running_contracts.sql

npm run prisma:seed     # users, base employees, salary structure
npm run seed:demo       # staff, schedules, attendance, leave
npm run seed:heads      # department heads
npm run start:dev       # in another terminal:
npm run payruns:demo    # payruns, created through the real API
```

Every account uses `password123`. **Change or delete them before any real
deployment.**

---

## Seeds are idempotent

Every seed uses `upsert` keyed on a deterministic id or a natural key, so
running it twice does not duplicate anything.

```js
await prisma.department.upsert({ where: { id: d.id }, update: { name: d.name }, create: d });
```

### Two lessons the seeds encode

**Match on the natural key, not a made-up id.**

```js
// Match on name, not id: the base seed already owns some of these names under
// different ids, and creating a second row would leave the dashboard showing
// two "Engineering" departments.
const existing = await prisma.department.findFirst({ where: { name: d.name } });
const row = existing ?? (await prisma.department.create({ data: d }));
```

> That is exactly what happened. Two seeds used different ids for "Engineering",
> the dashboard rendered it twice, and React warned about duplicate keys.
> `scripts/merge-departments.js` cleaned it up.

**Random data must be deterministic.**

```js
// A deterministic pseudo-random draw keeps re-runs stable.
const roll = (back * 31 + emp.id.length * 17 + emp.name.charCodeAt(0)) % 100;
```

`Math.random()` would produce different attendance on every run, so no two runs
would compute the same payroll and nothing could be compared.

### Attendance covers six months

```js
// Attendance far enough back to cover every historical payrun period,
// otherwise those months compute as zero worked days and pay nothing.
for (let back = 1; back <= 190; back += 1) { … }
```

> Attendance originally covered eight weeks, and June's payrun computed to zero
> pay. That was **correct** behaviour — pro-rating uses attendance, so an
> employee with no records worked no days — but it made the demo look broken.

---

## Payruns come through the API, on purpose

`scripts/create-payruns.js` signs in and drives the real endpoints:

```
POST /payroll/payruns/preview-scope   → who is payable
POST /payroll/payruns                 → create
POST /payroll/payruns/:id/compute     → the rule engine runs
POST /payroll/payruns/:id/validate    → blocking warnings checked
POST /payroll/payruns/:id/mark-paid   → frozen
```

> **Why not write payslips directly?** Because then the figures would be
> invented rather than computed. Going through the API means every payslip line
> came out of the rule engine — and the script doubles as an end-to-end test of
> the whole payroll flow.

It asks the API who is eligible rather than pushing everyone in:

```js
// Ask the API which employees are payable for this period rather than
// pushing everyone in and tripping the blocking-warning guard.
```

Three months are marked `PAID`; the current month is left `COMPUTED`, so the UI
has a payrun you can actually act on.

---

## One-off migration scripts

Kept, not deleted — they document how the data got into its current shape.

**`move-schedule-to-contract.js`** ran *before* `Employee.workingScheduleId` was
dropped, copying each employee's schedule onto their contracts. Running the
schema change first would have lost the link permanently.

**`rename-email-domain.js`** moved accounts from the old product domain to
`@odoopnx.com` by **updating** rows rather than reseeding — reseeding under a
new domain would have created a second set of users with the payroll history
attached to the wrong one.

---

## The tests

Plain Node scripts against a running server. No test framework, because the
value here is exercising the **real** API and the **real** database.

### `test:api` — 50 checks

| Group | Proves |
|---|---|
| Auth | Login, refresh, `/me`; a missing token is 401, a wrong password is 401 |
| Reads | All 19 list and dashboard endpoints answer 200 |
| RBAC | An employee is denied the dashboard, payruns, salary structures, creating employees |
| Scoping | An employee sees exactly one employee row and only their own payslips |
| CRUD | Full round-trip on departments, employees, contracts, attendance, allocations, requests |
| Business rules | Overlapping contract → 409; over-balance leave → 400; sandbox escape blocked |
| Immutability | A `PAID` payrun cannot be recomputed or re-validated |
| Deletion | An employee with history → 409; archiving works; a clean record deletes |

**Every check asserts the negative too.** Proving an admin *can* do something is
half a test; proving an employee *cannot* is the other half.

### `test:heads` — 13 checks

That a department head can approve their own department — and **cannot**
approve another department's, cannot approve their own leave, cannot see other
departments' requests, and gains no other powers. A non-head colleague is
checked as the control.

### `test:ui` — the browser walkthrough

Puppeteer signs in as each of three roles and visits every page, failing on:

- a console error or an uncaught exception,
- a failed API call (any 4xx/5xx),
- an error boundary,
- a page with almost no text — a blank render.

> **It waits for real data, not a fixed delay.** An early version waited 4
> seconds and counted *skeleton* rows as real ones, reporting "6 rows" on a
> table that had not loaded. It now waits for the loading state to clear and for
> rows to contain text.

Screenshots land in `backend/.ui-shots/` (gitignored) — useful for seeing what
actually rendered.

### `test:head-ui`

Signs in as the head of Engineering and asserts the approve and refuse controls
are present on their department's pending request. The API tests prove the
authority exists; this proves it is reachable.

---

## Running everything

```bash
# Both servers must be running.
cd backend && APP_URL=http://localhost:3000 npm run test:all
```

Current state: **50 + 13 API checks pass, 23/23 pages render clean across three
roles, and the department head's controls render.**

---

## Bugs these tests actually caught

Not hypothetical — each of these was found by running the suite against the real
database:

- Payroll ignored contract wages (a fixed `BASIC` paid everyone the same).
- Pro-rating divided by calendar days, docking everyone ~27%.
- `null` responses arrived as empty bodies.
- Deleting an employee with history returned a raw `500`.
- A `<div>` inside a `<p>` caused a hydration mismatch.
- An employee's payslip page requested payruns and earned a 403.
- Leave requests were not row-scoped — any employee could read every colleague's.
- `Math.sin` in the login background differed between Node and the browser.
- `@IsUUID()` rejected valid ids, because ids here are opaque strings.

> **The point:** none of these were visible from reading the code. They appeared
> the moment real data went through the real stack.
