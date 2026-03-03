# Documentation & Workflow

## Documentation Structure

### Primary Files
- **[`docs/README.md`](../README.md)**: Task and plan tracking (start here)
- **[`AGENTS.md`](../../AGENTS.md)**: Agent operating manual (root reference)

### Guides (How-To)
- `docs/guides/GETTING_STARTED.md` - First-time setup
- `docs/guides/DEVELOPMENT.md` - Running and debugging
- `docs/guides/TESTING_GUIDE.md` - Test strategies

### Context (Reference)
- `docs/humans/context/ARCHITECTURE.md` - Stack conventions
- `docs/humans/context/CONFIGURATION.md` - Settings & security
- `docs/humans/context/WORKFLOWS.md` - This file

### Plans
- `docs/plans/active/` - Current implementation plans
- `docs/plans/implemented/` - Completed work
- `docs/plans/backlog/` - Future ideas

---

## Maintenance Rules

### When Completing Tasks
1. **Check off items** in the plan's frontmatter completion list
2. **Update `date_updated`** in plan frontmatter
3. **Update status** in `docs/README.md` table

### When Completing a Plan
1. **Move file** from `plans/active/` to `plans/implemented/`
2. **Update status** to `Implemented` in `docs/README.md`
3. **Archive reports** from `docs/reports/current/` to `docs/reports/archive/{year}/`

### When Creating Artifacts
- **Reports**: Save to `docs/reports/current/`
- **Plans**: Start in `docs/plans/active/`
- **Designs**: Save to `docs/humans/designs/`

---

## Code Review Ignore List

Exclude from AI code suggestions:
- `docs/plans/backlog/` (not active work)
- `docs/reports/archive/` (historical data)
- `*.prompt.md` files (meta-documentation)
