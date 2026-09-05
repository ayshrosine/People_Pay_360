# 09 · Frontend core

The shell every page sits in, the one file that talks to the API, and the state
that outlives a page.

---

## The files

| File | Purpose |
|---|---|
| `src/app/layout.tsx` | The root HTML document, fonts, metadata, favicon |
| `src/app/page.tsx` | `/` — redirects to the right home |
| `src/components/providers.tsx` | React Query, auth, tooltips, toasts |
| `src/app/(auth)/login/page.tsx` | Sign-in |
| `src/app/(dashboard)/layout.tsx` | Sidebar + top bar + main |
| `src/components/layout/sidebar.tsx` | The left rail and mobile nav |
| `src/components/layout/topbar.tsx` | Breadcrumb, search, theme, account |
| `src/components/layout/command-palette.tsx` | ⌘K search |
| `src/components/layout/page-shell.tsx` | The page frame every screen uses |
| `src/components/layout/brand.tsx` | Logo and product name |
| `src/components/layout/lattice-background.tsx` | The animated sign-in background |
| `src/lib/api/client.ts` | **The only place that calls the API** |
| `src/lib/api/types.ts` | TypeScript shapes matching the API |
| `src/hooks/use-resources.ts` | **Every query and mutation** |
| `src/lib/auth/auth-provider.tsx` | Session, role, permissions |
| `src/lib/abilities/index.ts` | Frontend mirror of the permission rules |
| `src/lib/utils.ts` | Formatting helpers |
| `src/stores/auth-store.ts` | Tokens |
| `src/stores/ui-store.ts` | Theme and view preferences |
| `src/stores/filters-store.ts` | Dashboard filters |

---

## Route groups

Folders in brackets group routes **without appearing in the URL**:

```
app/
├── (auth)/login/          →  /login          (no shell)
└── (dashboard)/           →  everything else (sidebar + top bar)
    ├── layout.tsx         the shell
    ├── dashboard/         /dashboard
    ├── employees/         /employees
    └── …
```

That is how the sign-in screen gets a completely different layout from the rest
of the app without any conditional rendering.

---

## The shell — `(dashboard)/layout.tsx`

```tsx
if (loading || !authenticated) {
  return <div className="grid min-h-dvh place-items-center …">Loading your workspace</div>;
}

return (
  <div className="min-h-dvh bg-[var(--surface-canvas)]">
    <Sidebar />
    {/* The rail is fixed, so the content column is inset by its width. */}
    <div className="lg:pl-[248px]">
      <Topbar />
      <main className="pb-20 lg:pb-0">{children}</main>
    </div>
    <MobileNav />
    <AttendanceWidget />
  </div>
);
```

The loading state is not decoration: without it, a page would flash half-built
while the session is still being restored.

---

## The API client — `lib/api/client.ts`

One axios instance. Two interceptors.

### Requests get the token

```ts
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

### A 401 refreshes, once

```ts
let refreshInFlight: Promise<string> | null = null;
```

> **Why the shared promise:** the dashboard fires eight queries at once. If the
> token has expired, all eight get a 401 together. Eight separate refreshes
> would each rotate the token, and seven would be invalidated by the eighth.
> One shared in-flight promise means one refresh, and all eight retry with the
> same new token.

If the refresh itself fails, the session is cleared and the browser hard-navigates
to `/login`:

```ts
// A hard navigation, deliberately: this runs outside React (an axios
// interceptor, with no router in scope), and a full reload is what
// guarantees no in-memory state from the dead session survives.
window.location.href = '/login';
```

### Errors are normalised

```ts
export function normaliseError(error: unknown): NormalisedApiError {
  // → { status, code, message, fieldErrors }
}
```

Field errors from the validation pipe become `{ email: 'must be an email' }`,
ready to render under an input. A network failure becomes *"Cannot reach the
API. Is the backend running?"* rather than `Network Error`.

---

## The data layer — `hooks/use-resources.ts`

**Every** server call lives in this one file. No component calls `fetch`.

### Query keys

```ts
export const keys = {
  employees: (params?: unknown) => ['employees', params ?? {}] as const,
  employee: (id: string) => ['employees', 'detail', id] as const,
  …
};
```

A key identifies cached data. Because keys are **prefixed by resource**, a
mutation can invalidate `['employees']` and refresh every employee query at once,
whatever its filters.

### One mutation wrapper

```ts
export function useApiMutation(mutationFn, options) {
  return useMutation({
    mutationFn,
    onSuccess: (data, vars) => {
      for (const key of options.invalidate ?? []) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      if (options.successMessage) toast.success(…);
    },
    onError: (error) => toast.error(normaliseError(error).message),
  });
}
```

Every mutation gets cache invalidation, a success toast and a real error message
for free — so no screen can forget one.

The invalidation lists are where the cross-links live:

```ts
// Approving leave changes the request, the balance, and the dashboard.
{ invalidate: [['time-off'], ['dashboard']] }
```

### Dropping empty parameters

```ts
function clean<T extends object>(params: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as Partial<T>;
}
```

Without it an unset filter would be sent as `?status=` and the API would try to
match the empty string.

---

## Auth — `lib/auth/auth-provider.tsx`

Wraps the app and provides `user`, `role`, `can()`, `selfService`,
`headedDepartments`, `canDecideLeaveFor()`.

### Restoring a session

The access token lives **in memory only**, so a reload starts with nothing. On
mount the provider trades the surviving refresh token for a new access token
before concluding you are signed out.

### Role-aware landing

```ts
router.replace(homeRouteFor(result.user?.role));
```

An administrator lands on the dashboard; an employee lands on their own
attendance.

### Relationship-based authority

```ts
canDecideLeaveFor: (employeeId, departmentId) => {
  if (can(role, 'update', 'TimeOffRequest') && !isSelfService(role)) return true;
  if (employeeId && employeeId === user?.employeeId) return false;  // never your own
  return Boolean(departmentId && headedDepartments.some((d) => d.id === departmentId));
},
```

This decides **what renders**, never what is permitted — the API checks the same
rule again.

---

## State — `stores/`

Zustand: small stores, no boilerplate.

| Store | Holds | Persisted |
|---|---|---|
| `auth-store` | Access + refresh tokens | Refresh token in `sessionStorage` |
| `ui-store` | Theme, kanban/list preference | `localStorage` |
| `filters-store` | Dashboard filters | In memory |

> **Why the access token is not persisted:** anything in storage is readable by
> any script on the page. A 15-minute token in memory disappears when the tab
> closes. The refresh token is in `sessionStorage` — per-tab, cleared on close —
> as a deliberate trade for not signing you out on every reload.

**List filters live in the URL, not in a store**, so a filtered list can be
shared or reloaded and still show the same thing.

---

## Utilities — `lib/utils.ts`

`cn()` merges Tailwind classes; `formatMoney`, `formatDate`, `formatDuration`,
`initials`, `humanize`, `displayName` do the obvious.

One deserves attention:

```ts
/**
 * Formats a date as YYYY-MM-DD in the *local* calendar.
 * `toISOString()` converts to UTC first, so in any timezone ahead of UTC local
 * midnight on the 1st becomes the 31st of the previous month …
 */
export function toISODate(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}
```

> This was a real bug. In IST (+5:30), `toISOString().slice(0, 10)` on local
> midnight of 1 September returned `2026-08-31`. Every default pay period and
> date input was a day early. **Never use `toISOString()` for a local calendar
> date.**

---

## The sign-in background — `lattice-background.tsx`

A triangular lattice of hairlines with glowing nodes, denser toward the bottom.
One SVG; the only animation is `opacity` on the circles, which the compositor
handles without touching layout. It is `aria-hidden` and the global
reduced-motion rule stills it completely.

```ts
function hash(x: number, y: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  …
}
```

> The first version used `Math.abs(Math.sin(seed))`. Transcendental functions are
> **implementation-defined** in ECMAScript, so Node and the browser disagreed in
> the last bits — the server and the client rendered different values and React
> reported a hydration mismatch. Integer maths (`Math.imul`) is exact everywhere.
> **Anything rendered on both sides must be bit-identical on both sides.**
