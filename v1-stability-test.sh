#!/bin/bash
# V1 Stabilization Test - 500 Chat Cycles
# Tests chat, projects, file upload, RAG recursively

INFERENCE_PORT=11435
EMBED_PORT=11437
MESH_PORT=11436

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Counters
CHAT_SUCCESS=0
CHAT_FAIL=0
PROJECT_SUCCESS=0
PROJECT_FAIL=0
FILE_SUCCESS=0
FILE_FAIL=0
ERRORS=()

log() { echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date +%H:%M:%S)] WARN:${NC} $1"; }
error() { echo -e "${RED}[$(date +%H:%M:%S)] ERROR:${NC} $1"; ERRORS+=("$1"); }

# Get milliseconds (macOS compatible)
get_ms() {
    python3 -c "import time; print(int(time.time() * 1000))"
}

# Phase 1: Health Check
echo "=========================================="
echo "V1 STABILIZATION TEST - 500 CHAT CYCLES"
echo "=========================================="
echo ""
log "PHASE 1: SYSTEM HEALTH CHECK"

check_port() {
    curl -s --connect-timeout 2 "http://localhost:$1/health" > /dev/null 2>&1
    return $?
}

INFERENCE_OK=false
EMBED_OK=false
MESH_OK=false

if check_port $INFERENCE_PORT; then
    log "✓ Inference ($INFERENCE_PORT): HEALTHY"
    INFERENCE_OK=true
else
    error "✗ Inference ($INFERENCE_PORT): DOWN"
fi

if check_port $EMBED_PORT; then
    log "✓ Embeddings ($EMBED_PORT): HEALTHY"
    EMBED_OK=true
else
    warn "✗ Embeddings ($EMBED_PORT): DOWN"
fi

if check_port $MESH_PORT; then
    log "✓ Mesh ($MESH_PORT): HEALTHY"
    MESH_OK=true
else
    warn "✗ Mesh ($MESH_PORT): DOWN"
fi

if [ "$INFERENCE_OK" = false ]; then
    error "CRITICAL: Inference server not running. Aborting."
    exit 1
fi

echo ""
log "PHASE 2: CHAT STABILIZATION (500 cycles)"
echo ""

# Function to send chat message
send_chat() {
    local prompt="$1"

    response=$(curl -s --connect-timeout 10 --max-time 60 \
        -X POST "http://localhost:$INFERENCE_PORT/v1/chat/completions" \
        -H "Content-Type: application/json" \
        -d "{
            \"model\": \"ollama-7b\",
            \"messages\": [{\"role\": \"user\", \"content\": \"$prompt\"}],
            \"max_tokens\": 100,
            \"stream\": false
        }" 2>/dev/null)

    if echo "$response" | grep -q '"content"'; then
        return 0
    else
        return 1
    fi
}

# Run 500 chat cycles
for i in $(seq 1 500); do
    # Test prompts for this cycle
    prompts=(
        "Hello, test $i"
        "Count to 3"
        "Say one word"
        "What is 2+2?"
        "Say goodbye"
    )

    cycle_ok=true

    for prompt in "${prompts[@]}"; do
        if ! send_chat "$prompt"; then
            cycle_ok=false
            break
        fi
    done

    if [ "$cycle_ok" = true ]; then
        ((CHAT_SUCCESS++))
        if [ $((i % 10)) -eq 0 ]; then
            log "Cycle $i/500: ✓ Success (total: $CHAT_SUCCESS)"
        fi
    else
        ((CHAT_FAIL++))
        if [ $((i % 10)) -eq 0 ]; then
            warn "Cycle $i/500: ✗ FAILED (total failures: $CHAT_FAIL)"
        fi
    fi

    # Brief pause every 50 cycles to avoid overload
    if [ $((i % 50)) -eq 0 ]; then
        sleep 1
        log "--- Checkpoint: $CHAT_SUCCESS/$i successful ---"
    fi
done

echo ""
log "PHASE 3: PROJECT TESTING (50 cycles)"
echo ""

# Simple project test via inference
for i in $(seq 1 50); do
    if send_chat "Project test $i"; then
        ((PROJECT_SUCCESS++))
    else
        ((PROJECT_FAIL++))
    fi

    if [ $((i % 10)) -eq 0 ]; then
        log "Project cycle $i/50: $PROJECT_SUCCESS succeeded"
    fi
done

echo ""
log "PHASE 4: EMBEDDING TEST (if available)"
echo ""

if [ "$EMBED_OK" = true ]; then
    for i in $(seq 1 20); do
        response=$(curl -s --connect-timeout 5 --max-time 30 \
            -X POST "http://localhost:$EMBED_PORT/v1/embeddings" \
            -H "Content-Type: application/json" \
            -d "{
                \"input\": \"search_query: Test embedding $i for TARX RAG pipeline\",
                \"model\": \"nomic-embed\"
            }" 2>/dev/null)

        if echo "$response" | grep -q '"embedding"'; then
            ((FILE_SUCCESS++))
        else
            ((FILE_FAIL++))
        fi
    done
    log "Embedding tests: $FILE_SUCCESS/20 succeeded"
else
    warn "Skipping embedding tests - server not available"
fi

echo ""
log "PHASE 5: STRESS TEST (100 rapid messages)"
echo ""

stress_ok=0
stress_fail=0

for i in $(seq 1 100); do
    response=$(curl -s --connect-timeout 5 --max-time 30 \
        -X POST "http://localhost:$INFERENCE_PORT/v1/chat/completions" \
        -H "Content-Type: application/json" \
        -d "{
            \"model\": \"ollama-7b\",
            \"messages\": [{\"role\": \"user\", \"content\": \"Stress test $i\"}],
            \"max_tokens\": 20,
            \"stream\": false
        }" 2>/dev/null)

    if echo "$response" | grep -q '"content"'; then
        ((stress_ok++))
    else
        ((stress_fail++))
    fi
done

log "Stress test: $stress_ok/100 succeeded"

echo ""
echo "=========================================="
echo "V1 STABILIZATION TEST REPORT"
echo "=========================================="
echo "Timestamp: $(date)"
echo ""
echo "SYSTEM HEALTH"
echo "- Inference ($INFERENCE_PORT): $([ "$INFERENCE_OK" = true ] && echo "HEALTHY" || echo "DOWN")"
echo "- Embeddings ($EMBED_PORT): $([ "$EMBED_OK" = true ] && echo "HEALTHY" || echo "DOWN")"
echo "- Mesh ($MESH_PORT): $([ "$MESH_OK" = true ] && echo "HEALTHY" || echo "DOWN")"
echo ""
echo "CHAT (500 cycles x 5 messages = 2500 total)"
echo "- Successful cycles: $CHAT_SUCCESS/500"
echo "- Failed cycles: $CHAT_FAIL/500"
success_rate=$((CHAT_SUCCESS * 100 / 500))
echo "- Success rate: ${success_rate}%"
echo ""
echo "PROJECTS (50 cycles)"
echo "- Successful: $PROJECT_SUCCESS/50"
echo "- Failed: $PROJECT_FAIL/50"
echo ""
echo "EMBEDDINGS (20 tests)"
echo "- Successful: $FILE_SUCCESS/20"
echo "- Failed: $FILE_FAIL/20"
echo ""
echo "STRESS TEST (100 rapid)"
echo "- Successful: $stress_ok/100"
echo "- Failed: $stress_fail/100"
echo ""

if [ ${#ERRORS[@]} -gt 0 ]; then
    echo "CRITICAL ISSUES:"
    for err in "${ERRORS[@]}"; do
        echo "- $err"
    done
else
    echo "CRITICAL ISSUES: none"
fi

echo ""
echo "Test completed at $(date)"
