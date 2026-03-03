from __future__ import annotations

import polars as pl


REQUIRED_SYNTHETIC_OPEN_TABLES = (
    "concept",
    "vocabulary",
    "domain",
    "relationship",
    "concept_relationship",
    "concept_synonym",
    "tenant_concept",
)


def validate_no_duplicate_concepts(concept_df: pl.DataFrame) -> list[str]:
    duplicates = concept_df.group_by("concept_id").len().filter(pl.col("len") > 1)
    if duplicates.height == 0:
        return []
    duplicate_ids = duplicates.get_column("concept_id").to_list()
    return [f"Duplicate concept_id values found: {duplicate_ids[:10]}"]


def validate_required_concepts_present(
    concept_df: pl.DataFrame,
    required_ids: set[int],
) -> list[str]:
    available_ids = set(concept_df.get_column("concept_id").to_list())
    missing = sorted(required_ids - available_ids)
    if not missing:
        return []
    return [f"Missing required concept IDs: {missing}"]


def validate_non_empty_tables(
    package: dict[str, pl.DataFrame],
    table_names: tuple[str, ...],
) -> list[str]:
    errors: list[str] = []
    for table_name in table_names:
        table_df = package.get(table_name)
        if table_df is None:
            errors.append(f"Missing vocabulary package table: {table_name}")
            continue
        if table_df.height == 0:
            errors.append(f"Vocabulary package table is empty: {table_name}")
    return errors


def validate_vocabulary_package(
    package: dict[str, pl.DataFrame],
    required_ids: set[int],
) -> list[str]:
    errors: list[str] = []

    concept_df = package.get("concept")
    if concept_df is None:
        return ["Vocabulary package missing required 'concept' DataFrame"]

    errors.extend(validate_no_duplicate_concepts(concept_df))
    errors.extend(validate_required_concepts_present(concept_df, required_ids))
    errors.extend(validate_non_empty_tables(package, REQUIRED_SYNTHETIC_OPEN_TABLES))

    return errors
