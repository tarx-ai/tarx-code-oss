# TARX Protocol Manifest v1.0

The TARX Protocol defines the dispatch layer between TARX (local AI) and Claude Code (executor).
This is the foundation for self-healing and the universal agent-to-executor protocol.

---

## Error Taxonomy

| ID | Signatures | Severity | Strategy |
|----|-----------|----------|----------|
| `build.compile` | `error TS\d+`, `Cannot find module`, `Type.*not assignable` | high | `compile_fix` |
| `build.lint` | `eslint`, `prettier`, `unused` | low | `lint_fix` |
| `runtime.crash` | `ECONNREFUSED`, `process exited`, `FATAL` | critical | `health_fix` |
| `runtime.logic` | `duplicate`, `empty render`, `undefined is not` | medium | `runtime_fix` |
| `integration.mcp` | `MCP.*failed`, `tool.*not found`, `schema.*mismatch` | medium | `integration_fix` |
| `integration.native_module` | `ERR_DLOPEN_FAILED`, `MODULE_VERSION`, `node-gyp` | medium | `native_fix` |
| `security.exposure` | `token.*exposed`, `secret.*commit`, `api.key` | critical | `security_fix` |

Classification confidence: exact regex match = 1.0, partial = 0.7, fallback = 0.3.
Fallback taxonomy: `general` → `general_fix`.

---

## Primitives

Atomic operations that CC executes. Each maps to a prompt template.

| Primitive | Purpose | Key Params |
|-----------|---------|------------|
| `READ` | Read and understand files | `file_path` |
| `DIAGNOSE` | Analyze error, identify root cause | `error_message` |
| `PATCH` | Apply targeted fix | `file_path`, `instruction` |
| `VERIFY` | Run command, confirm success | `command` |
| `COMMIT` | Stage and commit fix | `message` |
| `ROLLBACK` | Undo all changes | — |
| `NOTIFY` | Send notification | `message` |
| `RESTART` | Kill and restart service | `port` |
| `HEALTH_CHECK` | Verify service health | `port` |

---

## Strategies

Composed sequences of primitives. Each strategy handles a taxonomy category.

### `compile_fix` (max 3 attempts)
1. VERIFY — run `yarn compile`, capture errors
2. READ — read the failing file
3. DIAGNOSE — analyze the compile error
4. PATCH — fix the code
5. VERIFY — confirm `yarn compile` passes
6. COMMIT — commit the fix
- On failure: ROLLBACK → NOTIFY

### `health_fix` (max 2 attempts)
1. HEALTH_CHECK — check service status
2. DIAGNOSE — analyze why it's down
3. RESTART — restart the service
4. HEALTH_CHECK — confirm it's back
- On failure: NOTIFY

### `runtime_fix` (max 3 attempts)
1. READ — read the failing code
2. DIAGNOSE — analyze runtime error
3. PATCH — fix the bug
4. VERIFY — confirm build passes
5. COMMIT — commit the fix
- On failure: ROLLBACK → NOTIFY

### `native_fix` (max 1 attempt)
1. DIAGNOSE — identify the native module issue
2. VERIFY — run npm rebuild
3. VERIFY — confirm build passes
4. COMMIT — commit dependency fix
- On failure: NOTIFY

### `integration_fix` (max 2 attempts)
1. READ — read the MCP server code
2. DIAGNOSE — analyze integration error
3. PATCH — fix the integration
4. VERIFY — confirm build passes
5. COMMIT — commit the fix
- On failure: NOTIFY

### `security_fix` (max 1 attempt, REQUIRES APPROVAL)
1. READ — read the exposed code
2. DIAGNOSE — analyze the security issue
3. NOTIFY — alert human, HALT
- On failure: NOTIFY

### `emergency` (max 1 attempt)
1. ROLLBACK — undo all changes
2. NOTIFY — alert human

### `lint_fix` (max 1 attempt)
1. VERIFY — run linter
2. PATCH — fix lint issues
3. VERIFY — confirm build passes
4. COMMIT — commit lint fix
- On failure: NOTIFY

### `general_fix` (max 2 attempts)
1. READ — read relevant code
2. DIAGNOSE — analyze the error
3. PATCH — apply fix
4. VERIFY — confirm build passes
5. COMMIT — commit the fix
- On failure: NOTIFY

---

## Circuit Breaker Rules

- **Max 3 attempts** per unique error (taxonomy_id + error hash)
- **1 hour cooldown** after max attempts reached
- **20 dispatches/hour** global rate limit
- State persisted to `~/.tarx/breaker.json`
- Reset: `tarx breaker-reset [signature]`

---

## Notification Channels

| Level | Log | Thinking Tab | SMS |
|-------|-----|-------------|-----|
| `info` | yes | yes | no |
| `success` | yes | yes | yes |
| `warning` | yes | yes | yes |
| `blocked` | yes | yes | yes (repeat 5min) |
| `error` | yes | yes | no |

SMS rate limit: max 10/hour.
SMS format: `TARX {emoji}: {message}` (≤160 chars).

---

## CLI Commands

```
tarx dispatch <prompt>    — Send prompt to Claude Code, stream output
tarx status               — Health check all services (ports 11435-11438)
tarx log                  — Tail dispatch log
tarx heal                 — Run self-healing cycle (health check → classify → fix)
tarx notify <message>     — Send notification via all channels
tarx brief [--weekly] [--sms] — Daily briefing (chief of staff voice, add --sms to send)
tarx priorities           — Show open/done priorities from ~/.tarx/priorities.jsonl
tarx taxonomy             — Print error taxonomy tree
tarx strategy <name>      — Print strategy definition
tarx wake                 — Trigger one heartbeat tick (immediate, for testing)
tarx think [n] [--follow] — Tail thinking log (TARX consciousness stream)
```

---

## Dispatch Protocol

1. User/TARX calls `tarx dispatch <prompt>` or `selfHeal.handleError(error)`
2. Prompt is sent to CC via `claude -p <prompt>` (child process)
3. CC executes in `~/Desktop/tarx-code-oss/` working directory
4. Stdout streamed in real-time, logged to `~/.tarx/dispatch.log`
5. Exit code 0 = success, non-zero = failure
6. 5 minute timeout, process killed on timeout

---

## Self-Healing Flow

```
Error detected
  → classify(error) → TaxonomyNode
  → circuitBreaker.check(signature)
    → blocked? → notify('blocked', reason) → STOP
  → queryRAG(error) → relevant context
  → compose(strategy, variables, ragContext) → prompt
  → dispatch(prompt) → result
  → result.success?
    → yes: notify('success', summary) → DONE
    → no: circuitBreaker.record(signature) → retry or escalate
```

---

## File Layout

```
extensions/tarx/src/services/
  taxonomy.ts           — Error classification engine
  strategyCompositor.ts — Prompt composition from primitives
  circuitBreaker.ts     — Infinite loop prevention
  notify.ts             — Notification routing (log, thinking tab, SMS)
  selfHeal.ts           — Orchestrator (wires everything together)

extensions/tarx-cli/src/
  dispatch.ts           — Core CC dispatch function
  cli.ts                — CLI entry point (tarx command)
```

---

## Heartbeat Daemon

TARX draws energy, therefore it runs. It's always thinking, but not always acting.
The heartbeat is TARX breathing. Escalation is TARX reacting.

### Schedule

Runs every 5 minutes via macOS launchd (`com.tarx.heartbeat.plist`).
No runtime daemon. No persistent Node process. launchd handles scheduling and survives reboots.

### Each Tick

1. **Port checks** — curl localhost:{11435,11436,11437}/health (3s timeout)
2. **Git status** — any uncommitted changes in ~/Desktop/tarx-code-oss/
3. **Breaker read** — read ~/.tarx/breaker.json if exists
4. **Sentry poll** — 1 API call to GET unresolved issues since last check
5. **Write** — append all results to ~/.tarx/thinking.log

### Escalation Rules (ONLY these trigger action)

| Condition | Action |
|-----------|--------|
| Any port DOWN | `tarx heal` (auto-recovery attempt) |
| Sentry CRITICAL/ERROR (new since last tick) | `tarx dispatch "fix: {issue title}"` |
| Breaker hot (>15 of 20 hourly limit) | `tarx notify "breaker hot"` |
| Everything else | Log and rest. No dispatch. No cost. |

### Thinking Log

Stream of consciousness at `~/.tarx/thinking.log`. View with `tarx think`.

```
[2026-02-20T12:00:00Z] Ports: 3/3 up. Git: clean. Sentry: 0 new. Breaker: 0/20. Resting.
[2026-02-20T12:05:00Z] ⚠️ Port 11437 DOWN. Attempting heal...
[2026-02-20T12:05:03Z] ✅ Heal command completed for Embeddings. Verifying...
[2026-02-20T12:10:00Z] 🔴 Sentry CRITICAL: 'TypeError in inference_engine'. Dispatching fix.
```

Rotation: max 10MB or 7 days → rotates to thinking.log.1 (1 backup kept).

### Cost When Healthy

- Port checks: $0 (localhost)
- Git status: $0 (local)
- Breaker read: $0 (local file)
- Sentry poll: ~288 calls/day (free tier)
- Escalation: only on real problems (0-5/day typical)
- **Total daily cost when healthy: $0**

### Installation

```bash
cp extensions/tarx-cli/com.tarx.heartbeat.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.tarx.heartbeat.plist
```

### Management

```bash
launchctl list | grep tarx.heartbeat     # Check if running
launchctl unload ~/Library/LaunchAgents/com.tarx.heartbeat.plist  # Stop
launchctl load ~/Library/LaunchAgents/com.tarx.heartbeat.plist    # Start
tarx wake                                # Manual tick
tarx think --follow                      # Watch TARX think
```

---

## Daily Briefing System

TARX sends a daily brief at 7AM ET and a weekly digest at 8AM Monday ET via SMS.
Voice: chief of staff — conversational, no tables, no markdown. "3 need you today. All else handled."

### Data Sources

- **Priorities:** `~/.tarx/priorities.jsonl` — append-only, one JSON object per line
  - Fields: `id`, `title`, `owner` (john/tarx), `urgency` (now/today/this_week), `category`, `status` (open/done), `context`, `created`
- **Orchestration log:** `~/Library/Application Support/tarx/orchestration-log.jsonl` — daemon activity, worker spawns, task completions, blockers
- **Thinking log:** `~/.tarx/thinking.log` — port health, Sentry, breaker status
- **Port health:** live checks on 11435/11436/11437

### Brief Format

Daily: What needs you (urgency=now) → what's for today → what TARX handled → health → blockers → this week lookahead → daemon status.
Weekly: Priorities closed/open → daemon stats (spawns, completions, heals) → still urgent → pointer to full log.

### Schedule (launchd)

```
com.tarx.daily-brief.plist   — 7:00 AM local, daily
com.tarx.weekly-digest.plist — 8:00 AM local, Monday
com.tarx.heartbeat.plist     — every 5 minutes
```

### CLI

```bash
tarx brief              # Print daily brief to stdout
tarx brief --weekly     # Print weekly digest to stdout
tarx brief --sms        # Print + send via SMS
tarx brief --weekly --sms  # Weekly digest via SMS
tarx priorities         # Show open/done priority list
```

### Adding Priorities

```bash
echo '{"id":"p-013","title":"New thing","owner":"tarx","urgency":"today","category":"feat","status":"open","context":"Details here.","created":"2026-02-21"}' >> ~/.tarx/priorities.jsonl
```

### Installation

```bash
cp extensions/tarx-cli/com.tarx.daily-brief.plist ~/Library/LaunchAgents/
cp extensions/tarx-cli/com.tarx.weekly-digest.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.tarx.daily-brief.plist
launchctl load ~/Library/LaunchAgents/com.tarx.weekly-digest.plist
```

## Briefing System
- `tarx brief`: Daily conversational SMS punch list (7 AM ET via launchd)
- `tarx brief --weekly --sms`: Weekly digest SMS (Monday 8 AM ET via launchd)
- `tarx weekly`: Alias for weekly digest + SMS
- `tarx priorities`: View/add/complete priority items
- `tarx priorities add "title" --urgency today --owner john`: Add new priority
- `tarx priorities done p-001`: Mark priority done
- Priorities stored: `~/.tarx/priorities.jsonl` (JSONL, one object per line)
- Schema: `{ts, id, title, status, owner, urgency, context, last_updated}`
- Status values: `active | blocked | done | waiting_review`
- Schedule: `~/Library/LaunchAgents/com.tarx.daily-brief.plist`, `com.tarx.weekly-digest.plist`
- Voice: TARX speaks as chief of staff. Conversational, not robotic.

## Conversational Task Manager
- Startup brief: When user opens TARX, first chat message of the day is conversational priority summary
- Weekly injection: Monday mornings, weekly digest prepended before daily brief (once per week)
- Priority CRUD via chat: natural language add/done/list/blocked commands
- Intent router: `extensions/tarx/src/chat/priorityHandler.ts` — pattern-matches before LLM passthrough
- Shared data: CLI and app both read/write `~/.tarx/priorities.jsonl`
- File watching: App watches `priorities.jsonl` for CLI-side changes
- Desktop module: `apps/desktop/src/lib/priorities.ts` — shared read/write/filter functions

---

*This document is the single source of truth for the TARX dispatch protocol.*
*Version: 1.3 — February 21, 2026*
