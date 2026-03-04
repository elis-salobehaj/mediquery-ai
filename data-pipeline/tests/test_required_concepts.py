"""Unit tests for vocabulary/required_concepts.py.

All tests are pure-logic and require no database connection.
"""
from __future__ import annotations

import polars as pl
import pytest

from vocabulary.required_concepts import (
    REQUIRED_CONCEPTS,
    build_concept_relationship_df,
    build_concept_synonym_df,
    build_domain_df,
    build_relationship_df,
    build_required_concepts_df,
    build_vocabulary_df,
    merge_required_concepts,
    required_concept_ids,
)


# ---------------------------------------------------------------------------
# required_concept_ids
# ---------------------------------------------------------------------------


class TestRequiredConceptIds:
    def test_returns_set_of_ints(self):
        ids = required_concept_ids()
        assert isinstance(ids, set)
        assert all(isinstance(i, int) for i in ids)

    def test_contains_standard_visit_ids(self):
        ids = required_concept_ids()
        assert 9201 in ids  # Inpatient
        assert 9202 in ids  # Outpatient
        assert 9203 in ids  # Emergency

    def test_contains_gender_ids(self):
        ids = required_concept_ids()
        assert 8507 in ids  # Male
        assert 8532 in ids  # Female

    def test_contains_race_ids(self):
        ids = required_concept_ids()
        assert 8527 in ids  # White
        assert 8516 in ids  # Black
        assert 8515 in ids  # Asian
        assert 8657 in ids  # Native

    def test_contains_ethnicity_ids(self):
        ids = required_concept_ids()
        assert 38003563 in ids  # Hispanic
        assert 38003564 in ids  # Not Hispanic

    def test_returns_all_required_concept_ids(self):
        ids = required_concept_ids()
        expected = {c.concept_id for c in REQUIRED_CONCEPTS}
        assert ids == expected

    def test_non_empty(self):
        assert len(required_concept_ids()) > 0


# ---------------------------------------------------------------------------
# build_required_concepts_df
# ---------------------------------------------------------------------------


class TestBuildRequiredConceptsDf:
    def test_non_empty(self):
        df = build_required_concepts_df()
        assert df.height > 0

    def test_has_required_columns(self):
        df = build_required_concepts_df()
        required_cols = {
            "concept_id",
            "concept_name",
            "domain_id",
            "vocabulary_id",
            "concept_class_id",
            "standard_concept",
            "concept_code",
            "valid_start_date",
            "valid_end_date",
            "invalid_reason",
        }
        assert required_cols.issubset(set(df.columns))

    def test_contains_visit_9201(self):
        df = build_required_concepts_df()
        match = df.filter(pl.col("concept_id") == 9201)
        assert match.height == 1
        assert match.get_column("concept_name")[0] == "Inpatient Visit"

    def test_no_duplicate_concept_ids(self):
        df = build_required_concepts_df()
        unique_count = df.get_column("concept_id").n_unique()
        assert unique_count == df.height

    def test_row_count_matches_constant(self):
        df = build_required_concepts_df()
        assert df.height == len(REQUIRED_CONCEPTS)


# ---------------------------------------------------------------------------
# build_vocabulary_df
# ---------------------------------------------------------------------------


class TestBuildVocabularyDf:
    def test_non_empty(self):
        df = build_vocabulary_df()
        assert df.height > 0

    def test_has_vocabulary_id_column(self):
        df = build_vocabulary_df()
        assert "vocabulary_id" in df.columns

    def test_has_visit_vocabulary(self):
        df = build_vocabulary_df()
        vocab_ids = df.get_column("vocabulary_id").to_list()
        assert "Visit" in vocab_ids

    def test_has_gender_vocabulary(self):
        df = build_vocabulary_df()
        vocab_ids = df.get_column("vocabulary_id").to_list()
        assert "Gender" in vocab_ids


# ---------------------------------------------------------------------------
# build_domain_df
# ---------------------------------------------------------------------------


class TestBuildDomainDf:
    def test_non_empty(self):
        df = build_domain_df()
        assert df.height > 0

    def test_has_domain_id_column(self):
        df = build_domain_df()
        assert "domain_id" in df.columns

    def test_includes_clinical_domains(self):
        df = build_domain_df()
        domain_ids = df.get_column("domain_id").to_list()
        for domain in ("Condition", "Drug", "Procedure", "Measurement", "Observation", "Visit"):
            assert domain in domain_ids, f"Missing domain: {domain}"


# ---------------------------------------------------------------------------
# build_relationship_df
# ---------------------------------------------------------------------------


class TestBuildRelationshipDf:
    def test_non_empty(self):
        df = build_relationship_df()
        assert df.height > 0

    def test_has_maps_to_relationship(self):
        df = build_relationship_df()
        rel_ids = df.get_column("relationship_id").to_list()
        assert "Maps to" in rel_ids

    def test_has_mapped_from_relationship(self):
        df = build_relationship_df()
        rel_ids = df.get_column("relationship_id").to_list()
        assert "Mapped from" in rel_ids


# ---------------------------------------------------------------------------
# build_concept_relationship_df
# ---------------------------------------------------------------------------


class TestBuildConceptRelationshipDf:
    def test_one_row_per_concept(self):
        concepts = pl.DataFrame({"concept_id": [1, 2, 3], "concept_name": ["A", "B", "C"]})
        result = build_concept_relationship_df(concepts)
        assert result.height == 3

    def test_self_mapping(self):
        concepts = pl.DataFrame({"concept_id": [9201], "concept_name": ["Inpatient Visit"]})
        result = build_concept_relationship_df(concepts)
        assert result.get_column("concept_id_1")[0] == 9201
        assert result.get_column("concept_id_2")[0] == 9201

    def test_relationship_id_is_maps_to(self):
        concepts = pl.DataFrame({"concept_id": [1], "concept_name": ["X"]})
        result = build_concept_relationship_df(concepts)
        assert result.get_column("relationship_id")[0] == "Maps to"

    def test_empty_concepts_returns_empty(self):
        concepts = pl.DataFrame({
            "concept_id": pl.Series([], dtype=pl.Int64),
            "concept_name": pl.Series([], dtype=pl.Utf8),
        })
        result = build_concept_relationship_df(concepts)
        assert result.height == 0


# ---------------------------------------------------------------------------
# build_concept_synonym_df
# ---------------------------------------------------------------------------


class TestBuildConceptSynonymDf:
    def test_one_row_per_concept(self):
        concepts = pl.DataFrame({
            "concept_id": [1, 2],
            "concept_name": ["Concept One", "Concept Two"],
        })
        result = build_concept_synonym_df(concepts)
        assert result.height == 2

    def test_synonym_name_contains_synthetic(self):
        concepts = pl.DataFrame({
            "concept_id": [9201],
            "concept_name": ["Inpatient Visit"],
        })
        result = build_concept_synonym_df(concepts)
        synonym = result.get_column("concept_synonym_name")[0]
        assert "synthetic" in synonym.lower()
        assert "Inpatient Visit" in synonym

    def test_has_language_concept_id(self):
        concepts = pl.DataFrame({"concept_id": [1], "concept_name": ["X"]})
        result = build_concept_synonym_df(concepts)
        assert "language_concept_id" in result.columns


# ---------------------------------------------------------------------------
# merge_required_concepts
# ---------------------------------------------------------------------------


class TestMergeRequiredConcepts:
    def test_required_ids_always_present(self):
        # Start with synthetic concepts that do NOT overlap required IDs
        synthetic = pl.DataFrame({
            "concept_id": [999991, 999992],
            "concept_name": ["Synthetic A", "Synthetic B"],
            "domain_id": ["Condition", "Condition"],
            "vocabulary_id": ["SNOMED", "SNOMED"],
            "concept_class_id": ["Disorder", "Disorder"],
            "standard_concept": ["S", "S"],
            "concept_code": ["SC001", "SC002"],
            "valid_start_date": ["1970-01-01", "1970-01-01"],
            "valid_end_date": ["2099-12-31", "2099-12-31"],
            "invalid_reason": [None, None],
        })
        merged = merge_required_concepts(synthetic)
        merged_ids = set(merged.get_column("concept_id").to_list())
        for req_id in required_concept_ids():
            assert req_id in merged_ids, f"Required concept {req_id} missing from merged result"

    def test_required_concepts_replace_synthetic_duplicates(self):
        # Synthetic provides concept_id=9201 with a different name — required should win
        synthetic = pl.DataFrame({
            "concept_id": [9201],
            "concept_name": ["Wrong Name"],
            "domain_id": ["Visit"],
            "vocabulary_id": ["Visit"],
            "concept_class_id": ["Visit"],
            "standard_concept": ["S"],
            "concept_code": ["9201"],
            "valid_start_date": ["1970-01-01"],
            "valid_end_date": ["2099-12-31"],
            "invalid_reason": [None],
        })
        merged = merge_required_concepts(synthetic)
        row_9201 = merged.filter(pl.col("concept_id") == 9201)
        assert row_9201.height == 1
        assert row_9201.get_column("concept_name")[0] == "Inpatient Visit"

    def test_no_duplicate_concept_ids_in_merged(self):
        synthetic = pl.DataFrame({
            "concept_id": [999991, 999992],
            "concept_name": ["Syn A", "Syn B"],
            "domain_id": ["Condition", "Condition"],
            "vocabulary_id": ["SNOMED", "SNOMED"],
            "concept_class_id": ["Disorder", "Disorder"],
            "standard_concept": ["S", "S"],
            "concept_code": ["SC001", "SC002"],
            "valid_start_date": ["1970-01-01", "1970-01-01"],
            "valid_end_date": ["2099-12-31", "2099-12-31"],
            "invalid_reason": [None, None],
        })
        merged = merge_required_concepts(synthetic)
        n_unique = merged.get_column("concept_id").n_unique()
        assert n_unique == merged.height

    def test_synthetic_concepts_included_in_merged(self):
        non_overlapping_id = 99999887
        synthetic = pl.DataFrame({
            "concept_id": [non_overlapping_id],
            "concept_name": ["Unique Synthetic"],
            "domain_id": ["Condition"],
            "vocabulary_id": ["SNOMED"],
            "concept_class_id": ["Disorder"],
            "standard_concept": ["S"],
            "concept_code": ["UNIQUE"],
            "valid_start_date": ["1970-01-01"],
            "valid_end_date": ["2099-12-31"],
            "invalid_reason": [None],
        })
        merged = merge_required_concepts(synthetic)
        merged_ids = set(merged.get_column("concept_id").to_list())
        assert non_overlapping_id in merged_ids
