#!/bin/bash
# TARX CLI — Quick AI from terminal
# Usage: tarx [command] [args...]

INFERENCE_URL="http://localhost:11435"
MESH_URL="http://localhost:11436"
EMBED_URL="http://localhost:11437"

case "${1:-help}" in
  status)
    echo "TARX System Status"
    echo "=================="
    curl -sf "$INFERENCE_URL/health" > /dev/null 2>&1 && echo "🟢 Inference: Online (port 11435)" || echo "🔴 Inference: Offline (port 11435)"
    curl -sf "$MESH_URL/health" > /dev/null 2>&1 && echo "🟢 Mesh: Online (port 11436)" || echo "🔴 Mesh: Offline (port 11436)"
    curl -sf "$EMBED_URL/health" > /dev/null 2>&1 && echo "🟢 Embeddings: Online (port 11437)" || echo "🔴 Embeddings: Offline (port 11437)"
    ;;
  ask)
    shift
    if [ -z "$*" ]; then
      echo "Usage: tarx ask <your question>"
      exit 1
    fi
    PROMPT=$(echo "$*" | sed 's/"/\\"/g')
    curl -sf "$INFERENCE_URL/v1/chat/completions" \
      -H "Content-Type: application/json" \
      -d "{\"model\":\"qwen\",\"messages\":[{\"role\":\"user\",\"content\":\"$PROMPT\"}],\"max_tokens\":300}" 2>/dev/null \
      | python3 -c "import sys,json; r=json.load(sys.stdin); print(r['choices'][0]['message']['content'])" 2>/dev/null \
      || echo "Error: Could not reach TARX inference server. Run 'tarx status' to check."
    ;;
  models)
    echo "Available Models:"
    curl -sf "$INFERENCE_URL/v1/models" 2>/dev/null \
      | python3 -c "import sys,json; [print(f'  - {m[\"id\"]}') for m in json.load(sys.stdin).get('data',[])]" 2>/dev/null \
      || echo "  Could not fetch models. Is inference running?"
    ;;
  mesh)
    echo "Mesh Network Status:"
    curl -sf "$MESH_URL/mesh/status" 2>/dev/null \
      | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'  Peers: {d.get(\"peers\",0)}'); print(f'  Healthy: {d.get(\"healthy\",False)}')" 2>/dev/null \
      || echo "  Mesh network offline."
    ;;
  help|*)
    echo "TARX CLI v1.0"
    echo ""
    echo "Usage: tarx <command> [args]"
    echo ""
    echo "Commands:"
    echo "  status    Check TARX service health"
    echo "  ask ...   Ask TARX a question"
    echo "  models    List available models"
    echo "  mesh      Show mesh network status"
    echo "  help      Show this help"
    echo ""
    echo "Local. Private. Proactive."
    ;;
esac
