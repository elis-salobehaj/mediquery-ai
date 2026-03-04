"""Unit tests for vocabulary/qa_checks.py data structures.

Tests the pure data-structure layer (QaCheckResult, QaGateSummary,
QaGateFailure) without requiring a live database connection.
"""
from __future__ import annotations

import pytest

from vocabulary.qa_checks import QaCheckResult, QaGateFailure, QaGateSummary


# ---------------------------------------------------------------------------
# QaCheckResult
# ---------------------------------------------------------------------------


class TestQaCheckResult:
    def test_to_dict_contains_all_fields(self):
        result = QaCheckResult(
            check_name="schema_exists:tenant_nexus_health",
            category="schema_integrity",
            passed=True,
            observed_value="exists",
            threshold=None,
            details="",
        )
        d = result.to_dict()
        assert d["check_name"] == "schema_exists:tenant_nexus_health"
        assert d["category"] == "schema_integrity"
        assert d["passed"] is True
        assert d["observed_value"] == "exists"
        assert d["threshold"] is None
        assert d["details"] == ""

    def test_failed_check_to_dict(self):
        result = QaCheckResult(
            check_name="join_coverage:visit_occurrence.visit_concept_id",
            category="fact_vocab_joinability",
            passed=False,
            observed_value="80.0%",
            threshold=">= 95%",
            details="Visit concept join below threshold",
        )
        d = result.to_dict()
        assert d["passed"] is False
        assert d["threshold"] == ">= 95%"
        assert "below threshold" in d["details"]

    def test_defaults(self):
        result = QaCheckResult(
            check_name="test",
            category="schema_integrity",
            passed=True,
        )
        assert result.observed_value is None
        assert result.threshold is None
        assert result.details == ""


# ---------------------------------------------------------------------------
# QaGateSummary
# ---------------------------------------------------------------------------


class TestQaGateSummary:
    def _passed_result(self, name: str = "check_1") -> QaCheckResult:
        return QaCheckResult(check_name=name, category="schema_integrity", passed=True)

    def _failed_result(self, name: str = "check_fail") -> QaCheckResult:
        return QaCheckResult(
            check_name=name,
            category="vocabulary_integrity",
            passed=False,
            threshold="> 0",
            observed_value="0",
        )

    def test_all_passed_true_when_no_failures(self):
        summary = QaGateSummary(
            total=3,
            passed=3,
            failed=0,
            results=[self._passed_result(f"c{i}") for i in range(3)],
        )
        assert summary.all_passed is True

    def test_all_passed_false_when_failures_exist(self):
        summary = QaGateSummary(
            total=2,
            passed=1,
            failed=1,
            results=[self._passed_result(), self._failed_result()],
        )
        assert summary.all_passed is False

    def test_all_passed_true_for_empty_summary(self):
        summary = QaGateSummary()
        assert summary.all_passed is True
        assert summary.total == 0

    def test_to_dict_structure(self):
        summary = QaGateSummary(
            total=1,
            passed=1,
            failed=0,
            results=[self._passed_result()],
        )
        d = summary.to_dict()
        assert d["total"] == 1
        assert d["passed"] == 1
        assert d["failed"] == 0
        assert d["all_passed"] is True
        assert len(d["results"]) == 1
        assert isinstance(d["results"][0], dict)

    def test_to_dict_results_are_serializable(self):
        import json

        summary = QaGateSummary(
            total=2,
            passed=1,
            failed=1,
            results=[self._passed_result("p1"), self._failed_result("f1")],
        )
        # Should not raise
        serialized = json.dumps(summary.to_dict())
        parsed = json.loads(serialized)
        assert parsed["total"] == 2
        assert parsed["all_passed"] is False


# ---------------------------------------------------------------------------
# QaGateFailure
# ---------------------------------------------------------------------------


class TestQaGateFailure:
    def _make_summary_with_failures(self, names: list[str]) -> QaGateSummary:
        results = [
            QaCheckResult(
                check_name=name,
                category="vocabulary_integrity",
                passed=False,
                threshold="> 0",
                observed_value="0",
            )
            for name in names
        ]
        return QaGateSummary(
            total=len(names),
            passed=0,
            failed=len(names),
            results=results,
        )

    def test_carries_summary(self):
        summary = self._make_summary_with_failures(["check_a"])
        exc = QaGateFailure(summary)
        assert exc.summary is summary

    def test_message_includes_failed_check_names(self):
        summary = self._make_summary_with_failures(["missing_concept_ids", "empty_vocab_table"])
        exc = QaGateFailure(summary)
        msg = str(exc)
        assert "missing_concept_ids" in msg
        assert "empty_vocab_table" in msg

    def test_message_includes_failure_count(self):
        summary = self._make_summary_with_failures(["check_1", "check_2"])
        exc = QaGateFailure(summary)
        msg = str(exc)
        assert "2" in msg

    def test_is_runtime_error(self):
        summary = self._make_summary_with_failures(["check_a"])
        exc = QaGateFailure(summary)
        assert isinstance(exc, RuntimeError)

    def test_empty_failures_in_summary(self):
        # Edge case: QaGateFailure raised with 0 failed results
        summary = QaGateSummary(total=0, passed=0, failed=0, results=[])
        exc = QaGateFailure(summary)
        assert exc.summary.failed == 0


# ---------------------------------------------------------------------------
# Integration: summary flow
# ---------------------------------------------------------------------------


class TestQaGateSummaryFlow:
    """Tests mimicking the gate runner accumulation pattern used in main.py."""

    def test_summary_accumulates_correctly(self):
        summary = QaGateSummary()
        checks = [
            QaCheckResult("schema_check", "schema_integrity", passed=True, observed_value="ok"),
            QaCheckResult("vocab_check", "vocabulary_integrity", passed=True, observed_value="ok"),
            QaCheckResult(
                "join_check",
                "fact_vocab_joinability",
                passed=False,
                threshold=">= 95%",
                observed_value="80.0%",
            ),
        ]
        for check in checks:
            summary.results.append(check)
            summary.total += 1
            if check.passed:
                summary.passed += 1
            else:
                summary.failed += 1

        assert summary.total == 3
        assert summary.passed == 2
        assert summary.failed == 1
        assert summary.all_passed is False

    def test_to_dict_round_trip_preserves_all_check_results(self):
        import json

        checks = [
            QaCheckResult("c1", "schema_integrity", passed=True, observed_value="exists"),
            QaCheckResult("c2", "vocabulary_integrity", passed=True, observed_value="52 IDs"),
            QaCheckResult(
                "c3",
                "fact_vocab_joinability",
                passed=False,
                observed_value="80%",
                threshold=">= 95%",
                details="Low coverage",
            ),
        ]
        summary = QaGateSummary(total=3, passed=2, failed=1, results=checks)
        d = json.loads(json.dumps(summary.to_dict()))

        assert d["total"] == 3
        assert len(d["results"]) == 3
        assert d["results"][2]["check_name"] == "c3"
        assert d["results"][2]["passed"] is False
        assert d["results"][2]["details"] == "Low coverage"
