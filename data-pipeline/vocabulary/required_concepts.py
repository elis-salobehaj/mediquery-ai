from __future__ import annotations

from dataclasses import dataclass

import polars as pl


@dataclass(frozen=True)
class RequiredConcept:
    concept_id: int
    concept_name: str
    domain_id: str
    vocabulary_id: str
    concept_class_id: str
    standard_concept: str
    concept_code: str


REQUIRED_CONCEPTS: tuple[RequiredConcept, ...] = (
    RequiredConcept(9201, "Inpatient Visit", "Visit", "Visit", "Visit", "S", "9201"),
    RequiredConcept(
        9202,
        "Outpatient Visit",
        "Visit",
        "Visit",
        "Visit",
        "S",
        "9202",
    ),
    RequiredConcept(
        9203,
        "Emergency Room Visit",
        "Visit",
        "Visit",
        "Visit",
        "S",
        "9203",
    ),
    RequiredConcept(8507, "Male", "Gender", "Gender", "Gender", "S", "8507"),
    RequiredConcept(8532, "Female", "Gender", "Gender", "Gender", "S", "8532"),
    RequiredConcept(8527, "White", "Race", "Race", "Race", "S", "8527"),
    RequiredConcept(8516, "Black", "Race", "Race", "Race", "S", "8516"),
    RequiredConcept(8515, "Asian", "Race", "Race", "Race", "S", "8515"),
    RequiredConcept(
        8657,
        "American Indian or Alaska Native",
        "Race",
        "Race",
        "Race",
        "S",
        "8657",
    ),
    RequiredConcept(
        38003563,
        "Hispanic or Latino",
        "Ethnicity",
        "Ethnicity",
        "Ethnicity",
        "S",
        "38003563",
    ),
    RequiredConcept(
        38003564,
        "Not Hispanic or Latino",
        "Ethnicity",
        "Ethnicity",
        "Ethnicity",
        "S",
        "38003564",
    ),
    RequiredConcept(32817, "EHR encounter record", "Type Concept", "Type Concept", "Type Concept", "S", "32817"),
    RequiredConcept(
        32020,
        "EHR condition record",
        "Type Concept",
        "Type Concept",
        "Type Concept",
        "S",
        "32020",
    ),
    RequiredConcept(
        38000177,
        "Prescription written",
        "Type Concept",
        "Type Concept",
        "Type Concept",
        "S",
        "38000177",
    ),
    RequiredConcept(
        38000275,
        "EHR procedure record",
        "Type Concept",
        "Type Concept",
        "Type Concept",
        "S",
        "38000275",
    ),
)


def required_concept_ids() -> set[int]:
    return {concept.concept_id for concept in REQUIRED_CONCEPTS}


def build_required_concepts_df() -> pl.DataFrame:
    return pl.DataFrame(
        {
            "concept_id": [concept.concept_id for concept in REQUIRED_CONCEPTS],
            "concept_name": [concept.concept_name for concept in REQUIRED_CONCEPTS],
            "domain_id": [concept.domain_id for concept in REQUIRED_CONCEPTS],
            "vocabulary_id": [concept.vocabulary_id for concept in REQUIRED_CONCEPTS],
            "concept_class_id": [concept.concept_class_id for concept in REQUIRED_CONCEPTS],
            "standard_concept": [
                concept.standard_concept for concept in REQUIRED_CONCEPTS
            ],
            "concept_code": [concept.concept_code for concept in REQUIRED_CONCEPTS],
            "valid_start_date": ["1970-01-01" for _ in REQUIRED_CONCEPTS],
            "valid_end_date": ["2099-12-31" for _ in REQUIRED_CONCEPTS],
            "invalid_reason": [None for _ in REQUIRED_CONCEPTS],
        }
    )


def build_vocabulary_df() -> pl.DataFrame:
    rows = [
        ("Visit", "Synthetic Visit Vocabulary", "https://synthea.mitre.org", "2026.03", 0),
        ("Gender", "Synthetic Gender Vocabulary", "https://synthea.mitre.org", "2026.03", 0),
        ("Race", "Synthetic Race Vocabulary", "https://synthea.mitre.org", "2026.03", 0),
        (
            "Ethnicity",
            "Synthetic Ethnicity Vocabulary",
            "https://synthea.mitre.org",
            "2026.03",
            0,
        ),
        (
            "Type Concept",
            "Synthetic Type Concept Vocabulary",
            "https://synthea.mitre.org",
            "2026.03",
            0,
        ),
        ("SNOMED", "Synthetic SNOMED-like Vocabulary", "https://synthea.mitre.org", "2026.03", 0),
    ]
    return pl.DataFrame(
        rows,
        schema=[
            "vocabulary_id",
            "vocabulary_name",
            "vocabulary_reference",
            "vocabulary_version",
            "vocabulary_concept_id",
        ],
        orient="row",
    )


def build_domain_df() -> pl.DataFrame:
    rows = [
        ("Visit", "Visit", 0),
        ("Gender", "Gender", 0),
        ("Race", "Race", 0),
        ("Ethnicity", "Ethnicity", 0),
        ("Type Concept", "Type Concept", 0),
        ("Condition", "Condition", 0),
        ("Drug", "Drug", 0),
        ("Procedure", "Procedure", 0),
        ("Measurement", "Measurement", 0),
        ("Observation", "Observation", 0),
    ]
    return pl.DataFrame(
        rows,
        schema=["domain_id", "domain_name", "domain_concept_id"],
        orient="row",
    )


def build_relationship_df() -> pl.DataFrame:
    rows = [
        ("Maps to", "Maps to", "0", "0", "Mapped from", 0),
        ("Mapped from", "Mapped from", "0", "0", "Maps to", 0),
    ]
    return pl.DataFrame(
        rows,
        schema=[
            "relationship_id",
            "relationship_name",
            "is_hierarchical",
            "defines_ancestry",
            "reverse_relationship_id",
            "relationship_concept_id",
        ],
        orient="row",
    )


def build_concept_relationship_df(concepts_df: pl.DataFrame) -> pl.DataFrame:
    concept_ids = concepts_df.get_column("concept_id").to_list()
    return pl.DataFrame(
        {
            "concept_id_1": concept_ids,
            "concept_id_2": concept_ids,
            "relationship_id": ["Maps to" for _ in concept_ids],
            "valid_start_date": ["1970-01-01" for _ in concept_ids],
            "valid_end_date": ["2099-12-31" for _ in concept_ids],
            "invalid_reason": [None for _ in concept_ids],
        }
    )


def build_concept_synonym_df(concepts_df: pl.DataFrame) -> pl.DataFrame:
    concept_names = concepts_df.get_column("concept_name").to_list()
    concept_ids = concepts_df.get_column("concept_id").to_list()

    return pl.DataFrame(
        {
            "concept_id": concept_ids,
            "concept_synonym_name": [f"{name} (synthetic)" for name in concept_names],
            "language_concept_id": [4180186 for _ in concept_ids],
        }
    )


def merge_required_concepts(synthetic_concepts: pl.DataFrame) -> pl.DataFrame:
    required_df = build_required_concepts_df()
    required_ids = required_concept_ids()

    filtered_synthetic = synthetic_concepts.filter(
        ~pl.col("concept_id").is_in(sorted(required_ids))
    )

    merged = pl.concat([required_df, filtered_synthetic], how="vertical_relaxed")
    return merged.unique(subset=["concept_id"], keep="first")
