"""Unit tests for vocabulary/mapping.py.

All tests are pure-logic and require no database connection.
"""
from __future__ import annotations

import polars as pl
import pytest

from vocabulary.mapping import (
    ETHNICITY_CONCEPT_MAP,
    GENDER_CONCEPT_MAP,
    RACE_CONCEPT_MAP,
    VISIT_CONCEPT_MAP,
    build_source_to_concept_map_df,
    ethnicity_concept_expr,
    gender_concept_expr,
    log_all_concept_zero_rates,
    log_concept_zero_rates,
    race_concept_expr,
    visit_concept_expr,
)


# ---------------------------------------------------------------------------
# Mapping constant sanity checks
# ---------------------------------------------------------------------------


class TestMappingConstants:
    def test_visit_concept_map_contains_standard_ids(self):
        assert VISIT_CONCEPT_MAP["inpatient"] == 9201
        assert VISIT_CONCEPT_MAP["ambulatory"] == 9202
        assert VISIT_CONCEPT_MAP["emergency"] == 9203

    def test_gender_concept_map(self):
        assert GENDER_CONCEPT_MAP["M"] == 8507
        assert GENDER_CONCEPT_MAP["F"] == 8532

    def test_race_concept_map_contains_white(self):
        assert RACE_CONCEPT_MAP["white"] == 8527

    def test_ethnicity_concept_map(self):
        assert ETHNICITY_CONCEPT_MAP["hispanic"] == 38003563
        assert ETHNICITY_CONCEPT_MAP["nonhispanic"] == 38003564


# ---------------------------------------------------------------------------
# visit_concept_expr
# ---------------------------------------------------------------------------


class TestVisitConceptExpr:
    def _apply(self, encounter_classes: list[str]) -> list[int]:
        df = pl.DataFrame({"ENCOUNTERCLASS": encounter_classes})
        return df.with_columns(visit_concept_expr()).get_column("visit_concept_id").to_list()

    def test_inpatient_maps_to_9201(self):
        result = self._apply(["inpatient"])
        assert result == [9201]

    def test_ambulatory_maps_to_9202(self):
        result = self._apply(["ambulatory"])
        assert result == [9202]

    def test_outpatient_maps_to_9202(self):
        result = self._apply(["outpatient"])
        assert result == [9202]

    def test_wellness_maps_to_9202(self):
        result = self._apply(["wellness"])
        assert result == [9202]

    def test_emergency_maps_to_9203(self):
        result = self._apply(["emergency"])
        assert result == [9203]

    def test_urgentcare_maps_to_9203(self):
        result = self._apply(["urgentcare"])
        assert result == [9203]

    def test_unknown_class_maps_to_zero(self):
        result = self._apply(["unknown_type"])
        assert result == [0]

    def test_mixed_classes(self):
        result = self._apply(["inpatient", "ambulatory", "unknown"])
        assert result == [9201, 9202, 0]


# ---------------------------------------------------------------------------
# gender_concept_expr
# ---------------------------------------------------------------------------


class TestGenderConceptExpr:
    def _apply(self, genders: list[str]) -> list[int]:
        df = pl.DataFrame({"GENDER": genders})
        return df.with_columns(gender_concept_expr()).get_column("gender_concept_id").to_list()

    def test_male_maps_to_8507(self):
        assert self._apply(["M"]) == [8507]

    def test_female_maps_to_8532(self):
        assert self._apply(["F"]) == [8532]

    def test_unknown_gender_maps_to_zero(self):
        assert self._apply(["X"]) == [0]

    def test_mixed_genders(self):
        result = self._apply(["M", "F", "M"])
        assert result == [8507, 8532, 8507]


# ---------------------------------------------------------------------------
# race_concept_expr
# ---------------------------------------------------------------------------


class TestRaceConceptExpr:
    def _apply(self, races: list[str]) -> list[int]:
        df = pl.DataFrame({"RACE": races})
        return df.with_columns(race_concept_expr()).get_column("race_concept_id").to_list()

    def test_white_maps_to_8527(self):
        assert self._apply(["white"]) == [8527]

    def test_black_maps_to_8516(self):
        assert self._apply(["black"]) == [8516]

    def test_asian_maps_to_8515(self):
        assert self._apply(["asian"]) == [8515]

    def test_native_maps_to_8657(self):
        assert self._apply(["native"]) == [8657]

    def test_unknown_race_maps_to_zero(self):
        assert self._apply(["other"]) == [0]


# ---------------------------------------------------------------------------
# ethnicity_concept_expr
# ---------------------------------------------------------------------------


class TestEthnicityConceptExpr:
    def _apply(self, ethnicities: list[str]) -> list[int]:
        df = pl.DataFrame({"ETHNICITY": ethnicities})
        return df.with_columns(ethnicity_concept_expr()).get_column("ethnicity_concept_id").to_list()

    def test_hispanic(self):
        assert self._apply(["hispanic"]) == [38003563]

    def test_nonhispanic(self):
        assert self._apply(["nonhispanic"]) == [38003564]

    def test_unknown_ethnicity_maps_to_zero(self):
        assert self._apply(["other"]) == [0]


# ---------------------------------------------------------------------------
# log_concept_zero_rates
# ---------------------------------------------------------------------------


class TestLogConceptZeroRates:
    def test_no_zeros_logs_check_mark(self, capsys):
        df = pl.DataFrame({"concept_id": [1, 2, 3]})
        log_concept_zero_rates("test_table", df, "concept_id")
        captured = capsys.readouterr()
        assert "✓" in captured.out
        assert "0.0%" in captured.out

    def test_all_zeros_logs_warning(self, capsys):
        df = pl.DataFrame({"concept_id": [0, 0, 0]})
        log_concept_zero_rates("test_table", df, "concept_id")
        captured = capsys.readouterr()
        assert "⚠" in captured.out

    def test_empty_df_skips_check(self, capsys):
        df = pl.DataFrame({"concept_id": pl.Series([], dtype=pl.Int64)})
        log_concept_zero_rates("empty_table", df, "concept_id")
        captured = capsys.readouterr()
        assert "skipped" in captured.out.lower() or "no rows" in captured.out.lower()


# ---------------------------------------------------------------------------
# log_all_concept_zero_rates
# ---------------------------------------------------------------------------


class TestLogAllConceptZeroRates:
    def test_returns_rate_dict(self):
        tables = {
            "visits": (pl.DataFrame({"concept_id": [1, 2, 0]}), "concept_id"),
            "conditions": (pl.DataFrame({"concept_id": [1, 2, 3]}), "concept_id"),
        }
        rates = log_all_concept_zero_rates(tables)
        assert "visits" in rates
        assert "conditions" in rates
        assert abs(rates["conditions"] - 0.0) < 0.01
        assert abs(rates["visits"] - (1 / 3 * 100)) < 0.01

    def test_empty_table_returns_zero_rate(self):
        tables = {
            "empty": (pl.DataFrame({"concept_id": pl.Series([], dtype=pl.Int64)}), "concept_id")
        }
        rates = log_all_concept_zero_rates(tables)
        assert rates["empty"] == 0.0


# ---------------------------------------------------------------------------
# build_source_to_concept_map_df
# ---------------------------------------------------------------------------


class TestBuildSourceToConceptMapDf:
    def _code_map(self, codes: list[str], concept_ids: list[int]) -> pl.DataFrame:
        return pl.DataFrame({"code": codes, "concept_id": concept_ids})

    def test_basic_structure(self):
        code_map = self._code_map(["A01", "B02"], [1001, 1002])
        result = build_source_to_concept_map_df(code_map)
        assert result.height == 2
        assert "source_code" in result.columns
        assert "target_concept_id" in result.columns
        assert "valid_start_date" in result.columns
        assert "valid_end_date" in result.columns

    def test_filters_zero_concept_ids(self):
        code_map = self._code_map(["A01", "B02", "C03"], [1001, 0, 1002])
        result = build_source_to_concept_map_df(code_map)
        # Row with concept_id=0 should be excluded
        assert result.height == 2
        assert 0 not in result.get_column("target_concept_id").to_list()

    def test_all_zero_concept_ids_returns_empty(self):
        code_map = self._code_map(["A01", "B02"], [0, 0])
        result = build_source_to_concept_map_df(code_map)
        assert result.height == 0

    def test_source_code_truncated_to_50_chars(self):
        long_code = "X" * 60
        code_map = self._code_map([long_code], [1001])
        result = build_source_to_concept_map_df(code_map)
        source_code = result.get_column("source_code")[0]
        assert len(source_code) <= 50

    def test_source_vocabulary_id_applied(self):
        code_map = self._code_map(["A01"], [1001])
        result = build_source_to_concept_map_df(code_map, source_vocabulary_id="CUSTOM")
        assert result.get_column("source_vocabulary_id")[0] == "CUSTOM"

    def test_source_vocabulary_id_truncated_to_20(self):
        long_vocab = "V" * 30
        code_map = self._code_map(["A01"], [1001])
        result = build_source_to_concept_map_df(code_map, source_vocabulary_id=long_vocab)
        assert len(result.get_column("source_vocabulary_id")[0]) <= 20

    def test_valid_dates_are_present(self):
        code_map = self._code_map(["A01"], [1001])
        result = build_source_to_concept_map_df(code_map)
        assert result.get_column("valid_start_date")[0] == "1970-01-01"
        assert result.get_column("valid_end_date")[0] == "2099-12-31"
