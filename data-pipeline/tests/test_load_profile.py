"""Unit tests for vocabulary/load_profile.py.

All tests are pure-logic and require no database connection.
Settings are patched in conftest.py via os.environ defaults.
"""
from __future__ import annotations

import polars as pl
import pytest

from vocabulary.load_profile import (
    build_synthetic_open_package,
    build_vocabulary_package,
    load_athena_bundle_placeholder,
)
from vocabulary.required_concepts import required_concept_ids
from vocabulary.validators import REQUIRED_SYNTHETIC_OPEN_TABLES


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _empty_synthetic_concepts() -> pl.DataFrame:
    """Minimal concept DataFrame with zero synthetic rows (required only)."""
    return pl.DataFrame(
        {
            "concept_id": pl.Series([], dtype=pl.Int64),
            "concept_name": pl.Series([], dtype=pl.Utf8),
            "domain_id": pl.Series([], dtype=pl.Utf8),
            "vocabulary_id": pl.Series([], dtype=pl.Utf8),
            "concept_class_id": pl.Series([], dtype=pl.Utf8),
            "standard_concept": pl.Series([], dtype=pl.Utf8),
            "concept_code": pl.Series([], dtype=pl.Utf8),
            "valid_start_date": pl.Series([], dtype=pl.Utf8),
            "valid_end_date": pl.Series([], dtype=pl.Utf8),
            "invalid_reason": pl.Series([], dtype=pl.Utf8),
        }
    )


def _synthetic_concepts_with_extra() -> pl.DataFrame:
    """Two non-conflicting synthetic rows."""
    return pl.DataFrame(
        {
            "concept_id": [9999001, 9999002],
            "concept_name": ["Synthetic A", "Synthetic B"],
            "domain_id": ["Condition", "Condition"],
            "vocabulary_id": ["SNOMED", "SNOMED"],
            "concept_class_id": ["Disorder", "Disorder"],
            "standard_concept": ["S", "S"],
            "concept_code": ["SC001", "SC002"],
            "valid_start_date": ["1970-01-01", "1970-01-01"],
            "valid_end_date": ["2099-12-31", "2099-12-31"],
            "invalid_reason": [None, None],
        }
    )


# ---------------------------------------------------------------------------
# build_synthetic_open_package
# ---------------------------------------------------------------------------


class TestBuildSyntheticOpenPackage:
    def test_returns_all_required_table_keys(self):
        package = build_synthetic_open_package(_empty_synthetic_concepts())
        required_keys = set(REQUIRED_SYNTHETIC_OPEN_TABLES)
        assert required_keys.issubset(set(package.keys())), (
            f"Missing keys: {required_keys - set(package.keys())}"
        )

    def test_concept_table_contains_required_ids(self):
        package = build_synthetic_open_package(_empty_synthetic_concepts())
        concept_ids = set(package["concept"].get_column("concept_id").to_list())
        for req_id in required_concept_ids():
            assert req_id in concept_ids, f"Required concept {req_id} missing from package"

    def test_vocabulary_table_non_empty(self):
        package = build_synthetic_open_package(_empty_synthetic_concepts())
        assert package["vocabulary"].height > 0

    def test_domain_table_non_empty(self):
        package = build_synthetic_open_package(_empty_synthetic_concepts())
        assert package["domain"].height > 0

    def test_relationship_table_non_empty(self):
        package = build_synthetic_open_package(_empty_synthetic_concepts())
        assert package["relationship"].height > 0

    def test_concept_relationship_non_empty(self):
        package = build_synthetic_open_package(_empty_synthetic_concepts())
        assert package["concept_relationship"].height > 0

    def test_concept_synonym_non_empty(self):
        package = build_synthetic_open_package(_empty_synthetic_concepts())
        assert package["concept_synonym"].height > 0

    def test_tenant_concept_mirrors_concept(self):
        package = build_synthetic_open_package(_empty_synthetic_concepts())
        assert package["tenant_concept"].height == package["concept"].height

    def test_synthetic_concepts_included(self):
        package = build_synthetic_open_package(_synthetic_concepts_with_extra())
        concept_ids = set(package["concept"].get_column("concept_id").to_list())
        assert 9999001 in concept_ids
        assert 9999002 in concept_ids

    def test_all_tables_are_polars_dataframes(self):
        package = build_synthetic_open_package(_empty_synthetic_concepts())
        for key, value in package.items():
            assert isinstance(value, pl.DataFrame), f"Table '{key}' is not a DataFrame"


# ---------------------------------------------------------------------------
# load_athena_bundle_placeholder
# ---------------------------------------------------------------------------


class TestLoadAthenaBundlePlaceholder:
    def test_raises_not_implemented(self):
        with pytest.raises(NotImplementedError):
            load_athena_bundle_placeholder(None)

    def test_error_message_mentions_placeholder(self):
        with pytest.raises(NotImplementedError, match="placeholder"):
            load_athena_bundle_placeholder("/some/path")


# ---------------------------------------------------------------------------
# build_vocabulary_package
# ---------------------------------------------------------------------------


class TestBuildVocabularyPackage:
    def test_synthetic_open_profile_returns_package_and_ids(self, monkeypatch):
        import vocabulary.load_profile as lp

        monkeypatch.setattr(lp.settings, "pipeline_profile", "synthetic_open")
        monkeypatch.setattr(lp.settings, "athena_profile_enabled", False)

        package, req_ids = build_vocabulary_package(_empty_synthetic_concepts())
        assert isinstance(package, dict)
        assert isinstance(req_ids, set)
        assert len(req_ids) > 0

    def test_synthetic_open_required_ids_match_constants(self, monkeypatch):
        import vocabulary.load_profile as lp

        monkeypatch.setattr(lp.settings, "pipeline_profile", "synthetic_open")
        monkeypatch.setattr(lp.settings, "athena_profile_enabled", False)

        _, req_ids = build_vocabulary_package(_empty_synthetic_concepts())
        assert req_ids == required_concept_ids()

    def test_athena_profile_disabled_raises_runtime_error(self, monkeypatch):
        import vocabulary.load_profile as lp

        monkeypatch.setattr(lp.settings, "pipeline_profile", "athena_permitted")
        monkeypatch.setattr(lp.settings, "athena_profile_enabled", False)

        with pytest.raises(RuntimeError, match="athena_profile_enabled=false"):
            build_vocabulary_package(_empty_synthetic_concepts())
