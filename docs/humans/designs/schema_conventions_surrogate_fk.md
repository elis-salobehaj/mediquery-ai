# Mediquery Schema Conventions: Surrogate IDs + Foreign Keys

> **Document Purpose**: Define practical primary key, foreign key, and join-key conventions for Mediquery KPI schemas used by agentic Text-to-SQL.
>
> **Last Updated**: February 2026 | **Status**: Active design convention

---

## 1. Goals

- Keep SQL generation stable for the AI workflow.
- Keep ingestion robust for production-grade event data.
- Preserve fast joins on OMOP person identifiers (`person_id`).
- Enforce referential integrity from occurrence tables to `person`.

---

## 2. Key Strategy

### 2.1 Hub Table

- `person` is the OMOP hub table.
- `person.person_id` is the canonical identifier for all cross-table joins.

### 2.2 Table Categories

Use these rules when creating new tables:

- **Person-level summary tables (1 row per person)**
  - Example: `person`, `payer_plan_period`, `specimen`
  - Use `person_id` as the primary key or unique identifier.

- **Occurrence/event tables (many rows per person)**
  - Example: `condition_occurrence`, `drug_exposure`, `measurement`, `visit_occurrence`, `procedure_occurrence`, `observation`
  - Use OMOP native integer PK (e.g., `condition_occurrence_id` as `BIGSERIAL PRIMARY KEY`).
  - Keep `person_id` as a foreign key to `person(person_id)`.

### 2.3 Join Rule (Agent + SQL)

- Join all occurrence and KPI tables to `person` via `person_id`.
- For vocabulary lookups, join via `*_concept_id` to `omop_vocab.concept(concept_id)`.
- Never join by surrogate row IDs across tables.

---

## 3. FK Action Policy

For occurrence-table foreign keys to `person`:

- `ON DELETE CASCADE` (removing a person removes all their clinical events)
- `ON UPDATE CASCADE` (if person_id is corrected, child rows stay linked)

Rationale:

- **CASCADE on delete**: removes orphaned occurrence records when a person is removed.
- **CASCADE on update**: keeps referential integrity if identifiers are corrected.

---

## 4. Index Policy

- Do not add duplicate manual indexes on FK columns if PostgreSQL auto-creates equivalent indexes via the FK constraint.
- Add extra composite indexes only when query patterns require them (e.g., `(person_id, condition_start_date)` for heavy time-window queries).

---

## 5. DDL Authoring Pattern

- Prefer defining FKs inline in `CREATE TABLE` statements.
- Create parent tables before child tables (e.g., `person` before `condition_occurrence`).
- Avoid `ALTER TABLE` FK patches unless needed for migrations on already-deployed schemas.

---

## 6. Agent Prompt Contract Alignment

Any schema key change must update these artifacts together:

- `backend/src/ai/prompts/semantic_view.yaml`
- `backend/src/ai/prompts/system_prompts.yaml`
- `data-pipeline/gold_omop_tenant.sql`
- `data-pipeline/omop_ddl/` (for OMOP tenant schema DDL)

Prompt contract requirements:

- Declare OMOP PKs (e.g., `condition_occurrence_id`) as row-identity only.
- Explicitly instruct SQL writer to join using `person_id` and `*_concept_id` keys.
- Keep concept names as display fields; keep IDs for joins.

---

## 7. Practical Checklist for New Tables

1. Classify table as **person-level summary** or **occurrence/event-level**.
2. Choose PK strategy from Section 2.
3. Add FK to `person` for occurrence tables.
4. Add only non-redundant indexes.
5. Update semantic + system prompts in same change.
6. Recreate DB volume in dev and validate init logs.
