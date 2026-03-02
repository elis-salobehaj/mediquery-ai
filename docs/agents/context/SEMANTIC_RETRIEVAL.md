# Semantic Retrieval Context

## Objective

Retrieve high-signal OMOP schema context so generated SQL uses correct tables and joins.

## Must-Have Coverage

- `person`
- `visit_occurrence`
- `condition_occurrence`
- `drug_exposure`
- `measurement`
- `procedure_occurrence`
- `observation`
- `condition_era`
- `drug_era`
- `omop_vocab.concept`

## Rules

- Retrieval output must remain OMOP-only.
- When a question needs labels, retrieval must include concept join path.
- Retrieval should prefer canonical `person_id` / `visit_occurrence_id` paths.
- Retrieval context should bias against unbounded queries.
