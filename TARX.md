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
tarx taxonomy             — Print error taxonomy tree
tarx strategy <name>      — Print strategy definition
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

*This document is the single source of truth for the TARX dispatch protocol.*
*Version: 1.0 — February 20, 2026*
