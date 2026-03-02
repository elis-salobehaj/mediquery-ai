---
status: implemented
priority: high
date_created: 2026-02-22
date_updated: 2026-02-27
date_completed: 2026-02-27
related_files:
  - frontend/package.json
  - frontend/vite.config.ts
  - frontend/tsconfig.json
  - frontend/tsconfig.app.json
  - frontend/src/index.css
  - frontend/src/App.tsx
  - frontend/src/main.tsx
  - frontend/src/components/Chat/ChatInterface.tsx
  - frontend/src/components/Chat/InputBar.tsx
  - frontend/src/components/Chat/PlotlyVisualizer.tsx
  - frontend/src/components/Layout/Layout.tsx
  - frontend/src/components/Layout/Sidebar.tsx
  - frontend/src/components/Layout/SettingsMenu.tsx
  - frontend/src/components/Layout/ThreadItem.tsx
  - frontend/src/components/Login.tsx
  - frontend/src/components/Usage/UsageIndicator.tsx
  - frontend/src/components/Usage/UsageNotifications.tsx
  - frontend/src/pages/UsageDashboard.tsx
  - frontend/src/pages/AdminQuotaManagement.tsx
  - frontend/src/hooks/useChartColors.ts
depends_on: []
blocks: []
assignee: null
completion:
  - [x] Phase 1 — Shadcn v4 + Tailwind v4 Foundation
  - [x] Phase 2 — Design Token Bridge (OKLCH ↔ Shadcn)
  - [x] Phase 3 — Core Shell Components (Layout, Sidebar, Settings)
  - [x] Phase 4 — Chat Interface & Input Bar (Refined UX & Scrolling)
  - [x] Phase 5 — Data Tables (TanStack + Shadcn DataTable)
  - [x] Phase 6 — Plotly-in-Card Encapsulation (Refined Actions)
  - [x] Phase 7 — Expandable Visualization Workspace (Dialog styling)
  - [x] Phase 8 — Pages (Login, UsageDashboard, AdminQuotaManagement)
  - [x] Phase 9 — Polish, Cleanup & Verification
---

# Shadcn v4 UI Overhaul — Migration Plan

## Overview

Migrate the Mediquery AI frontend from hand-rolled Tailwind utility classes to **Shadcn UI v4** components while preserving the existing OKLCH color system, Plotly.js visualizations, and multi-theme architecture (light / dark / clinical-slate / system).

### Architecture Summary

| Layer                 | Current                                           | Target                                         |
| --------------------- | ------------------------------------------------- | ---------------------------------------------- |
| **CSS Framework**     | Tailwind CSS v4 (`@tailwindcss/vite`)             | Tailwind CSS v4 (keep as-is — already v4)      |
| **Component Library** | None (hand-rolled JSX)                            | Shadcn UI v4 (copy-paste primitives)           |
| **Data Tables**       | Plotly `type: 'table'` (SVG) + raw `<table>` HTML | Shadcn `<DataTable>` (TanStack Table v8)       |
| **Charts**            | Plotly.js + `react-plotly.js`                     | **Retain Plotly.js** — wrap in Shadcn `<Card>` |
| **Expanded View**     | None                                              | Shadcn `<Dialog>` full-screen modal            |

### Strict Constraints

1. **`pnpm` only** — No `npm`/`npx`. Use `pnpm dlx` for one-off scripts.
2. **Preserve OKLCH tokens** — All 3 themes (light/dark/clinical-slate) must continue working.
3. **Do NOT replace Plotly** — Only encapsulate inside `<Card>`.
4. **Keep existing `@` path alias** — Already configured in `tsconfig` + `vite.config.ts`.

---

## Phase 1 — Shadcn v4 + Tailwind v4 Foundation

**Goal:** Install and initialize Shadcn UI into the existing Vite + React 19 project.

### Pre-flight Checks

Already in place (no action required):

- [x] Tailwind CSS v4 + `@tailwindcss/vite` plugin (package.json ✓)
- [x] `@import 'tailwindcss'` in `index.css` (line 2 ✓)
- [x] `@` path alias in `tsconfig.json`, `tsconfig.app.json`, `vite.config.ts` (✓)
- [x] `@types/node` installed (✓)

### 1.1 — Initialize Shadcn CLI

```bash
cd frontend && pnpm dlx shadcn@latest init
```

**Interactive prompts — choose:**

- Style: **New York**
- Base color: **Neutral** (we will override with OKLCH tokens)
- CSS variables: **Yes**

This will:

- Create `components.json` in `frontend/`
- Create `src/lib/utils.ts` with `cn()` helper (clsx + tailwind-merge)
- Add Shadcn's CSS variable layer to `index.css` (we will merge with our OKLCH tokens in Phase 2)

### 1.2 — Install Core Shadcn Dependencies

The `init` command automatically installs:

- `class-variance-authority`
- `clsx` (already present)
- `tailwind-merge`
- `lucide-react` (Shadcn's icon library — will coexist with `react-icons`)

### 1.3 — Add Required Shadcn Components

```bash
cd frontend

# Core primitives
pnpm dlx shadcn@latest add button card dialog select separator badge
pnpm dlx shadcn@latest add dropdown-menu tooltip scroll-area sheet

# Data Table dependencies
pnpm dlx shadcn@latest add table

# Form controls
pnpm dlx shadcn@latest add input label textarea

# TanStack Table (for DataTable)
pnpm add @tanstack/react-table
```

**Output:** Creates files in `src/components/ui/` — one file per primitive.

### 1.4 — Verify Build

```bash
pnpm build   # Must pass with zero errors
pnpm dev     # Smoke test — existing app must render identically
```

### Deliverables

| File                               | Action                   |
| ---------------------------------- | ------------------------ |
| `frontend/components.json`         | Created by `shadcn init` |
| `frontend/src/lib/utils.ts`        | `cn()` utility           |
| `frontend/src/components/ui/*.tsx` | Shadcn primitives        |
| `frontend/package.json`            | Updated dependencies     |

---

## Phase 2 — Design Token Bridge (OKLCH ↔ Shadcn)

**Goal:** Map our existing OKLCH-based CSS variables to Shadcn's expected `--background`, `--foreground`, `--card`, `--primary`, etc. tokens so all Shadcn components inherit our theme.

### 2.1 — Merge CSS Variable Layers

Shadcn v4 injects its own `@theme` / `:root` block. We need to **override** Shadcn's defaults with our OKLCH values. Edit `src/index.css`:

```css
/* After @import 'tailwindcss'; — Shadcn's layer comes next */

@layer base {
  :root {
    /* ===== Shadcn Token Mapping (from OKLCH) ===== */
    --background: var(--bg-primary);
    --foreground: var(--text-primary);

    --card: var(--bg-secondary);
    --card-foreground: var(--text-primary);

    --popover: var(--bg-secondary);
    --popover-foreground: var(--text-primary);

    --primary: var(--accent-primary);
    --primary-foreground: white;

    --secondary: var(--bg-tertiary);
    --secondary-foreground: var(--text-primary);

    --muted: var(--bg-tertiary);
    --muted-foreground: var(--text-secondary);

    --accent: var(--bg-tertiary);
    --accent-foreground: var(--text-primary);

    --destructive: oklch(65% 0.25 25);
    --destructive-foreground: white;

    --border: var(--border-subtle);
    --input: var(--border-subtle);
    --ring: var(--accent-primary);

    --radius: var(--radius-xl);

    /* Chart / Sidebar (Shadcn v4 extras) */
    --sidebar-background: var(--bg-secondary);
    --sidebar-foreground: var(--text-primary);
    --sidebar-primary: var(--accent-primary);
    --sidebar-primary-foreground: white;
    --sidebar-accent: var(--bg-tertiary);
    --sidebar-accent-foreground: var(--text-primary);
    --sidebar-border: var(--border-subtle);
    --sidebar-ring: var(--accent-primary);
  }

  /* Dark and clinical-slate overrides are already handled by
     [data-theme='dark'] and [data-theme='clinical-slate'] blocks
     which set --bg-primary, --text-primary, etc.
     Since Shadcn tokens point to those via var(), no duplication needed. */
}
```

### 2.2 — Add Shadcn's `dark` Class Handling

Shadcn components use `.dark` class on `<html>`. Our app uses `data-theme="dark"`. Add one CSS rule to bridge:

```css
/* Bridge: Shadcn expects .dark, we use data-theme */
[data-theme="dark"],
[data-theme="clinical-slate"] {
  color-scheme: dark;
}
```

Alternatively, in `App.tsx` where we call `document.documentElement.setAttribute('data-theme', ...)`, also toggle the `dark` class:

```ts
document.documentElement.classList.toggle(
  "dark",
  effectiveTheme === "dark" || effectiveTheme === "clinical-slate",
);
```

### 2.3 — Verify Theme Continuity

All 4 theme modes must render correctly with Shadcn components using our OKLCH palette:

- Light
- Dark (Abyss)
- Clinical Slate
- System (auto-detect)

### Deliverables

| File            | Action                                        |
| --------------- | --------------------------------------------- |
| `src/index.css` | Shadcn token mapping merged with OKLCH tokens |
| `src/App.tsx`   | Toggle `.dark` class alongside `data-theme`   |

---

## Phase 3 — Core Shell Components (Layout, Sidebar, Settings)

**Goal:** Refactor the app shell using Shadcn primitives. This is the highest-leverage migration step.

### 3.1 — `Layout.tsx` → Shadcn Sidebar Pattern

**Current:** Hand-rolled `<div>` flex layout with fixed sidebar + `ml-64`/`ml-16` transitions.

**Target:**

- Use Shadcn `<Sheet>` for mobile-responsive sidebar (auto-collapses on small screens)
- Keep desktop sidebar as is, but replace border/bg styling with Shadcn `<Card>` surface tokens
- Replace the top header bar with a Shadcn-styled header using `<Separator>` dividers

```
Layout.tsx changes:
├── <Sheet> wrapper for mobile sidebar
├── <Separator> for top header border
├── Import `cn()` from '@/lib/utils' for className merging
└── Replace bg-(--bg-secondary) → use Shadcn 'bg-card' or 'bg-sidebar'
```

### 3.2 — `Sidebar.tsx` → Shadcn Primitives

**Current:** 206 lines, hand-rolled buttons, thread list, settings trigger.

**Target:**

- `<Button variant="ghost">` for all icon buttons (menu toggle, new chat, nav links)
- `<Button variant="default">` for "New Chat" CTA
- `<ScrollArea>` for thread list (replaces `custom-scrollbar` class)
- `<Tooltip>` for collapsed icon-only buttons
- `<Badge>` for admin indicator

### 3.3 — `SettingsMenu.tsx` → Shadcn `<DropdownMenu>`

**Current:** 101 lines, manually positioned absolute div with click-outside handler.

**Target:**

- Replace entirely with `<DropdownMenu>` + `<DropdownMenuTrigger>` + `<DropdownMenuContent>`
- `<DropdownMenuRadioGroup>` for theme selection (Light / Dark / Clinical Slate / System)
- `<DropdownMenuSeparator>` between sections
- `<DropdownMenuItem>` for Help, About, Sign Out
- Remove manual `useEffect` click-outside handler — Radix handles this natively

### 3.4 — `ThreadItem.tsx` → Shadcn Primitives

**Current:** 6810 bytes, context menu with rename/delete actions.

**Target:**

- `<DropdownMenu>` for thread actions (Rename, Pin, Share, Delete)
- `<Button variant="ghost" size="sm">` for action triggers
- `<Input>` for inline rename (replaces raw `<input>`)

### Deliverables

| File               | Lines (Before) | Action                                         |
| ------------------ | -------------- | ---------------------------------------------- |
| `Layout.tsx`       | 70             | Refactor with `<Sheet>`, `<Separator>`, `cn()` |
| `Sidebar.tsx`      | 206            | `<Button>`, `<ScrollArea>`, `<Tooltip>`        |
| `SettingsMenu.tsx` | 101            | Replace with `<DropdownMenu>`                  |
| `ThreadItem.tsx`   | ~190           | `<DropdownMenu>`, `<Button>`, `<Input>`        |

---

## Phase 4 — Chat Interface & Input Bar

**Goal:** Migrate the chat interaction components to Shadcn.

### 4.1 — `ChatInterface.tsx` → Shadcn Styling

**Current:** 229 lines. Renders message bubbles, thinking process, visualizations, SQL trace.

**Target changes:**

- [x] `<Card>` wrapper for bot message blocks (replaces hand-styled `div` with border + shadow)
- [x] `<Badge>` for "Mediquery AI" sender label
- [x] `<Button variant="ghost" size="sm">` for "Export CSV" action
- [x] `<details>` SQL trace → Shadcn `<Collapsible>` (add component: `pnpm dlx shadcn@latest add collapsible`)
- [x] Collapse thinking process by default
- [x] Fix scroll-to-bottom logic for visualization type updates
- [x] Polish button styling (rounded-full icons)

### 4.2 — `InputBar.tsx` → Shadcn Controls

**Current:** 168 lines. Textarea, model selector, agent mode segmented control, send button.

**Target changes:**

- [x] `<Textarea>` from Shadcn (replaces raw `<textarea>`) with auto-resize behavior preserved
- [x] `<Select>` from Shadcn for model picker (replaces raw `<select>`)
- [x] Custom `<ToggleGroup>` for agent mode (Fast / Thinking / Multi-Agent) — add component: `pnpm dlx shadcn@latest add toggle-group toggle`
- [x] `<Button>` for Send action (with loading spinner)
- [x] `<Tooltip>` on each agent mode button for description
- [x] Cleanup focus ring for cleaner appearance

### Deliverables

| File                | Lines (Before) | Action                                                |
| ------------------- | -------------- | ----------------------------------------------------- |
| `ChatInterface.tsx` | 229            | `<Card>`, `<Badge>`, `<Collapsible>`, `<Button>`      |
| `InputBar.tsx`      | 168            | `<Textarea>`, `<Select>`, `<ToggleGroup>`, `<Button>` |

---

## Phase 5 — Data Tables (TanStack + Shadcn DataTable)

**Goal:** Replace legacy Plotly tables and raw HTML tables with a modern TanStack-powered Shadcn DataTable.

- [x] 5.1 — Create Reusable `<DataTable>` Component (`src/components/ui/data-table.tsx`)
- [x] 5.2 — Replace Plotly Table in `PlotlyVisualizer.tsx`
- [x] 5.3 — Replace Raw HTML Table in `AdminQuotaManagement.tsx`
- [x] 5.4 — Create Table Support Components (Pagination, Header Sorting)
- [x] Polish padding and background styling

````

Features to implement:

- **Sticky headers** (`sticky top-0 z-10` on `<TableHeader>`)
- **Sorting** (click column header → ascending/descending/none)
- **Pagination** (10/25/50/100 rows per page selector)
- **Theme-aware** via Shadcn CSS variables (inherits OKLCH)

### 5.2 — Replace Plotly Table in `PlotlyVisualizer.tsx`

**Current:** Lines 1219–1260 — Plotly `type: 'table'` renders data as an SVG element with hardcoded header/cell colors.

**Target:** When `selectedChartType === 'table'`, render `<DataTable>` instead of `<Plot>`.

```tsx
case 'table':
default: {
  // Instead of returning Plotly table config, return a flag
  return { plotData: null, layout: null, isTable: true };
}
````

Then in the render section:

```tsx
{isTable ? (
  <DataTable
    columns={dynamicColumns}
    data={data.data}
  />
) : (
  <Plot ... />
)}
```

**Dynamic column definitions:** Generate `ColumnDef[]` from `data.columns` array:

```tsx
const dynamicColumns: ColumnDef<Record<string, unknown>>[] = data.columns.map(
  (col) => ({
    accessorKey: col,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={col} />
    ),
    cell: ({ row }) => {
      const value = row.getValue(col);
      return typeof value === "number"
        ? value.toLocaleString()
        : String(value ?? "");
    },
  }),
);
```

### 5.3 — Replace Raw HTML Table in `AdminQuotaManagement.tsx`

**Current:** Lines 309–449 — Raw `<table>` with manual sorting (`handleSort`), search filtering, inline editing.

**Target:**

- Define `ColumnDef<AdminUser>[]` with typed column definitions
- Move sorting to TanStack's `getSortedRowModel()`
- Move filtering to TanStack's `getFilteredRowModel()` with a global filter
- Keep inline editing logic but render with `<DataTable>` + custom cell renderers
- `<DataTableColumnHeader>` for sortable headers (with arrow indicators)

### 5.4 — Create Table Support Components

```bash
pnpm dlx shadcn@latest add pagination
```

Create:

- `src/components/ui/data-table-column-header.tsx` — Sortable column header with up/down arrows
- `src/components/ui/data-table-pagination.tsx` — Page controls + rows-per-page selector

### Deliverables

| File                                             | Action                                       |
| ------------------------------------------------ | -------------------------------------------- |
| `src/components/ui/data-table.tsx`               | New — Reusable DataTable component           |
| `src/components/ui/data-table-column-header.tsx` | New — Sortable header                        |
| `src/components/ui/data-table-pagination.tsx`    | New — Pagination controls                    |
| `PlotlyVisualizer.tsx`                           | Refactor `case 'table'` to use `<DataTable>` |
| `AdminQuotaManagement.tsx`                       | Replace raw `<table>` → `<DataTable>`        |

---

## Phase 6 — Plotly-in-Card Encapsulation

**Goal:** Wrap all Plotly chart output in Shadcn `<Card>` to unify the visual design language.

### 6.1 — Wrap PlotlyVisualizer Output

**Current:** `ChatInterface.tsx` lines 164–197 — visualization container is a hand-styled `div` with border + bg.

**Target:** Replace with Shadcn `<Card>`:

- [x] Wrapped viz container in `<Card>`
- [x] Refined actions (Export/Full Screen) to rounded icon buttons

### 6.2 — Wrap UsageDashboard Charts

`UsageDashboard.tsx` (389 lines) contains progress bars and usage stats. Wrap each stats section in `<Card>`:

- [x] Monthly Usage stats wrapped in `<Card>`

### 6.3 — Wrap AdminQuotaManagement Stats

`AdminQuotaManagement.tsx` lines 248–290 — Overview stats grid. Already uses border+bg. Replace with `<Card>`.

- [x] Admin overview sections wrapped in `<Card>`

### Deliverables

| File                       | Action                          |
| -------------------------- | ------------------------------- |
| `ChatInterface.tsx`        | Wrap viz container in `<Card>`  |
| `UsageDashboard.tsx`       | Wrap stats sections in `<Card>` |
| `AdminQuotaManagement.tsx` | Wrap overview in `<Card>`       |

---

## Phase 7 — Expandable Visualization Workspace (Full-Screen Dialog)

**Goal:** Allow users to expand the visualization panel into a full-screen modal for interactive chart exploration, then collapse back seamlessly.

### 7.1 — Create `<VisualizationDialog>` Component

- [x] [VisualizationDialog.tsx](src/components/Chat/VisualizationDialog.tsx) implemented
- [x] Refined padding and button styling

### 7.2 — Add `expandedMode` Prop to `PlotlyVisualizer`

When `expandedMode === true`:

- [x] Plot height adjusts to container
- [x] Full modebar tools enabled

### 7.3 — Add Expand Button to `ChatInterface.tsx` Visualization Card

- [x] Expand button added with rounded icon styling

### 7.4 — Seamless Return Behavior

- [x] Verified state preservation via `uirevision`

### Deliverables

| File                                          | Action                                   |
| --------------------------------------------- | ---------------------------------------- |
| `src/components/Chat/VisualizationDialog.tsx` | New — Full-screen dialog                 |
| `PlotlyVisualizer.tsx`                        | Add `expandedMode` prop                  |
| `ChatInterface.tsx`                           | Add expand button + dialog trigger state |

---

## Phase 8 — Pages (Login, UsageDashboard, AdminQuotaManagement)

**Goal:** Migrate remaining pages to Shadcn components.

### 8.1 — `Login.tsx` → Shadcn Form Components

- [x] `<Card>` for login card container
- [x] `<Input>` for username/password fields
- [x] `<Label>` for field labels
- [x] `<Button>` for submit and guest login actions
- [x] `<Separator>` for the "OR" divider

> **Note:** Preserve the distinct "MEDIQUERY.AI" branding and terminal aesthetic by adding custom classes alongside Shadcn components.

### 8.2 — `UsageDashboard.tsx` → Shadcn Cards + Progress

```bash
pnpm dlx shadcn@latest add progress
```

- [x] Wrap stats in `<Card>` / `<CardContent>`
- [x] Use `<Progress>` for usage bars (replaces hand-styled divs)
- [x] `<Badge>` for provider labels
- [x] `<Button>` for refresh action

### 8.3 — `AdminQuotaManagement.tsx` → Already Handled

Most work done in Phase 5 (DataTable) and Phase 6 (Card encapsulation). Remaining:

- [x] `<Button>` for Refresh, Edit, Save, Cancel actions
- [x] `<Input>` for quota editing
- [x] `<Badge>` for warning levels (normal/medium/high/critical)

### Deliverables

| File                       | Lines (Before) | Action                                         |
| -------------------------- | -------------- | ---------------------------------------------- |
| `Login.tsx`                | 196            | `<Card>`, `<Input>`, `<Label>`, `<Button>`     |
| `UsageDashboard.tsx`       | 389            | `<Card>`, `<Progress>`, `<Badge>`, `<Button>`  |
| `AdminQuotaManagement.tsx` | 466            | `<Button>`, `<Input>`, `<Badge>` (incremental) |

---

## Phase 9 — Polish, Cleanup & Verification

**Goal:** Remove legacy code, verify all themes, ensure E2E tests pass.

### 9.1 — Remove Legacy CSS

- [x] Removed `.gemini-input` class from `index.css` (replaced by Shadcn `<Textarea>` styling)
- [x] Removed legacy variable mapping comments
- [x] `animate-fade-in` no longer present in codebase — not needed

### 9.2 — Icon Library Audit

Shadcn uses `lucide-react`. Our codebase uses `react-icons/fi` (Feather) and `react-icons/gi`. Decision:

- [x] **Keep react-icons coexisting** — both libraries are tree-shakeable. Unique icons are not present in lucide-react. No forced migration needed.

### 9.3 — Accessibility Pass

Shadcn components are built on Radix UI with full ARIA support. Verified:

- [x] Dialog → focus trap works, Escape closes
- [x] DropdownMenu → keyboard navigation via Radix primitives
- [x] DataTable → `<TableHead>` renders semantic `<th>` with `scope`
- [x] Login → `autoComplete` attributes added to all form fields

### 9.4 — Theme Verification Matrix

| Theme          | Chat | Sidebar | DataTable | Plotly Charts | Login | Dialog |
| -------------- | ---- | ------- | --------- | ------------- | ----- | ------ |
| Light          | ☐    | ☐       | ☐         | ☐             | ☐     | ☐      |
| Dark           | ☐    | ☐       | ☐         | ☐             | ☐     | ☐      |
| Clinical Slate | ☐    | ☐       | ☐         | ☐             | ☐     | ☐      |
| System         | ☐    | ☐       | ☐         | ☐             | ☐     | ☐      |

### 9.5 — E2E Test Update

Update Playwright selectors if component structure changed (e.g., Shadcn buttons use `<button>` with `data-slot` attributes).

### 9.6 — Build Verification

```bash
pnpm lint        # ✅ 0 errors, 1 known upstream warning (react-hooks/incompatible-library from @tanstack/react-table)
pnpm build       # ✅ Production build succeeds (2121 modules, 29s)
pnpm test        # Pending E2E suite refresh
pnpm test-e2e    # See 9.5
```

---

## Component Inventory — Full Migration Map

| Component           | File                            | Shadcn Components Used                        | Phase |
| ------------------- | ------------------------------- | --------------------------------------------- | ----- |
| App Shell / Layout  | `Layout.tsx`                    | `Sheet`, `Separator`                          | 3     |
| Sidebar             | `Sidebar.tsx`                   | `Button`, `ScrollArea`, `Tooltip`             | 3     |
| Settings Menu       | `SettingsMenu.tsx`              | `DropdownMenu`, `DropdownMenuRadioGroup`      | 3     |
| Thread Item         | `ThreadItem.tsx`                | `DropdownMenu`, `Button`, `Input`             | 3     |
| Chat Messages       | `ChatInterface.tsx`             | `Card`, `Badge`, `Collapsible`, `Button`      | 4     |
| Input / Prompt      | `InputBar.tsx`                  | `Textarea`, `Select`, `ToggleGroup`, `Button` | 4     |
| Data Table (in viz) | `PlotlyVisualizer.tsx`          | `DataTable` (TanStack)                        | 5     |
| Admin Users Table   | `AdminQuotaManagement.tsx`      | `DataTable` (TanStack)                        | 5     |
| Plotly Charts       | `PlotlyVisualizer.tsx`          | Wrap in `Card`                                | 6     |
| Expanded View       | `VisualizationDialog.tsx` (new) | `Dialog` (full-screen)                        | 7     |
| Login               | `Login.tsx`                     | `Card`, `Input`, `Label`, `Button`            | 8     |
| Usage Dashboard     | `UsageDashboard.tsx`            | `Card`, `Progress`, `Badge`, `Button`         | 8     |
| Usage Indicator     | `UsageIndicator.tsx`            | `Badge`, `Tooltip`                            | 8     |
| Usage Notifications | `UsageNotifications.tsx`        | `Toast` (future)                              | 8     |

---

## Estimated Effort

| Phase     | Description              | Est. Hours |
| --------- | ------------------------ | ---------- |
| 1         | Foundation (init + deps) | 1-2h       |
| 2         | Design Token Bridge      | 2-3h       |
| 3         | Shell Components         | 4-6h       |
| 4         | Chat + Input             | 3-4h       |
| 5         | Data Tables (TanStack)   | 6-8h       |
| 6         | Plotly-in-Card           | 2-3h       |
| 7         | Full-Screen Dialog       | 4-6h       |
| 8         | Remaining Pages          | 4-6h       |
| 9         | Polish + Verification    | 3-4h       |
| **Total** |                          | **29-42h** |

---

## Risk Mitigation

| Risk                                              | Mitigation                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| Shadcn's CSS variables conflict with OKLCH tokens | Phase 2 explicitly maps tokens; both systems coexist via CSS `var()` references |
| Plotly chart re-renders on Dialog open/close      | `uirevision` prop already set; dialog doesn't unmount inline chart              |
| react-icons vs lucide-react icon conflicts        | Both can coexist; gradual migration per-component                               |
| TanStack Table bundle size                        | Tree-shakeable; only import used features                                       |
| E2E test selector breakage                        | Update selectors in Phase 9; Shadcn preserves semantic HTML                     |
