---
status: in_progress
date_created: 2026-03-24
related_files:
  - biome.json
  - AGENTS.md
  - backend/package.json
  - frontend/package.json
  - packages/db/package.json
  - .github/workflows/ci.yml
---

# Biome Migration Kickoff

## Summary

This report starts Mediquery's Biome migration track using the same shared configuration model already proven in `wellspring-ai`.

## Implemented In This Pass

- Added a repo-root `biome.json` copied from the active Wellspring configuration.
- Swapped TypeScript/JavaScript package scripts from ESLint/Prettier to `pnpm check` and `pnpm check:ci`.
- Added `@biomejs/biome` to `backend`, `frontend`, and `packages/db`.
- Removed legacy ESLint/Prettier config files from active use.
- Added a VS Code Biome binary setting pointing at `backend/node_modules/.bin/biome`.
- Updated core docs and CI so Biome is part of the documented and automated workflow.

## Scope

- `backend/`
- `frontend/`
- `packages/db/`
- root developer tooling and docs

## Validation Targets

- `cd backend && pnpm check:ci`
- `cd frontend && pnpm check:ci`
- `cd packages/db && pnpm check:ci`

## Follow-On Work

- Address any existing Biome warnings surfaced during adoption.
- Replace remaining stale ESLint-specific suppression comments where they still exist outside this initial pass.
- Keep future JS/TS quality-rule changes centralized in the root `biome.json`.