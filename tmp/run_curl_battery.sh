#!/usr/bin/env bash
set -euo pipefail

BASE=${VITE_API_URL:-http://localhost:8001/api/v1}
OUT=/home/elis/projects/mediquery-ai/docs/reports/current/phase7_phase8_curl_battery_2026-03-03.json

TOKEN=$(curl -sS -X POST "$BASE/auth/guest" -H 'Content-Type: application/json' | jq -r '.access_token')

QUERIES=(
  "What are the top 5 most common diagnoses?"
  "Show patient distribution by gender"
  "What medications is the most prescribed?"
  "Average duration of inpatient visits"
  "Show latest blood pressure for each patient"
  "How many patients have both diabetes and hypertension?"
  "List all procedures performed during emergency visits"
  "What is the average number of conditions per patient?"
  "Show drug exposure duration by medication class"
  "Distribution of visit types (inpatient vs outpatient vs ER)"
)

RESULTS_FILE=$(mktemp)
PASSED=0
FAILED=0

for i in "${!QUERIES[@]}"; do
  q="${QUERIES[$i]}"

  THREAD=$(curl -sS -X POST "$BASE/threads/" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    --data "{\"title\":\"battery-$((i+1))\"}" | jq -r '.id')

  TMP=$(mktemp)
  status=$(curl -sS -N --max-time 90 -o "$TMP" -w "%{http_code}" -X POST "$BASE/queries/stream" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    --data "{\"question\":\"$q\",\"thread_id\":\"$THREAD\"}" || true)

  bytes=$(wc -c < "$TMP" | tr -d ' ')
  resultLine=$(grep '"type":"result"' "$TMP" | tail -n 1 || true)

  hasError=false
  rowCount=-1
  if [[ -n "$resultLine" ]]; then
    if echo "$resultLine" | jq -e '.payload.error != null and .payload.error != ""' >/dev/null 2>&1; then
      hasError=true
    fi
    rowCount=$(echo "$resultLine" | jq -r '.payload.data.row_count // -1' 2>/dev/null || echo -1)
  fi

  pass=false
  reason="ok"
  if [[ "$status" != "200" ]]; then
    reason="http_${status}"
  elif [[ -z "$resultLine" ]]; then
    reason="missing_result_event"
  elif [[ "$hasError" == "true" ]]; then
    reason="error_payload"
  else
    pass=true
  fi

  if [[ "$pass" == "true" ]]; then
    PASSED=$((PASSED+1))
  else
    FAILED=$((FAILED+1))
  fi

  jq -nc \
    --argjson index $((i+1)) \
    --arg question "$q" \
    --arg http_status "$status" \
    --argjson passed "$pass" \
    --arg reason "$reason" \
    --argjson bytes "$bytes" \
    --argjson row_count "$rowCount" \
    '{index:$index,question:$question,http_status:$http_status,passed:$passed,reason:$reason,bytes:$bytes,row_count:$row_count}' | jq -c '.' >> "$RESULTS_FILE"

  rm -f "$TMP"
done

jq -n \
  --arg date "$(date -Iseconds)" \
  --arg base "$BASE" \
  --argjson total ${#QUERIES[@]} \
  --argjson passed "$PASSED" \
  --argjson failed "$FAILED" \
  --slurpfile results "$RESULTS_FILE" \
  '{generated_at:$date,base_url:$base,total:$total,passed:$passed,failed:$failed,results:$results}' > "$OUT"

jq '{total,passed,failed}' "$OUT"
rm -f "$RESULTS_FILE"
