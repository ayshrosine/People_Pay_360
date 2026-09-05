# 03 · Auth & Users

Signing in, staying signed in, and who is allowed to do what.

---

## The files

| File | Purpose |
|---|---|
| `src/auth/auth.controller.ts` | The four auth endpoints |
| `src/auth/auth.service.ts` | Password checking and token issuing |
| `src/auth/strategies/jwt.strategy.ts` | Verifies a token and loads the user |
| `src/auth/dto/login.dto.ts` | Shape of a sign-in request |
| `src/auth/dto/refresh-token.dto.ts` | Shape of a refresh request |
| `src/auth/dto/change-password.dto.ts` | Shape of a password change |
| `src/users/users.controller.ts` | Managing accounts (admin only) |
| `src/users/users.service.ts` | Account CRUD |
| `src/users/dto/*.ts` | Create and update shapes |
| `src/common/abilities/ability.factory.ts` | The permission rules, per role |

---

## The endpoints

| Method | Path | Who | Does |
|---|---|---|---|
| `POST` | `/auth/login` | anyone | Email + password → tokens |
| `POST` | `/auth/refresh` | anyone with a refresh token | New access token |
| `GET` | `/auth/me` | signed in | The current user |
| `POST` | `/auth/change-password` | signed in | Change own password |
| `GET/POST/PATCH/DELETE` | `/users` | admin | Manage accounts |

---

## How signing in works

### Passwords are hashed with argon2

```ts
const valid = await argon2.verify(user.passwordHash, password);
```

The plain password is **never stored**. `argon2` is deliberately slow, which
makes guessing expensive.

> The API returns the same "invalid credentials" error whether the email is
> unknown or the password is wrong. Saying "no such user" would let anyone
> discover which addresses have accounts.

### Two tokens, on purpose

| Token | Lives | Stored where | Why |
|---|---|---|---|
| **Access** | 15 minutes | Memory only | Sent with every request. Short life limits the damage if it leaks |
| **Refresh** | 7 days | `sessionStorage` | Only ever sent to `/auth/refresh`, to get a new access token |

A JWT is a signed string carrying `sub` (user id), `email`, `role` and
`employeeId`. The signature is what makes it trustworthy — nobody can forge one
without `JWT_ACCESS_SECRET`.

The refresh token is signed with a *different* secret and carries
`tokenType: 'refresh'`, so an access token cannot be used in its place.

### What the browser does with them

Because the access token lives only in memory, a page reload starts with
nothing. On mount, `frontend/src/lib/auth/auth-provider.tsx` trades the surviving
refresh token for a new access token before deciding you are signed out.

When a request comes back `401`, the axios interceptor refreshes and retries —
once. See [09 · Frontend core](09-FRONTEND-CORE.md).

### `/auth/me` returns more than the token holds

```ts
return { ...user, headedDepartments };
```

`headedDepartments` lists the departments this person **leads**. Leading a
department is authority no role can express, so the UI needs it explicitly to
know whether to offer Approve at all. The API still re-checks it per record —
this is a hint for rendering, never a permission.

The `passwordHash` is excluded by an explicit `select`, not by hoping.

---

## Permissions — `ability.factory.ts`

CASL answers one question: *may this role perform this action on this subject?*

```ts
can('read', 'Payslip', { employeeId: user.employeeId });
//   action    subject    condition
```

### The five roles

| Role | Can do |
|---|---|
| `EMPLOYEE` | Read **their own** employee record, contract, attendance, leave, payslips. Create attendance and leave requests |
| `HR_MANAGER` | Manage all HR data (employees, contracts, schedules, attendance, time off). Read the dashboard. **No payroll** |
| `HR_PAYROLL_USER` | All HR data, plus read/create/update payruns and payslips. Read-only on salary rules |
| `HR_PAYROLL_MANAGER` | Everything HR and payroll, including editing salary rules |
| `ADMIN` | `can('manage', 'all')` — everything, including user accounts |

The split between `HR_PAYROLL_USER` and `HR_PAYROLL_MANAGER` is deliberate: the
person who *runs* payroll each month is not necessarily the person allowed to
change *how salary is calculated*.

### Two layers, only one that counts

Permissions alone are not enough. `can('read', 'Employee')` is true for an
`EMPLOYEE` — but they must see only *themselves*. So list queries for
self-service roles are additionally scoped by `employeeId` in the service.

> **The rule:** the role check says *whether you may use the endpoint*. The
> scoping says *which rows come back*. You need both.

The frontend mirrors the same policy in `frontend/src/lib/abilities/index.ts` —
purely to hide buttons. It protects nothing.

---

## Users vs employees

They are **different things**:

- a `User` is a **login** — an email, a password, a role;
- an `Employee` is a **person** — a name, a department, a contract.

An administrator may be a login with no employee record. An employee may exist
with no login at all (they simply cannot sign in).

`User.employeeId` links them when both exist, and is `unique` so two logins
cannot claim the same person.

> This is why so much code writes `user?.employeeId ?? '__no_employee__'` when
> scoping. If `employeeId` is null and you filter on `undefined`, the filter
> disappears and the query returns **everything**. Matching an impossible id
> returns nothing, which is the safe direction to fail.

---

## Managing accounts — `src/users/`

Admin-only CRUD. Two details worth knowing:

**Deactivate, do not delete.** `DELETE /users/:id` sets `isActive: false`. An
account that approved a leave request last year still has to exist for that
record to make sense.

**`passwordHash` never leaves the server.** Every query uses an explicit
`select` listing the fields to return, rather than `include`, which would sweep
the hash along with everything else.
