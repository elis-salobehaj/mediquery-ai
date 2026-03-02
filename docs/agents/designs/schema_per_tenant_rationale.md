# Schema-per-Tenant Rationale

## Decision

Tenant isolation is implemented via schema boundaries.

## Benefits

- reduced cross-tenant leakage risk
- clear operational boundaries for lifecycle tasks

## Requirements

- query paths must target the correct tenant schema
- migration/seed operations must be tenant-aware
- benchmark live mode should specify tenant schema explicitly
