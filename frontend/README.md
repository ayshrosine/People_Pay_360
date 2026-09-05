# Odoo PNX — Web app

Next.js 16 (App Router) + React 19 + Tailwind v4. Every screen is a client of
the NestJS API in [`../backend`](../backend); there is no server-side data
access here.

```bash
npm install
cp .env.example .env.local     # NEXT_PUBLIC_API_URL points at the API
npm run dev                    # http://localhost:3000
```

The API must be running first — the app renders a sign-in screen and every
query fails without it.

## Layout

```
src/
├── app/
│   ├── (auth)/login/          Sign-in
│   └── (dashboard)/           Everything behind auth
│       ├── dashboard/         Payroll KPIs, charts, alerts
│       ├── employees/         Directory + employee record
│       ├── contracts/         Employment terms
│       ├── time-off/          Attendance, leave requests, allocations, types
│       ├── working-schedules/ Rostered hours
│       ├── payroll/           Payruns, payslips, salary structures and rules
│       └── admin/users/       Account management
├── components/
│   ├── layout/                Sidebar, top bar, command palette, page shell
│   ├── ui/                    Primitives, tables, overlays, status vocabulary
│   ├── dashboard/             Charts and KPI widgets
│   └── attendance/            The floating check-in widget
├── hooks/use-resources.ts     Every query and mutation, one file
├── lib/
│   ├── api/                   Axios client, envelope types, error normalising
│   ├── abilities/             Frontend mirror of the backend CASL policy
│   └── auth/                  Session restore, role-aware redirects
└── stores/                    Zustand: auth tokens, UI prefs, list filters
```

## Conventions worth knowing

**Attendance lives inside Time & Attendance.** Leave and attendance answer the
same question — who was at work — and payroll reads both, so they share a
module. `/attendance` redirects to `/time-off/attendance`.

**The API is the only security boundary.** `lib/abilities` mirrors the backend
policy purely to hide actions a role cannot perform. It is a usability layer;
removing it would change what you see, never what you can do.

**One data layer.** All server state goes through `hooks/use-resources.ts`, so
caching, invalidation and error toasts behave identically everywhere.

**URL as state for lists.** Filters that a user would want to share or reload
live in the query string, not in component state.

**Dark and light are both complete palettes.** Tokens are defined on `:root` in
`app/globals.css`; only lightness moves between themes. Never hard-code a
colour — use a token.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
npm run codegen     # regenerate typed API surface from a running backend
```
