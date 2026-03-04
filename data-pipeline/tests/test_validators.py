"""Unit tests for vocabulary/validators.py.

All tests are pure-logic and require no database connection.
"""
from __future__ import annotations

import polars as pl
import pytest

from vocabulary.validators import (
    REQUIRED_SYNTHETIC_OPEN_TABLES,
    validate_no_duplicate_concepts,
    validate_non_empty_tables,
    validate_required_concepts_present,
    validate_vocabulary_package,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _basic_concept_df(concept_ids: list[int]) -> pl.DataFrame:
    return pl.DataFrame(
        {
            "concept_id": concept_ids,
            "concept_name": [f"Concept {cid}" for cid in concept_ids],
        }
    )


def _minimal_package(concept_ids: list[int] | None = None) -> dict[str, pl.DataFrame]:
    """Build a minimal but fully-populated vocabulary package."""
    ids = concept_ids if concept_ids is not None else [1, 2, 3]
    concept_df = _basic_concept_df(ids)
    return {
        "concept": concept_df,
        "vocabulary": pl.DataFrame({"vocabulary_id": ["V1"]}),
        "domain": pl.DataFrame({"domain_id": ["D1"]}),
        "relationship": pl.DataFrame({"relationship_id": ["R1"]}),
        "concept_relationship": pl.DataFrame({"concept_id_1": [1]}),
        "concept_synonym": pl.DataFrame({"concept_id": [1]}),
        "tenant_concept": concept_df,
    }


# ---------------------------------------------------------------------------
# validate_no_duplicate_concepts
# ---------------------------------------------------------------------------


class TestValidateNoDuplicateConcepts:
    def test_no_duplicates_returns_empty(self):
        df = _basic_concept_df([1, 2, 3])
        errors = validate_no_duplicate_concepts(df)
        assert errors == []

    def test_duplicate_concept_id_returns_error(self):
        df = _basic_concept_df([1, 1, 2])
        errors = validate_no_duplicate_concepts(df)
        assert len(errors) == 1
        assert "Duplicate concept_id" in errors[0]
        assert "1" in errors[0]

    def test_multiple_duplicates_include_all_ids(self):
        df = _basic_concept_df([1, 1, 2, 2, 3])
        errors = validate_no_duplicate_concepts(df)
        assert len(errors) == 1
        # Both duplicate IDs should be flagged in the message
        assert "1" in errors[0]
        assert "2" in errors[0]

    def test_empty_dataframe_returns_empty(self):
        df = pl.DataFrame({"concept_id": pl.Series([], dtype=pl.Int64)})
        errors = validate_no_duplicate_concepts(df)
        assert errors == []


# ---------------------------------------------------------------------------
# validate_required_concepts_present
# ---------------------------------------------------------------------------


class TestValidateRequiredConceptsPresent:
    def test_all_present_returns_empty(self):
        df = _basic_concept_df([9201, 9202, 9203])
        errors = validate_required_concepts_present(df, {9201, 9202, 9203})
        assert errors == []

    def test_missing_concept_returns_error(self):
        df = _basic_concept_df([9201, 9202])
        errors = validate_required_concepts_present(df, {9201, 9202, 9203})
        assert len(errors) == 1
        assert "9203" in errors[0]
        assert "Missing required concept IDs" in errors[0]

    def test_empty_required_set_returns_empty(self):
        df = _basic_concept_df([1, 2, 3])
        errors = validate_required_concepts_present(df, set())
        assert errors == []

    def test_empty_df_missing_all_required(self):
        df = pl.DataFrame({"concept_id": pl.Series([], dtype=pl.Int64)})
        errors = validate_required_concepts_present(df, {9201})
        assert len(errors) == 1
        assert "9201" in errors[0]

    def test_superset_concept_df_returns_empty(self):
        df = _basic_concept_df([1, 2, 9201, 9202, 9203])
        errors = validate_required_concepts_present(df, {9201, 9202})
        assert errors == []


# ---------------------------------------------------------------------------
# validate_non_empty_tables
# ---------------------------------------------------------------------------


class TestValidateNonEmptyTables:
    def test_all_tables_present_and_non_empty(self):
        package = {
            "concept": pl.DataFrame({"id": [1]}),
            "vocabulary": pl.DataFrame({"id": [1]}),
        }
        errors = validate_non_empty_tables(package, ("concept", "vocabulary"))
        assert errors == []

    def test_missing_table_returns_error(self):
        package = {"concept": pl.DataFrame({"id": [1]})}
        errors = validate_non_empty_tables(package, ("concept", "vocabulary"))
        assert len(errors) == 1
        assert "vocabulary" in errors[0]
        assert "Missing" in errors[0]

    def test_empty_dataframe_returns_error(self):
        package = {
            "concept": pl.DataFrame({"id": pl.Series([], dtype=pl.Int64)}),
        }
        errors = validate_non_empty_tables(package, ("concept",))
        assert len(errors) == 1
        assert "empty" in errors[0].lower()
        assert "concept" in errors[0]

    def test_subset_of_tables_checked(self):
        package = {
            "concept": pl.DataFrame({"id": [1]}),
            "extra_table": pl.DataFrame({"id": [1]}),
        }
        # Only check "concept" — "extra_table" is not in the tuple
        errors = validate_non_empty_tables(package, ("concept",))
        assert errors == []


# ---------------------------------------------------------------------------
# validate_vocabulary_package
# ---------------------------------------------------------------------------


class TestValidateVocabularyPackage:
    def test_valid_package_returns_no_errors(self):
        from vocabulary.required_concepts import required_concept_ids

        ids = sorted(required_concept_ids())
        package = _minimal_package(ids)
        errors = validate_vocabulary_package(package, required_concept_ids())
        assert errors == [], f"Unexpected errors: {errors}"

    def test_missing_concept_table_returns_error(self):
        package = _minimal_package()
        del package["concept"]
        errors = validate_vocabulary_package(package, {1, 2, 3})
        assert any("concept" in e.lower() for e in errors)

    def test_missing_required_concept_id_returns_error(self):
        package = _minimal_package([1, 2])
        required = {1, 2, 9999}
        errors = validate_vocabulary_package(package, required)
        assert any("9999" in e for e in errors)

    def test_duplicate_concept_id_triggers_error(self):
        package = _minimal_package([1, 1, 2, 3])
        package["concept"] = _basic_concept_df([1, 1, 2])
        errors = validate_vocabulary_package(package, {1, 2})
        assert any("Duplicate" in e for e in errors)

    def test_empty_support_table_triggers_error(self):
        package = _minimal_package([1, 2])
        package["vocabulary"] = pl.DataFrame(
            {"vocabulary_id": pl.Series([], dtype=pl.Utf8)}
        )
        errors = validate_vocabulary_package(package, {1, 2})
        assert any("vocabulary" in e for e in errors)

    def test_required_synthetic_open_tables_constant(self):
        """Confirm the table list used in synthetic_open validation is correct."""
        expected = {
            "concept",
            "vocabulary",
            "domain",
            "relationship",
            "concept_relationship",
            "concept_synonym",
            "tenant_concept",
        }
        assert set(REQUIRED_SYNTHETIC_OPEN_TABLES) == expected
