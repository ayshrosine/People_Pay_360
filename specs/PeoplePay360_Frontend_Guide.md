# PeoplePay360 — Frontend Development Guide
**Confirmed Stack:** Next.js 15 (React 19) + TypeScript · Tailwind CSS + shadcn/ui + Radix · TanStack Query + Zustand · Recharts/Tremor · Framer Motion · Sentry (observability)

This guide specifies **every page** from the PDF spec and the Excalidraw mockups (login flow, employee/contract flow, attendance flow, time off flow, payroll/payrun flow, dashboard), so it can be built **independently** of the backend by an autonomous coding agent (Devin) against the API Contract defined in `PeoplePay360_Backend_Guide.md`.

---

## 1. Project Setup

```bash
npx create-next-app@latest peoplepay360-frontend --typescript --tailwind --app
cd peoplepay360-frontend
npx shadcn@latest init
npx shadcn@latest add button card table dialog dropdown-menu tabs badge avatar input select textarea calendar popover toast skeleton sheet stepper form
npm i @tanstack/react-query zustand
npm i recharts
npm i framer-motion
npm i axios
npm i react-hook-form zod @hookform/resolvers
npm i date-fns
npm i lucide-react
npm i @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
npm i openapi-typescript --save-dev   # codegen types from backend's openapi.json
```

### Folder Structure (Next.js App Router)
```
src/
 ├── app/
 │    ├── (auth)/login/page.tsx
 │    ├── (dashboard)/
 │    │    ├── layout.tsx                 (top nav: Employees, Contracts, Attendance, Time Off, Payroll, Reports)
 │    │    ├── dashboard/page.tsx         (Payroll Dashboard — home)
 │    │    ├── employees/
 │    │    │    ├── page.tsx              (Kanban/List toggle)
 │    │    │    └── [id]/page.tsx         (Employee Form + smart buttons)
 │    │    ├── contracts/
 │    │    │    ├── page.tsx
 │    │    │    └── [id]/page.tsx
 │    │    ├── working-schedules/
 │    │    │    ├── page.tsx
 │    │    │    └── [id]/page.tsx         (weekly grid form)
 │    │    ├── attendance/
 │    │    │    ├── page.tsx              (global list)
 │    │    │    └── [id]/page.tsx
 │    │    ├── time-off/
 │    │    │    ├── page.tsx              (Dashboard sub-nav landing)
 │    │    │    ├── requests/page.tsx
 │    │    │    ├── requests/[id]/page.tsx
 │    │    │    ├── allocations/page.tsx
 │    │    │    ├── allocations/[id]/page.tsx
 │    │    │    └── types/page.tsx
 │    │    ├── payroll/
 │    │    │    ├── page.tsx              (Payroll home / sub-nav)
 │    │    │    ├── payruns/
 │    │    │    │    ├── page.tsx         (list, e.g. Jan/Feb/March 2026 cards)
 │    │    │    │    ├── new/page.tsx     (2-step wizard modal route)
 │    │    │    │    └── [id]/page.tsx    (Payrun processing screen)
 │    │    │    ├── payslips/
 │    │    │    │    ├── page.tsx
 │    │    │    │    └── [id]/page.tsx
 │    │    │    ├── structures/
 │    │    │    │    ├── page.tsx
 │    │    │    │    └── [id]/page.tsx
 │    │    │    └── rules/[structureId]/page.tsx
 │    │    └── admin/users/page.tsx       (User Management screen)
 │    ├── layout.tsx
 │    └── globals.css
 ├── components/
 │    ├── layout/ (TopNav, Sidebar, UserMenu)
 │    ├── employees/ (EmployeeKanbanCard, EmployeeListTable, EmployeeForm, SmartButtons)
 │    ├── attendance/ (AttendanceWidget, AttendanceTable)
 │    ├── time-off/ (RequestForm, AllocationTable, ApprovalActions)
 │    ├── payroll/ (PayrunWizardStep1, PayrunWizardStep2, PayslipLineTable, RuleBuilder, WhatIfSimulator)
 │    ├── dashboard/ (KpiCard, SalaryCostChart, NetSalaryTrendChart, AlertsPanel)
 │    └── ui/ (shadcn generated components)
 ├── lib/
 │    ├── api/            (typed API client — one file per backend module, generated + hand-wrapped)
 │    ├── auth/            (AuthProvider, useAuth, token refresh interceptor)
 │    ├── abilities/       (CASL frontend mirror — hide/disable by role)
 │    └── utils.ts
 ├── stores/               (Zustand: uiStore, filtersStore)
 ├── hooks/                (useEmployees, usePayruns, useDashboardKpis ... one per resource, built on TanStack Query)
 └── styles/tokens.css     (design tokens — see §7)
```

---

## 2. Connecting to the Backend

### API Client
```ts
// lib/api/client.ts
import axios from 'axios';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL, // e.g. http://localhost:4000/api/v1
  withCredentials: true, // sends refresh-token cookie
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401, retry original request once
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      const { accessToken } = await refreshToken();
      useAuthStore.getState().setAccessToken(accessToken);
      error.config.headers.Authorization = `Bearer ${accessToken}`;
      return api(error.config);
    }
    return Promise.reject(error);
  }
);
```

### Type Generation from Backend OpenAPI
```bash
npx openapi-typescript http://localhost:4000/api/docs-json -o src/lib/api/schema.d.ts
```
Run this whenever the backend contract changes — it is the **single source of truth** so frontend and backend built independently never drift on shapes. Re-run before starting each new module (e.g. once Payroll endpoints are documented in Swagger).

### Data-fetching pattern (TanStack Query) — used identically across every module
```ts
// hooks/useEmployees.ts
export function useEmployees(params: EmployeeQueryParams) {
  return useQuery({
    queryKey: ['employees', params],
    queryFn: () => api.get('/employees', { params }).then((r) => r.data),
  });
}
export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateEmployeeDto) => api.post('/employees', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });
}
```
Every list/detail/form screen below follows this exact pattern — a `use<Resource>()` query hook + `useCreate/useUpdate/useDelete<Resource>()` mutation hooks.

### Environment Variables
```
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
NEXT_PUBLIC_SENTRY_DSN=...
NEXT_PUBLIC_ENV=development
```

---

## 3. Auth & Access Pages

### `/login` (0. Login & User Access Flow)
- Fields: Work Email, Password, "Forgot password?" link, Sign In button, footer note "Accounts are created by an administrator."
- On submit → `POST /auth/login` → store tokens in Zustand + memory (not localStorage, to reduce XSS risk) → redirect to `/dashboard`
- Show inline field errors from `422` validation responses; show a toast for `401 Invalid credentials`

### `/admin/users` (User Management)
- Table: Name, Employee, Work Email, Role, Status (Active/Inactive toggle)
- "New User" opens a `Dialog` with: Work Email, Role select (Employee/HR Manager/HR Payroll User/HR Payroll Manager/Admin), linked Employee combobox, "Create User / Send Invite" button
- Role select drives a note: *"Users will not be able to assign or elevate their own roles."*
- Only visible in nav for `role === ADMIN` (mirror backend RBAC in `lib/abilities`)

---

## 4. Employee & Contract Pages

### `/employees` — Kanban + List toggle (top-right view switcher, matches mockup)
- **Kanban:** cards grouped by Department (or Status), each card shows avatar, name, job position, department chip
- **List:** columns Employee, Work Email, Department, Role/Status; row click → `/employees/[id]`
- Toolbar: search box, Filters dropdown (Department, Status), "New" button → opens blank Employee Form

### `/employees/[id]` — Employee Form (the hub)
- Header: avatar, name (editable inline), job position, status badge
- Left/main panel: Work Info (Department, Manager combobox, Working Schedule combobox), Personal Info (phone, bank details), Status
- **Smart buttons row** (top-right, count badges) — Contracts, Attendance, Time Off, Allocations — clicking navigates to that module **pre-filtered by `employeeId`** (e.g. `/attendance?employeeId=xyz`), exactly per PS requirement
- "Employee Timeline" tab — renders the combined `/employees/:id/timeline` feed as a vertical timeline component (contracts, schedule changes, leave, overlaid) — this is the **Time-Travel Timeline** differentiator feature

### `/contracts` — list, filterable by employee, highlights the active (RUNNING) contract row with a green left-border accent
- Columns: Employee, Start Date, End Date, Wage, Salary Structure, Status

### `/contracts/[id]` — Contract Form
- Fields: Employee (locked if opened from Employee smart-button), Start/End Date pickers, Wage + Wage Type, Department, Job Position, Salary Structure combobox, Working Schedule combobox
- On save, surface backend `409 OVERLAPPING_CONTRACT` as an inline banner: *"This employee already has an active contract covering this period."*

### `/working-schedules` — list: Name, Type, Weekly Hours (auto-computed, read-only), Status
### `/working-schedules/[id]` — Form
- Top: Schedule Name, Company, Timezone, Type (Fixed/Flexible/Full Flexible)
- **Weekly grid** (matches mockup's "Weekly Schedule" panel): a row per day (Mon–Sun) with Start Time / End Time / Break inputs; a live-updating "Total weekly hours: XX%" summary footer recalculated client-side for instant feedback, then confirmed by the server value on save

---

## 5. Attendance & Time Off Pages

### `/attendance` — global list
- Columns: Employee, Check In, Check Out, Worked Hours, Status (colored chip: Present/Late/Absent/Overtime/Missing Checkout)
- Filters: date range, employee, department, status
- Row click → detail drawer (Sheet) with manual correction form (`PATCH`), visible only to HR roles per abilities check

### Attendance Widget (floating, global — appears on every authenticated page, bottom-right, per mockup)
- Small persistent card: greeting, live clock, today's status ("948 AM → Now, 6h56"), single primary button that toggles between **Check In** / **Check Out**
- Built as a global client component in the dashboard `layout.tsx`, backed by `useAttendanceToday()` hook polling/refetching on focus
- Clicking it opens a small popover confirming the action before firing the mutation (as annotated in the mockup: "Clicking the attendance icon opens the Check In/Check Out popup")

### `/time-off` (landing) — three sub-nav cards: Time Off Requests, Allocations, Types (mirrors "Menus under Time Off")

### `/time-off/requests` — list: Employee, Type, Dates, Duration, Status chip (To Approve/Approved/Refused), inline Approve/Refuse icon-buttons for HR roles
### `/time-off/requests/[id]` — form: Employee, Type, Date range picker (auto-computes Duration), Reason textarea, Status + Approve/Refuse buttons (guarded by ability)
### `/time-off/allocations` — list: Employee, Type, Allocated, Taken, Remaining, Validity, Status
### `/time-off/allocations/[id]` — form, same shape, "Approve Allocation" action
### `/time-off/types` — list + form: Name, Unit (Days/Hours), Requires Allocation toggle, Requires Approval toggle, Affects Payroll toggle, color picker for chip color used across the app

---

## 6. Payroll Pages (highest interaction complexity)

### `/payroll` — landing sub-nav (Dashboard, Payruns, Payslips, Structures, Rules — mirrors "Menus under Payroll")

### `/payroll/payruns` — list of payrun cards (per mockup: "January 2026", "February 2026", "March 2026") each showing period, employee count, total, status chip

### `/payroll/payruns/new` — **Two-step wizard** (Dialog/Sheet with stepper, per PS requirement)
- **Step 1 — Scope:** Pay Structure select, Period (start/end date pickers) → "Continue" button. **No API mutation fires yet.**
- **Step 2 — Employee Selection:** calls `POST /payroll/payruns/preview-scope` with Step 1's values → renders a checkable table (Employee, Working Hours, Start Date, Wage) exactly like the mockup's "Select Employee Records" screen, with select-all and per-row checkboxes, a counter ("11-22 / 22"), Back / Create Payrun buttons
- **Create Payrun** → `POST /payroll/payruns` with the selected `employeeIds` → on success, redirect to `/payroll/payruns/[id]`

### `/payroll/payruns/[id]` — Payrun processing screen
- Header: Payrun name/period, status chip, action buttons row: **Compute → Validate → Mark Paid → Send Payslips** (each disabled/enabled based on current status per the state machine — mirror backend guard logic in the UI so invalid actions are never even clickable)
- If status `COMPUTING`: show a progress bar driven by the WebSocket `payrun.progress` event (or polling fallback every 2s)
- Warnings banner (red/amber) listing blocking issues before Validate is allowed, e.g. "3 employees missing bank details"
- Payslip summary table: Employee, Worked Days, Gross, Net, Status — row click → `/payroll/payslips/[id]`

### `/payroll/payslips` — list, filters: Payrun, Employee, Status
### `/payroll/payslips/[id]` — Payslip detail
- Header: Employee, Structure, Payrun, Period, Status, Worked Days
- **Salary Computation table**: ordered rule breakdown (Basic, Allowances, Deductions, Gross, Net) — bold the Net row
- Buttons: **Print Payslip** (downloads PDF via `/payroll/payslips/:id/pdf`), and (differentiator) **"Explain this payslip"** → opens a side panel with an AI-generated plain-English summary of the computation

### `/payroll/structures` — list: Name, # Rules, # Employees, Active toggle
### `/payroll/structures/[id]` — form: name/description + an ordered list of linked Salary Rules (drag handles to reorder `sequence`) + "Add Rule" → navigates to `/payroll/rules/[structureId]`

### `/payroll/rules/[structureId]` — Salary Rule list + form
- List columns: Name, Code, Category (colored chip: Basic/Allowance/Deduction/Gross/Net), Sequence, Computation Type
- Form: Name, Code, Category select, Sequence number, Computation Type (Fixed/Percentage/Formula) — **conditionally renders** the right input (amount field / percentage-of combobox + %, or a formula code editor)
- **Live validation**: as the user types a Formula, debounce-call `POST /payroll/rules/validate` and show the computed sample result or a syntax error inline — no more guessing whether a formula is correct before saving
- (Differentiator, optional) toggle to switch this form into the **Visual Rule Builder**: a node-graph canvas (build with `reactflow`) where each rule is a node wired to the rules it references; compiles back to the same underlying `SalaryRule[]` on save

### What-If Simulator (differentiator, accessible from Payslip or Employee page)
- A modal: pick Employee + Salary Structure, sliders/inputs for hypothetical wage/allowance overrides, live-recomputes via a **client-side mirror of the rule engine** (or a dedicated `POST /payroll/simulate` backend endpoint) and renders the resulting payslip breakdown instantly as inputs change — no data is persisted

---

## 7. Payroll Dashboard (`/dashboard`) — the home screen

Matches the mockup's KPI/chart layout exactly:

- **Filter bar:** Period, Department, Employee Type, Company — all filters update every widget below via a shared `filtersStore` (Zustand) so widgets don't each manage their own filter state
- **KPI cards row:** Total Net Salary Paid, Payslips Generated, Avg Salary/Employee, Approved Time Off (days), Attendance Health (%) — each a `KpiCard` with big numeral + small trend delta
- **Salary Cost by Department** — bar chart (Recharts `BarChart`)
- **Monthly Net Salary Trend** — line chart (Recharts `LineChart`)
- **Payslip Status & Payroll Alerts** — donut/status chart + a scrollable alerts list ("3 employees missing bank details", "1 duplicate payslip pending", "2 contracts ending this month")
- **Attendance Overview** — small multi-stat panel: Present/Late/Absent/Overtime counts + coverage %
- **Time Off Overview** — Approved days, Pending requests, mini breakdown by type
- **Department Overview** — table: Department, Headcount, Total Salary
- (Differentiator) **Payroll Health Score** — a single large circular gauge (0–100) combining the above signals, placed prominently top-right of the dashboard

All widgets are skeleton-loading placeholders while their `useDashboard*()` query hooks fetch, never blank/empty flashes.

---

## 8. Design System Implementation (`styles/tokens.css` + `tailwind.config.ts`)

```css
:root[data-theme="dark"] {
  --surface-base: #0B0D12;
  --surface-elevated: #12151C;
  --surface-hover: #1A1E27;
  --border-subtle: #232833;
  --text-primary: #E6E9EF;
  --text-secondary: #8B93A5;
  --accent: #6366F1;
  --accent-alt: #22D3EE;
  --status-success: #22C55E;
  --status-warning: #F59E0B;
  --status-danger: #EF4444;
  --status-info: #38BDF8;
}
```
- Status chip colors map 1:1 across every module (same green for "Approved" Time Off and "Paid" Payslip and "Active" Contract).
- Font: `Inter` (variable font via `next/font/google`) for UI, `JetBrains Mono` for numeric table columns (wages, hours, %).
- Table density: `text-sm`, `py-2` rows for List views; Form views use `space-y-6` generous spacing.
- Motion: wrap route transitions and drawer/sheet open/close in Framer Motion `AnimatePresence` with a subtle 150–200ms ease.

---

## 9. Sentry Setup (Frontend) — Detailed

### Init (`sentry.client.config.ts`, generated by the wizard, then customized)
```ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_ENV,
  tracesSampleRate: 0.5,
  replaysSessionSampleRate: 0.1,   // session replay: invaluable for reproducing "the payrun wizard broke" bug reports
  replaysOnErrorSampleRate: 1.0,
  integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })], // mask PII — this app shows salaries and bank details
});
```
**Important for a payroll app:** enable `maskAllText`/`blockAllMedia` on Session Replay so salary figures and bank details are never captured in replay recordings — configure Sentry's data-scrubbing rules to redact fields matching `wage`, `salary`, `bankAccount`, `netAmount`, etc. server-side as a second layer.

### Attach user + route context
```ts
// lib/auth/AuthProvider.tsx, after login succeeds
Sentry.setUser({ id: user.id, email: user.email });
Sentry.setTag('role', user.role);
```

### Wrap API errors with context
```ts
// lib/api/client.ts response interceptor (extends the refresh logic above)
api.interceptors.response.use(undefined, (error) => {
  if (error.response?.status >= 500) {
    Sentry.captureException(error, {
      extra: { url: error.config?.url, method: error.config?.method, responseBody: error.response?.data },
    });
  }
  return Promise.reject(error);
});
```

### React Error Boundaries per major module
Wrap each top-level route segment (`app/(dashboard)/payroll/error.tsx`, `.../employees/error.tsx`, etc. — Next.js App Router error boundaries) so a crash in, say, the Rule Builder canvas doesn't white-screen the entire dashboard, and each reports to Sentry with a `section` tag:
```tsx
// app/(dashboard)/payroll/error.tsx
'use client';
export default function PayrollError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error, { tags: { section: 'payroll' } }); }, [error]);
  return <ErrorFallback message="Something went wrong in Payroll." onRetry={reset} />;
}
```

### Custom breadcrumbs on key user actions
Add breadcrumbs on payrun wizard steps, approve/refuse actions, and Mark Paid clicks — mirrors the backend breadcrumb strategy so a frontend error report shows the exact click-path that led to it:
```ts
Sentry.addBreadcrumb({ category: 'payrun-wizard', message: 'Step 1 → Step 2', level: 'info' });
```

### Performance: Web Vitals
`@sentry/nextjs` auto-captures Core Web Vitals (LCP, CLS, INP) per route — watch the Payroll Dashboard route specifically since it loads the most chart/query data; set a performance alert if LCP > 2.5s there.

---

## 10. Build Order for the Frontend Track

1. Auth pages + AuthProvider + API client + Sentry wired in from day one
2. App shell: TopNav, role-based nav visibility, Attendance Widget shell
3. Employees (Kanban/List/Form) + smart buttons + Departments
4. Contracts + Working Schedules (weekly grid)
5. Attendance (list + widget + manual correction)
6. Time Off (Types → Allocations → Requests, with approval actions)
7. Salary Structures/Rules (incl. live formula validation)
8. Payrun wizard (2-step) → Payrun processing screen → Payslip detail + PDF
9. Payroll Dashboard (KPIs + charts + alerts)
10. Differentiator features: Employee Timeline, Payslip Explainer, What-If Simulator, Payroll Health Score, Visual Rule Builder — pick per §7 of the main architecture doc
11. Polish pass: skeleton states, empty states, error boundaries, motion, accessibility audit
