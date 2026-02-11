#!/bin/bash
# TARX llama-server Stress Test
# Tests 200 queries against the local llama-server

RESULTS_FILE="/Users/master/Desktop/tarx-code-oss/stress-test-results.json"
TOTAL=200
PASS=0
FAIL=0
TOTAL_TTFT=0

PROMPTS=(
  "What is 2+2?"
  "Explain recursion briefly."
  "Name 3 colors."
  "What is an API?"
  "Define entropy."
  "What year is it?"
  "Write hello world in Python."
  "What is HTTP?"
  "Name a planet."
  "What is RAM?"
)

echo "=== TARX LLama Server Stress Test ==="
echo "Total queries: $TOTAL"
echo "Target: http://localhost:11435/v1/chat/completions"
echo ""

# Check if llama-server is running
if ! curl -s http://localhost:11435/health >/dev/null 2>&1; then
  echo "ERROR: llama-server not running at localhost:11435"
  echo "Start it with: ./extensions/tarx-local/binaries/llama-server-darwin-arm64 --port 11435"
  exit 1
fi

echo "llama-server is running. Starting test..."
echo ""

echo "[" > $RESULTS_FILE
FIRST=true

for i in $(seq 1 $TOTAL); do
  PROMPT="${PROMPTS[$((i % 10))]}"
  START=$(python3 -c "import time; print(int(time.time()*1000))")

  RESPONSE=$(curl -s --max-time 30 -X POST http://localhost:11435/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"local\",\"messages\":[{\"role\":\"user\",\"content\":\"$PROMPT\"}],\"max_tokens\":50}" \
    2>/dev/null)

  END=$(python3 -c "import time; print(int(time.time()*1000))")
  DURATION=$((END - START))

  if echo "$RESPONSE" | grep -q "choices"; then
    PASS=$((PASS + 1))
    TOTAL_TTFT=$((TOTAL_TTFT + DURATION))
    STATUS="pass"
  else
    FAIL=$((FAIL + 1))
    STATUS="fail"
  fi

  # Write to results file
  if [ "$FIRST" = true ]; then
    FIRST=false
  else
    echo "," >> $RESULTS_FILE
  fi
  echo "  {\"query\": $i, \"status\": \"$STATUS\", \"duration_ms\": $DURATION, \"prompt\": \"$PROMPT\"}" >> $RESULTS_FILE

  # Log every 20
  if [ $((i % 20)) -eq 0 ]; then
    if [ $PASS -gt 0 ]; then
      AVG=$((TOTAL_TTFT / PASS))
    else
      AVG=0
    fi
    echo "Progress: $i/$TOTAL | Pass: $PASS | Fail: $FAIL | Avg: ${AVG}ms"
  fi

  # Small delay to avoid overwhelming the server
  sleep 0.05
done

echo "]" >> $RESULTS_FILE

echo ""
echo "=== FINAL RESULTS ==="
echo "Total: $TOTAL"
echo "Pass: $PASS"
echo "Fail: $FAIL"
if [ $PASS -gt 0 ]; then
  AVG=$((TOTAL_TTFT / PASS))
  echo "Avg Response Time: ${AVG}ms"
else
  echo "Avg Response Time: N/A (no successful queries)"
fi
echo "Success Rate: $(( PASS * 100 / TOTAL ))%"
echo ""
echo "Results saved to: $RESULTS_FILE"
