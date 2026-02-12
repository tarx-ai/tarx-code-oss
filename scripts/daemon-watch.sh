#!/usr/bin/env bash
# daemon-watch.sh — Persistent wrapper for tarx-ops MCP server + daemon
#
# Keeps tarx-ops alive, auto-restarts on crash, calls tarx_daemon_start
# via MCP JSON-RPC once the server is up.
#
# Usage:
#   TARX_CREATOR_KEY=<key> ./scripts/daemon-watch.sh           # foreground
#   TARX_CREATOR_KEY=<key> ./scripts/daemon-watch.sh --bg      # background (daemonize)
#   ./scripts/daemon-watch.sh --stop                            # stop running instance
#   ./scripts/daemon-watch.sh --status                          # check if running
#
# Env:
#   TARX_CREATOR_KEY  (required) — auth token for tarx-ops tools
#   SENTRY_AUTH_TOKEN  (optional) — Sentry API integration
#
# Log: ~/Library/Application Support/tarx/daemon.log

set -uo pipefail

# ── Paths ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_JS="$REPO_DIR/extensions/tarx-ops/dist/server.js"
LOG_DIR="$HOME/Library/Application Support/tarx"
LOG_FILE="$LOG_DIR/daemon.log"
PID_FILE="$LOG_DIR/daemon-watch.pid"
KEY_FILE="$HOME/.tarx/creator.key"

RESTART_DELAY=5
MAX_RAPID_RESTARTS=5
RAPID_WINDOW=60

# ── Helpers ──────────────────────────────────────────────────────────────
log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG_FILE"; }

die() { echo "ERROR: $*" >&2; exit 1; }

read_pid() {
  [[ -f "$PID_FILE" ]] && cat "$PID_FILE" 2>/dev/null || echo ""
}

is_running() {
  local pid
  pid=$(read_pid)
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

# ── Commands: --stop, --status ───────────────────────────────────────────
case "${1:-}" in
  --stop)
    pid=$(read_pid)
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "Stopping daemon-watch (PID $pid)..."
      kill "$pid"
      # Wait up to 5s for clean exit
      for _ in 1 2 3 4 5; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 1
      done
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
      rm -f "$PID_FILE"
      echo "Stopped."
    else
      echo "Not running."
      rm -f "$PID_FILE"
    fi
    exit 0
    ;;
  --status)
    pid=$(read_pid)
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "daemon-watch is running (PID $pid)"
      echo "Log: $LOG_FILE"
      echo "--- last 5 lines ---"
      tail -5 "$LOG_FILE" 2>/dev/null || echo "(no log yet)"
    else
      echo "daemon-watch is not running"
      rm -f "$PID_FILE"
    fi
    exit 0
    ;;
  --bg)
    # Re-exec in background, detached from terminal
    shift
    if is_running; then
      echo "Already running (PID $(read_pid))"
      exit 1
    fi
    mkdir -p "$LOG_DIR"
    SELF="$SCRIPT_DIR/daemon-watch.sh"
    echo "Daemonizing..."
    # Use env to ensure TARX_CREATOR_KEY propagates; redirect all IO
    env TARX_CREATOR_KEY="${TARX_CREATOR_KEY:-}" \
      nohup bash "$SELF" "$@" </dev/null >>"$LOG_FILE" 2>&1 &
    sleep 3
    if is_running; then
      echo "daemon-watch started in background (PID $(read_pid))"
      echo "Log: $LOG_FILE"
    else
      echo "Failed to start — check $LOG_FILE"
      exit 1
    fi
    exit 0
    ;;
esac

# ── Pre-flight checks ───────────────────────────────────────────────────
mkdir -p "$LOG_DIR"

[[ -f "$SERVER_JS" ]] || die "tarx-ops not built: $SERVER_JS missing. Run: cd extensions/tarx-ops && npm run build"

# Resolve TARX_CREATOR_KEY: env > file
if [[ -z "${TARX_CREATOR_KEY:-}" ]] && [[ -f "$KEY_FILE" ]]; then
  TARX_CREATOR_KEY="$(cat "$KEY_FILE")"
fi
export TARX_CREATOR_KEY="${TARX_CREATOR_KEY:?Set TARX_CREATOR_KEY env var or create $KEY_FILE}"

# Guard against double-run
if is_running; then
  die "Already running (PID $(read_pid)). Use --stop first."
fi

# ── Cleanup on exit ─────────────────────────────────────────────────────
SERVER_PID=""
FIFO=""

cleanup() {
  log "daemon-watch shutting down (PID $$)"
  # Kill server if still alive
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
  fi
  # Close FIFO fd
  exec 3>&- 2>/dev/null
  [[ -n "$FIFO" ]] && rm -f "$FIFO"
  rm -f "$PID_FILE"
}
trap cleanup EXIT INT TERM

echo $$ > "$PID_FILE"

# ── MCP handshake messages ──────────────────────────────────────────────
MCP_INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"daemon-watch","version":"1.0.0"}}}'
MCP_INITIALIZED='{"jsonrpc":"2.0","method":"notifications/initialized"}'
MCP_DAEMON_START='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"tarx_daemon_start","arguments":{}}}'

# ── Run one server lifecycle ─────────────────────────────────────────────
run_server() {
  FIFO=$(mktemp -u /tmp/tarx-ops-fifo.XXXXXX)
  mkfifo "$FIFO"

  # Start server: stdin from FIFO, stdout silenced (MCP JSON noise), stderr to log
  node "$SERVER_JS" < "$FIFO" > /dev/null 2>> "$LOG_FILE" &
  SERVER_PID=$!

  # Open FIFO write end (unblocks the server's stdin read)
  exec 3>"$FIFO"
  rm -f "$FIFO"  # safe: both ends open, unlink is fine
  FIFO=""

  # Give server a moment to initialize
  sleep 1
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    log "Server exited immediately"
    exec 3>&-
    wait "$SERVER_PID" 2>/dev/null
    return 1
  fi

  # MCP handshake
  printf '%s\n' "$MCP_INIT" >&3
  sleep 0.5
  printf '%s\n' "$MCP_INITIALIZED" >&3
  sleep 0.5

  # Start the daemon
  printf '%s\n' "$MCP_DAEMON_START" >&3
  log "tarx-ops started (PID $SERVER_PID), tarx_daemon_start sent"

  # Wait for server to exit (blocks here)
  wait "$SERVER_PID"
  local exit_code=$?
  SERVER_PID=""

  # Close write end
  exec 3>&-
  return "$exit_code"
}

# ── Main loop with rapid-restart protection ──────────────────────────────
log "============================================"
log "daemon-watch started (PID $$)"
log "  server: $SERVER_JS"
log "  creator_key: SET"
log "  restart_delay: ${RESTART_DELAY}s"
log "============================================"
echo "daemon-watch running (PID $$) — log: $LOG_FILE"

declare -a restart_times=()

while true; do
  # Rapid-restart check: if too many restarts in RAPID_WINDOW, back off
  now=$(date +%s)
  # Prune old timestamps
  fresh=()
  for t in "${restart_times[@]+"${restart_times[@]}"}"; do
    if (( now - t < RAPID_WINDOW )); then
      fresh+=("$t")
    fi
  done
  restart_times=("${fresh[@]+"${fresh[@]}"}")

  if (( ${#restart_times[@]} >= MAX_RAPID_RESTARTS )); then
    backoff=60
    log "WARN: $MAX_RAPID_RESTARTS restarts in ${RAPID_WINDOW}s — backing off ${backoff}s"
    sleep "$backoff"
    restart_times=()
  fi

  run_server || true
  exit_code=$?

  restart_times+=("$(date +%s)")
  log "tarx-ops exited (code $exit_code), restarting in ${RESTART_DELAY}s..."
  sleep "$RESTART_DELAY"
done
