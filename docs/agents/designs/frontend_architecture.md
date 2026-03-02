# Frontend Architecture Design

## Stack

- React 19
- Vite
- Tailwind CSS v4
- TypeScript

## Responsibilities

- query UX and stream rendering
- thread/history interactions
- usage/token views
- mode/settings controls

## Contract

- frontend calls backend API on port 8001
- backend is source of truth for SQL generation and validation
