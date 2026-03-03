#!/usr/bin/env bash
# Debug the two failing queries - capture full result event payloads
set -euo pipefail

BASE=http://localhost:8001/api/v1
OUT=/tmp/debug_queries_result.log

echo "=== Getting token ===" | tee "$OUT"
TOKEN=$(curl -sS -X POST "$BASE/auth/guest" -H 'Content-Type: application/json' | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])")
echo "Token: ${TOKEN:0:20}..." | tee -a "$OUT"

run_query() {
  local label="$1"
  local question="$2"

  echo "" | tee -a "$OUT"
  echo "=== $label: $question ===" | tee -a "$OUT"

  THREAD=$(curl -sS -X POST "$BASE/threads/" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    --data "{\"title\":\"debug-$label\"}" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")

  TMP=$(mktemp)
  status=$(curl -sS -N --max-time 90 -o "$TMP" -w "%{http_code}" -X POST "$BASE/queries/stream" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    --data "{\"question\":\"$question\",\"thread_id\":\"$THREAD\"}" || true)

  echo "HTTP: $status" | tee -a "$OUT"
  echo "Bytes: $(wc -c < "$TMP")" | tee -a "$OUT"

  python3 - "$TMP" << 'PYEOF' | tee -a "$OUT"
import json, sys
fname = sys.argv[1]
with open(fname) as f:
    content = f.read()

for line in content.split('\n'):
    line = line.strip()
    if '"type":"result"' in line:
        if line.startswith('data:'):
            line = line[5:].strip()
        try:
            d = json.loads(line)
            p = d.get('payload', {})
            print('ERROR:', repr(p.get('error')))
            print('SQL:', (p.get('sql') or '')[:1000])
            print('ROW COUNT:', p.get('data', {}).get('row_count') if p.get('data') else 'N/A')
        except Exception as e:
            print('PARSE ERROR:', e)
            print('RAW (first 500):', repr(line[:500]))
    elif '"type":"error"' in line:
        if line.startswith('data:'):
            line = line[5:].strip()
        try:
            d = json.loads(line)
            print('ERROR EVENT:', json.dumps(d, indent=2)[:500])
        except:
            pass
PYEOF

  rm -f "$TMP"
}

run_query "q3" "What medications is the most prescribed?"
run_query "q10" "Distribution of visit types (inpatient vs outpatient vs ER)"

echo ""
echo "=== Done. Full log at $OUT ===" | tee -a "$OUT"
