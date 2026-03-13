---
name: tarx-agent-development
description: Build TARX agents using @tarx/agent-sdk — capability slices with TDD and real MCP parity proof.
---

# TARX Agent Development Skill

Use this skill when building or debugging TARX agents with Claude Code.

## Outcome

Ship capability slices. A slice = **UI + real MCP tool call + parity proof**.

## Non-Negotiable Rule

Mock-only success is never ship-ready success.

## Slice Workflow

1. **Define the slice** — user action, tool contract (name, args, response shape), done criteria
2. **Write failing test** — tool exists in `tools/list`, call succeeds with fixture args, output shape matches
3. **Implement UI** — React component using `@tarx/agent-sdk` hooks, keep UI thin
4. **Wire real tool** — if tool doesn't exist, add to appropriate MCP server
5. **Green** — tests pass against real MCP server, not just mocks
6. **Polish** — error states, loading states, edge cases

## SDK Hooks

```typescript
import {
  useTARXTool,           // call any MCP tool
  useLocalMemory,        // read/write memory.db
  useSuperComputer,      // local or mesh inference
  useSpaces,             // TARX spaces/projects
  useAgentCapabilities,  // runtime service detection
  useAgentTheme,         // dark/light from Workbench
  useHostContext,        // combined context (theme + caps + space)
} from '@tarx/agent-sdk';
```

## Tool Call Pattern

```typescript
// Real mode
const { call, loading, result } = useTARXTool<{ limit: number }, Space[]>('tarx_list_spaces');
const r = await call({ limit: 10 });
if (r.success) console.log(r.data);  // Space[]

// TDD mode (mock)
const { call } = useTARXTool('tarx_list_spaces', {
  mock: {
    toolName: 'tarx_list_spaces',
    source: 'mock',
    activeVariantId: 'default',
    variants: [{
      id: 'default',
      name: 'Success',
      type: 'success',
      delay: 100,
      response: { data: [{ id: '1', name: 'Test', created_at: '2026-01-01' }] }
    }]
  }
});
```

## Capability Detection

```typescript
const caps = useAgentCapabilities();

if (!caps.localInference) {
  return <div>TARX not running. Start with: tarx start</div>;
}

if (caps.mesh && caps.meshPeers > 0) {
  // Use distributed compute
  const { query } = useSuperComputer();
  const result = await query('Analyze this data', { preferMesh: true });
}
```

## Agent Manifest

Every agent has `manifest.json` in `~/.tarx/agents/{id}/`:

```json
{
  "id": "file-organizer",
  "name": "File Organizer",
  "description": "Automatically organizes files by content type",
  "version": "1.0.0",
  "author": "you@tarx.com",
  "tools": ["tarx_list_files", "tarx_scan_directory"],
  "permissions": ["files:read", "files:write", "embeddings:search"],
  "entrypoint": "widget.js",
  "category": "productivity"
}
```

## Registry Operations (Node.js / extension host only)

```typescript
import { registerAgent, listAgents, getAgent, searchAgents } from '@tarx/agent-sdk';

await registerAgent(manifest);       // adds to ~/.tarx/agents/registry.json
const all = await listAgents();       // read registry
const agent = await getAgent('file-organizer');
const matches = await searchAgents('organize');
```

## Theming Contract

Agents MUST support dark mode. TARX Workbench is dark by default.

```tsx
const theme = useAgentTheme();

return (
  <div className={theme === 'dark' ? 'dark' : 'light'}>
    {/* Use CSS vars from VS Code: --vscode-editor-background, etc. */}
  </div>
);
```

## Message Bridge

Agent widgets communicate with the extension host via postMessage:

```
Agent → { type: 'tarx:callTool', id, tool, args }  → Extension Host
Agent ← { type: 'tarx:toolResult', id, result }    ← Extension Host
Agent ← { type: 'tarx:theme', theme }              ← Extension Host
Agent ← { type: 'tarx:capabilities', capabilities } ← Extension Host
```

## Completion Status

Report with these exact statuses (from MCP App Studio SKILL.md):

- `success` — all required real parity checks passed
- `partial` — meaningful progress, at least one check still failing
- `blocked` — cannot continue without external dependency

Never report `success` if evidence is mock-only.

```json
{
  "status": "success",
  "requiredTools": ["tarx_list_spaces", "tarx_scan_directory"],
  "missingTools": [],
  "failingCalls": [],
  "evidence": ["test-spaces-list", "test-scan-directory"]
}
```

## Anti-Patterns

- Building UI against mocks without creating real tools
- Reporting done without parity evidence
- Using direct fetch when postMessage bridge exists (webview security)
- Ignoring dark mode (agents look broken in TARX's dark theme)
- Calling `acquireVsCodeApi()` more than once (VS Code throws)
- Polling services faster than 30s (unnecessary load)

## File Locations

| What | Where |
|------|-------|
| SDK source | `extensions/tarx-agent-sdk/src/` |
| Agent registry | `~/.tarx/agents/registry.json` |
| Agent bundles | `~/.tarx/agents/{id}/` |
| MCP servers | `extensions/tarx-core/`, `extensions/tarx-ops/` |
| Webview host | `extensions/tarx/src/webview/` |

## Quick Start

```bash
# 1. Create agent directory
mkdir -p ~/.tarx/agents/my-agent

# 2. Write manifest
cat > ~/.tarx/agents/my-agent/manifest.json << 'EOF'
{
  "id": "my-agent",
  "name": "My Agent",
  "description": "Does something useful",
  "version": "0.1.0",
  "author": "me",
  "tools": ["tarx_health"],
  "permissions": ["spaces:read"],
  "entrypoint": "widget.js",
  "category": "custom"
}
EOF

# 3. Write widget (React component using SDK hooks)
# 4. Bundle with esbuild/vite → widget.js
# 5. Register: node -e "import('@tarx/agent-sdk').then(s => s.registerAgent(require('./manifest.json')))"
```
