# PeoplePay360 — Project status

_Last verified: 5 September 2026, against the live Neon database and the
`peoplepay360-files` R2 bucket._

## Where it stands

The application is **feature-complete and running end to end**: frontend →
API → Neon Postgres, with payslip PDFs stored in Cloudflare R2. Every module
listed below was exercised against the real infrastructure, not mocks.

| Area | State | Evidence |
|---|---|---|
| Auth (login, refresh, logout, RBAC) | Working | 4/4 auth checks, 5/5 RBAC checks |
| Employees | Working | CRUD round-trip, archive-instead-of-delete |
| Departments | Working | CRUD, duplicates merged |
| Contracts | Working | Overlap rejected with `409` by app **and** DB constraint |
| Working schedules | Working | Rostered days drive payroll pro-rating |
| Attendance | Working | Check-in, check-out, manual correction |
| Time off | Working | Requests, approve/refuse, allocation debited in one transaction |
| Salary structures & rules | Working | Formula validation, sandbox escape blocked |
| Payruns | Working | `DRAFT → COMPUTED → VALIDATED → PAID`, immutability enforced |
| Payslips | Working | Rule-engine lines, explainer, PDF to R2 |
| Dashboard | Working | 8 endpoints, live figures |
| Admin users | Working | Account management |

**Test results:** 50/50 API checks pass; 23/23 pages render clean across three
roles with no console errors, failed requests, or hydration warnings.

```bash
cd backend && npm run test:api    # API contract + RBAC sweep
cd backend && npm run test:ui     # browser walkthrough, all roles, all pages
```

## Live data in the database

Created through the **real API**, not written directly — so every figure comes
from the salary-rule engine:

- 13 employees across 5 departments, one `RUNNING` contract each
- 3 working schedules (standard, night shift, part-time)
- ~1,700 attendance records over ~6 months, with late / absent / overtime /
  missing-checkout variety
- Time-off allocations for everyone, requests in approved / pending / refused
- 4 payruns: June, July and August 2026 `PAID`; September 2026 `COMPUTED`
  (the month in progress, so it is deliberately partial)

## What is deliberately not configured

Each degrades cleanly rather than crashing at boot.

| Service | Why |
|---|---|
| `REDIS_URL` | No Redis running locally. Payslip computation runs inline instead of via BullMQ. |
| `RESEND_API_KEY` | The supplied token is a Cloudflare token (`cfat_…`), not a Resend key (`re_…`). "Send payslips" is disabled rather than failing at send time. |
| `R2_PUBLIC_URL` | The supplied value was the placeholder `files.yourdomain.com`. PDFs are served through the app's own authenticated `/pdf/download` endpoint, so no public bucket URL is needed. |
| `SENTRY_DSN` | Optional; no-ops without a DSN. |

## Known limitations

1. **Latency.** Neon is in `us-east-2`; a round-trip from here is ~290 ms, so a
   page costs 1–2.5 s. The dashboard endpoints were parallelised (KPIs went
   from 5.4 s to 1.5 s). Further gains need either a closer region or Prisma's
   `relationJoins` preview to collapse `include`s into single queries.
2. **Payroll pro-rating uses attendance.** An employee with no attendance
   records in a period computes to zero pay. This is correct behaviour, but it
   means attendance must be captured before a payrun is meaningful.
3. **Email delivery is untested** because no valid Resend key was available.

## Recent fixes

Found and fixed while testing against real infrastructure:

- **Payroll ignored contract wages.** The `BASIC` rule was a fixed ₹50,000, so
  everyone was paid the same. It is now `basicWage * (workedDays / totalDays)`.
- **Pro-rating divided by calendar days.** `totalDays` counted all days in the
  period while `workedDays` only ever counted working days, docking every
  employee ~27% for a perfect month. `totalDays` now counts rostered days from
  the employee's working schedule.
- **`null` responses arrived as empty bodies.** The response interceptor
  skipped wrapping `null`, so `/attendance/widget/today` returned nothing and
  the client read `undefined`.
- **Deleting an employee with history returned a raw 500.** It now returns
  `409 EMPLOYEE_HAS_RECORDS` and points at archiving.
- **Hydration mismatch on the dashboard** from a `<div>` skeleton inside a `<p>`.
- **A self-service employee's payslip page requested payruns** and earned a 403.
- **Duplicate departments** from two seeds using different ids for one name.
- **The contract-overlap exclusion constraint** was applied to Neon and verified.

## Security note

The credentials for Neon, JWT signing, and R2 were pasted into a chat
transcript. **They should be rotated**: the Neon password, both JWT secrets,
and the R2 access key. Rotating the JWT secrets invalidates existing sessions,
which is the intended effect.

`backend/.env` is gitignored and has never been committed.
