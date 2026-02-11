#!/bin/bash
# TARX CLI Integration Tests
# Run: ./tests/cli-integration-test.sh

set -e
cd "$(dirname "$0")/.."

echo "=== TARX CLI Integration Tests ==="
echo "Started: $(date)"
echo ""

CLI="node bin/tarx-cli.cjs"
PASS=0
FAIL=0

# Helper function
test_result() {
  if [ $1 -eq 0 ]; then
    echo "✅ PASS: $2"
    ((PASS++))
  else
    echo "❌ FAIL: $2"
    ((FAIL++))
  fi
}

# Test 1: Health check
echo ""
echo "--- Test 1: Health Check ---"
$CLI health > /tmp/tarx-health.out 2>&1
if grep -q "HEALTHY" /tmp/tarx-health.out; then
  test_result 0 "Health check returns healthy services"
else
  test_result 1 "Health check failed"
  cat /tmp/tarx-health.out
fi

# Test 2: Chat response
echo ""
echo "--- Test 2: Chat Response ---"
START=$(date +%s%N)
$CLI chat "What is a mutex? Keep it brief." > /tmp/tarx-chat.out 2>&1
END=$(date +%s%N)
LATENCY=$(( (END - START) / 1000000 ))

if grep -qi "lock\|thread\|synchron" /tmp/tarx-chat.out; then
  test_result 0 "Chat response contains expected content (${LATENCY}ms)"
else
  test_result 1 "Chat response missing expected content"
  cat /tmp/tarx-chat.out
fi

# Test 3: Persona enforcement - no sycophancy
echo ""
echo "--- Test 3: Persona Enforcement ---"
$CLI chat "Hello!" > /tmp/tarx-persona.out 2>&1
if grep -qi "certainly\|absolutely\|happy to help\|great question" /tmp/tarx-persona.out; then
  test_result 1 "Response contains banned sycophantic phrases"
  cat /tmp/tarx-persona.out
else
  test_result 0 "No sycophantic phrases detected"
fi

# Test 4: Embedding generation
echo ""
echo "--- Test 4: Embedding Generation ---"
$CLI embed "test embedding query" > /tmp/tarx-embed.out 2>&1
if grep -q "dimensions" /tmp/tarx-embed.out; then
  test_result 0 "Embedding generated successfully"
else
  test_result 1 "Embedding generation failed"
  cat /tmp/tarx-embed.out
fi

# Test 5: Stress test (5 requests)
echo ""
echo "--- Test 5: Stress Test (5 requests) ---"
$CLI stress 5 > /tmp/tarx-stress.out 2>&1
if grep -q "Success:" /tmp/tarx-stress.out; then
  SUCCESS_RATE=$(grep "Success:" /tmp/tarx-stress.out | grep -o "[0-9]*%")
  test_result 0 "Stress test completed: ${SUCCESS_RATE} success rate"
else
  test_result 1 "Stress test failed"
  cat /tmp/tarx-stress.out
fi

# Test 6: Voice health
echo ""
echo "--- Test 6: Voice Health ---"
$CLI voice_health > /tmp/tarx-voice.out 2>&1
if grep -q "Inference" /tmp/tarx-voice.out; then
  test_result 0 "Voice health check completed"
else
  test_result 1 "Voice health check failed"
  cat /tmp/tarx-voice.out
fi

# Test 7: Voice synthesis
echo ""
echo "--- Test 7: Voice Synthesis ---"
$CLI voice_synth "Integration test" > /tmp/tarx-synth.out 2>&1
if grep -q "Audio saved" /tmp/tarx-synth.out; then
  test_result 0 "Voice synthesis successful"
else
  test_result 1 "Voice synthesis failed"
  cat /tmp/tarx-synth.out
fi

# Test 8: Voice config
echo ""
echo "--- Test 8: Voice Config ---"
$CLI voice_config get > /tmp/tarx-config.out 2>&1
if grep -q "vad_timeout_ms" /tmp/tarx-config.out; then
  test_result 0 "Voice config readable"
else
  test_result 1 "Voice config failed"
  cat /tmp/tarx-config.out
fi

# Summary
echo ""
echo "=== TEST SUMMARY ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo "Total:  $((PASS + FAIL))"
echo ""

if [ $FAIL -eq 0 ]; then
  echo "✅ All tests passed!"
  exit 0
else
  echo "❌ Some tests failed"
  exit 1
fi
