# Workflow Policy (Agent)

## Mandatory Sequence

1. Implement targeted change.
2. Run focused validation (tests, benchmark as needed).
3. Update plan checklist in `docs/plans/active/*`.
4. Update docs if behavior/policy changed.

## Trigger Rules

- Run benchmark for AI SQL behavior changes.
- Update both agent and human docs when both audiences are impacted.
- Update `docs/README.md` when doc navigation or status changes.

## Prohibited Shortcuts

- Marking plan tasks complete without validation evidence.
- Skipping config schema updates for new env keys.
- Manual schema edits outside migration tooling.
