#!/usr/bin/env python3
"""
Full 10-query OMOP battery test using only Python stdlib + curl subprocess.
Replaces the jq-dependent shell script.
"""
import json
import subprocess
import tempfile
import os
import sys
from datetime import datetime, timezone

BASE = os.environ.get("VITE_API_URL", "http://localhost:8001/api/v1")
OUT = "/home/elis-wsl/projects/github/mediquery-ai/docs/reports/current/phase7_phase8_curl_battery_2026-03-03.json"

QUERIES = [
    "What are the top 5 most common diagnoses?",
    "Show patient distribution by gender",
    "What medications is the most prescribed?",
    "Average duration of inpatient visits",
    "Show latest blood pressure for each patient",
    "How many patients have both diabetes and hypertension?",
    "List all procedures performed during emergency visits",
    "What is the average number of conditions per patient?",
    "Show drug exposure duration by medication class",
    "Distribution of visit types (inpatient vs outpatient vs ER)",
]


def curl_json(url, method="GET", data=None, headers=None, token=None):
    cmd = ["curl", "-sS", "-X", method, url, "-H", "Content-Type: application/json"]
    if token:
        cmd += ["-H", f"Authorization: Bearer {token}"]
    if data:
        cmd += ["--data", json.dumps(data)]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    return json.loads(result.stdout)


def get_token():
    resp = curl_json(f"{BASE}/auth/guest", method="POST")
    return resp["access_token"]


def create_thread(token, title):
    resp = curl_json(f"{BASE}/threads/", method="POST", data={"title": title}, token=token)
    return resp["id"]


def run_stream_query(token, thread_id, question, timeout=90):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".txt") as f:
        tmp_path = f.name

    cmd = [
        "curl", "-sS", "-N", "--max-time", str(timeout),
        "-o", tmp_path, "-w", "%{http_code}",
        "-X", "POST", f"{BASE}/queries/stream",
        "-H", f"Authorization: Bearer {token}",
        "-H", "Content-Type: application/json",
        "--data", json.dumps({"question": question, "thread_id": thread_id}),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 10)
    http_status = result.stdout.strip()

    with open(tmp_path, "rb") as f:
        raw = f.read().decode("utf-8", errors="replace")
    os.unlink(tmp_path)

    return http_status, raw


def parse_result(raw):
    """Extract the result event from SSE stream."""
    for line in raw.split("\n"):
        line = line.strip()
        if '"type":"result"' in line:
            if line.startswith("data:"):
                line = line[5:].strip()
            try:
                d = json.loads(line)
                payload = d.get("payload", {})
                error = payload.get("error")
                data = payload.get("data") or {}
                row_count = data.get("row_count", -1)
                sql = payload.get("sql", "")
                return error, row_count, sql
            except json.JSONDecodeError:
                pass
    return None, -1, ""  # no result event found


def main():
    print(f"Battery run against: {BASE}")
    print(f"Output: {OUT}")
    print()

    print("Getting auth token...")
    token = get_token()
    print(f"Token: {token[:25]}...\n")

    results = []
    passed = 0
    failed = 0

    for i, question in enumerate(QUERIES, 1):
        print(f"[{i:2d}/10] {question}")
        thread_id = create_thread(token, f"battery-{i}")
        http_status, raw = run_stream_query(token, thread_id, question)
        bytes_received = len(raw.encode("utf-8"))

        error, row_count, sql = parse_result(raw)
        has_result = error is not None or row_count >= 0

        # Determine pass/fail
        if http_status != "200":
            reason = f"http_{http_status}"
            pass_val = False
        elif not has_result:
            reason = "missing_result_event"
            pass_val = False
        elif error:
            reason = "error_payload"
            pass_val = False
        else:
            reason = "ok"
            pass_val = True

        if pass_val:
            passed += 1
            status_emoji = "✅"
        else:
            failed += 1
            status_emoji = "❌"

        print(f"       {status_emoji} {reason} | rows={row_count} | bytes={bytes_received}")
        if error:
            print(f"       ERROR: {error[:200]}")
        if sql:
            print(f"       SQL: {sql[:120]}...")

        results.append({
            "index": i,
            "question": question,
            "http_status": http_status,
            "passed": pass_val,
            "reason": reason,
            "bytes": bytes_received,
            "row_count": row_count,
        })

    print()
    print(f"{'='*50}")
    print(f"TOTAL: {len(QUERIES)} | PASSED: {passed} | FAILED: {failed}")
    print(f"{'='*50}")

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "base_url": BASE,
        "total": len(QUERIES),
        "passed": passed,
        "failed": failed,
        "results": results,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(output, f, indent=2)
    print(f"Report written to: {OUT}")

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
