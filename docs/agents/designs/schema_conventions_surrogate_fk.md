# Schema Conventions and FK Policy

## Purpose

Keep joins deterministic and referential integrity explicit.

## Conventions

- app-data uses stable surrogate PKs
- explicit FKs for relational links
- OMOP-native identifiers remain canonical in OMOP tables

## Join Guidance

- person-level joins on `person_id`
- visit-level joins on `visit_occurrence_id` where applicable
- concept joins on `*_concept_id -> omop_vocab.concept.concept_id`
