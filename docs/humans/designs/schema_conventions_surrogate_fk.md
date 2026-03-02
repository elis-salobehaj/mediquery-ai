# Mediquery Schema Conventions: Surrogate IDs + Foreign Keys

> **Document Purpose**: Define practical primary key, foreign key, and join-key conventions for Mediquery KPI schemas used by agentic Text-to-SQL.
>
> **Last Updated**: February 2026 | **Status**: Active design convention

---

## 1. Goals

- Keep SQL generation stable for the AI workflow.
- Keep ingestion robust for production-grade event data.
- Preserve fast joins on business identifiers (`patient_id`).
- Enforce referential integrity from event tables to `patients`.

---

## 2. Key Strategy

### 2.1 Hub Table

- `patients` remains the hub table.
- `patients.patient_id` is the canonical business key for joins.

### 2.2 Table Categories

Use these rules when creating new tables:

- **Patient-level KPI summary tables (1 row per patient)**
  - Example: `visits`, `billing`, `DIAGNOSIS_STATE_KPIS`
  - Use `patient_id` as the primary key.

- **Event/log/detail tables (many rows per patient, duplicate business-key risk)**
  - Example: `PROCEDURE_TABLES`, `billing`, `WAIT_TIME_ANALYSIS`
  - Use surrogate `BIGINT UNSIGNED AUTO_INCREMENT` as primary key.
  - Keep `patient_id` (or `PROCEDURE_PATIENT_ID`) as a foreign key to `patients(patient_id)`.

### 2.3 Join Rule (Agent + SQL)

- Join event and KPI tables to `patients` via GUID fields.
- Never join by surrogate row IDs.

---

## 3. FK Action Policy

For event-table foreign keys to `patients`:

- `ON UPDATE CASCADE`
- `ON DELETE RESTRICT`

Rationale:

- **CASCADE on update**: if a GUID is corrected, child rows stay linked.
- **RESTRICT on delete**: blocks accidental parent deletion while dependent events exist.

---

## 4. Index Policy

- Do not add duplicate manual indexes on FK columns if InnoDB auto-creates equivalent FK indexes.
- Add extra composite indexes only when query patterns require them (e.g., `(patient_id, START_TIME)` for heavy time-window queries).

---

## 5. DDL Authoring Pattern

- Prefer defining FKs inline in `CREATE TABLE` statements.
- Create parent tables before child tables (e.g., `patients` first).
- Avoid `ALTER TABLE` FK patches unless needed for migrations on already-deployed schemas.

---

## 6. Agent Prompt Contract Alignment

Any schema key change must update these artifacts together:

- `backend/src/ai/prompts/semantic_view.yaml`
- `backend/src/ai/prompts/system_prompts.yaml`
- `infra/mysql/init_02_24_2026.sql`

Prompt contract requirements:

- Declare surrogate IDs as row identity only.
- Explicitly instruct SQL writer to join using GUID keys.
- Keep `patient_name` as display field; keep GUIDs for joins.

---

## 7. Practical Checklist for New Tables

1. Classify table as **patient-level KPI** or **event-level**.
2. Choose PK strategy from Section 2.
3. Add FK to `patients` for event tables.
4. Add only non-redundant indexes.
5. Update semantic + system prompts in same change.
6. Recreate DB volume in dev and validate init logs.
