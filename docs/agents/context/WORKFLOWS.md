# Engineering Workflows

## Documentation Workflow (Mandatory)

For any behavior change:

1. update relevant context/design docs,
2. update active plan checklist,
3. update docs index when plan status changes.

## Backend Workflow

1. `cd backend && pnpm install`
2. implement
3. run focused tests
4. run benchmark if AI/prompt/schema behavior changed
5. update docs/plans

## Data Pipeline Workflow

1. `cd data-pipeline && uv sync`
2. run pipeline DB stack
3. run migration/load pipeline
4. verify gold OMOP output

## Forbidden Shortcuts

- skipping schema-based config updates for new env keys
- manual DB schema edits outside migration tooling
- marking plan phases complete without validation evidence
