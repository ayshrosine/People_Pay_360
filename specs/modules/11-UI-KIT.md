# 11 · UI kit & design system

The reusable pieces every screen is built from, and the rules that keep them
looking like one product.

---

## The files

| File | Contains |
|---|---|
| `src/app/globals.css` | **Design tokens**, fonts, animations |
| `src/components/ui/primitives.tsx` | Card, Input, Select, Field, Avatar, Tabs, SectionRule |
| `src/components/ui/button.tsx` | Button, with variants |
| `src/components/ui/data-table.tsx` | DataTable, EmptyState, Skeleton |
| `src/components/ui/status.tsx` | StatusChip — the shared status vocabulary |
| `src/components/ui/overlay.tsx` | Dialog, Sheet, DropdownMenu, Popover, Tooltip |
| `src/components/ui/error-fallback.tsx` | What an `error.tsx` renders |
| `src/components/layout/brand.tsx` | Logo mark and product name |
| `src/components/dashboard/widgets.tsx` | KPI rail, charts, gauge |
| `src/components/attendance/attendance-widget.tsx` | The floating clock |
| `src/components/employees/employee-timeline.tsx` | Merged employee history |
| `src/components/employees/department-leadership.tsx` | Head display and appointment |

---

## Tokens, not colours

**Never write a colour in a component.** Every value comes from a token defined
in `globals.css`:

```css
:root {
  --surface-canvas: #fbfbfc;   /* the page behind everything */
  --surface-base:   #ffffff;   /* cards, bars */
  --surface-hover:  #f4f5f7;
  --border-subtle:  rgba(16, 20, 32, 0.08);
  --text-primary:   #101420;
  --text-tertiary:  #6c7387;
  --accent:         #4f46e5;
  …
}
```

Light and dark are **both complete palettes**. Only lightness moves; the hue
holds. A hard-coded colour works in one theme and breaks the other.

Dark is defined twice, on purpose:

```css
:root:not([data-theme="light"]) { @media (prefers-color-scheme: dark) { … } }
:root[data-theme="dark"] { … }
```

The first follows the operating system; the second wins when the user has
chosen explicitly with the theme toggle.

### The four text levels

| Token | Used for |
|---|---|
| `--text-primary` | Names, figures, headings |
| `--text-secondary` | Body text |
| `--text-tertiary` | Descriptions, captions |
| `--text-muted` | Micro-labels, placeholders |

Four levels, used consistently, do the work that a dozen ad-hoc greys do badly.

---

## The ledger rail

The product's signature. Figures render in **tabular JetBrains Mono** inside
hairline-ruled columns:

```css
.ledger-num {
  font-family: var(--font-mono-jb);
  font-variant-numeric: tabular-nums;
}
```

Tabular numerals give every digit the same width, so columns of numbers align
and a changing figure does not shift its neighbours. The same treatment appears
in the KPI strip, every table, and the payslip breakdown — so a number looks
identical wherever you meet it.

---

## Status colour means one thing

`StatusChip` maps every status in the product onto six tones:

| Tone | Means | Examples |
|---|---|---|
| Success | Settled, final | `PAID`, `APPROVED`, `RUNNING`, `ACTIVE` |
| Warning | Waiting on someone | `TO_APPROVE`, `LATE`, `COMPUTING` |
| Danger | Wrong | `ERROR`, `REFUSED`, `ABSENT` |
| Info | In progress | `COMPUTED`, `VALIDATED` |
| Neutral | Inactive | `DRAFT`, `CANCELLED`, `EXPIRED` |
| Accent | Notable | selected, current |

Green means *settled* whether it is an approved leave request, a running
contract, or a paid payslip. Learn it once, read it everywhere.

---

## Depth is borders, not shadows

The interface uses **hairline borders** for separation rather than drop shadows.
Shadows do not read on a dark background, and a dozen shadowed cards look like a
pile rather than a page.

Shadows appear in exactly two places: **overlays** (dialogs, menus — which really
are floating), and **hover lift** on things you can click.

---

## Motion

One easing curve, everywhere:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
```

Fast out of the gate, gentle at the end. `ease-in` is avoided for anything
entering — it delays the frame the user is watching.

### Interaction states

**Buttons** lift a pixel and, on the primary variant, glow in the accent's own
colour rather than casting a grey shadow:

```
'hover:bg-[var(--accent-hover)] hover:-translate-y-px',
'hover:shadow-[0_6px_20px_-8px_var(--accent-ring)]',
'hover:[&_svg:last-child]:translate-x-0.5',
'active:scale-[0.97] active:translate-y-0 active:duration-75',
```

A trailing arrow drifts a hair on hover, so the control reads as one object. The
press state overrides the lift — the button settles *down* under your finger —
and runs faster, because a click should feel immediate.

**Table rows** grow a hairline accent rail on hover, the same device a selected
row uses, so hovering previews the shape of selection:

```
'hover:bg-[var(--surface-hover)] hover:shadow-[inset_2px_0_0_0_var(--accent)]'
```

**Cards** are inert by default. Only `<Card interactive>` reacts:

```tsx
interactive && 'cursor-pointer hover:-translate-y-0.5 hover:border-[var(--border-strong)] …'
```

> If every card responded to the pointer, every dashboard panel would look
> clickable. Only things that *are* targets should behave like targets.

**Inputs** brighten their border on hover and animate border and ring together
on focus, so focus arrives as one movement rather than two.

### Page transitions

```css
@keyframes page-enter {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: none; }
}
```

Applied by `PageShell`, so every route animates identically and no page has to
remember to. 8px over 300ms reads as *"this arrived"* without ever delaying the
content.

### Reduced motion

One global rule honours the operating-system setting:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Because it is global, **every animation added anywhere is covered by default**.

---

## The components

### `DataTable`

Columns are declared as data:

```tsx
<DataTable
  rows={rows}
  loading={query.isLoading}
  rowKey={(row) => row.id}
  onRowClick={(row) => router.push(`/employees/${row.id}`)}
  emptyTitle="No employees match these filters"
  columns={[{ key: 'name', header: 'Employee', cell: (row) => … }]}
/>
```

It handles loading skeletons, the empty state, numeric alignment, and keyboard
access — a clickable row is focusable and responds to Enter.

`emptyTitle` and `emptyDescription` are required for a reason: *"No results"*
tells you nothing, while *"No employees match these filters — adjust the search,
or add your first employee"* tells you what to do.

### `Button`

Variants: `primary`, `secondary`, `ghost`, `danger`, `link`. Sizes `sm`, `md`,
`lg`, `icon`, `icon-sm`.

`loading` shows a spinner and disables the button, so a double-click cannot
submit twice. `asChild` lets a `Link` inherit button styling without nesting an
anchor inside a button.

### `Field`

Label, control, error message, wired together with `htmlFor` and `aria-invalid`
so screen readers announce the error with the input.

### Overlays

Built on Radix primitives, which handle focus trapping, Escape, and returning
focus on close. `DialogContent` requires a `title` and `description` — a dialog
with no accessible name is unusable with a screen reader.

### `Brand`

```tsx
export const APP_NAME = 'Odoo PNX';
```

The name lives in one place, so renaming is a one-line change. `LogoMark` renders
`/icon.svg` — the same file used as the favicon, so the tab icon and the in-app
mark can never drift apart.

### `AttendanceWidget`

A floating clock showing the current time and your open attendance record. The
clock uses `useSyncExternalStore` with a `null` server snapshot:

> The time on the server is not the time in the browser. Rendering it during SSR
> guarantees a hydration mismatch. `useSyncExternalStore` with a null server
> snapshot renders nothing on the server and the live clock on the client.

---

## Accessibility, as a rule

- Every icon-only button has an `aria-label`.
- Every decorative icon has `aria-hidden`.
- Focus is visible: `focus-visible:outline-2 focus-visible:outline-[var(--accent-ring)]`.
- Colour is never the only signal — status chips carry text as well as tone.
- Clickable table rows are focusable and keyboard-operable.
- Interactive targets are at least 32px, most 36–40px.
