// ─────────────────────────────────────────────────────────────────────────────
// @tarx/agent-sdk — TARX Agent Development Kit
//
// Foundation for building agents that run inside TARX Workbench.
// Adapted from MCP App Studio patterns (assistant-ui/mcp-app-studio-starter).
//
// Architecture:
//   Agent (React in VS Code webview)
//     ↔ vscode.postMessage
//     ↔ Extension Host
//     ↔ MCP servers (localhost 11435/11436/11437)
//
// V1.0: SDK hooks + registry (this package)
// V1.2: Agent Studio UI (builds on this)
// ─────────────────────────────────────────────────────────────────────────────

// ── Hooks (for agent widgets running in webviews) ───────────────────────────

export { useTARXTool } from './hooks/use-tarx-tool';
export { useLocalMemory } from './hooks/use-local-memory';
export { useSuperComputer } from './hooks/use-supercomputer';
export { useSpaces } from './hooks/use-spaces';
export { useAgentCapabilities } from './hooks/use-capabilities';
export { useAgentTheme } from './hooks/use-theme';
export { useHostContext } from './hooks/use-host-context';

// ── Registry (for extension host / Node.js) ─────────────────────────────────

export {
  listAgents,
  getAgent,
  registerAgent,
  unregisterAgent,
  listAgentsByCategory,
  searchAgents,
  validateManifest,
} from './registry';

// ── Types ───────────────────────────────────────────────────────────────────

export type {
  // Capabilities
  TARXCapabilities,
  // Agent
  AgentManifest,
  AgentCategory,
  AgentPermission,
  // Tools
  ToolCallResult,
  ToolAnnotations,
  // Mocks
  MockVariantType,
  MockVariant,
  MockResponse,
  ToolMockConfig,
  // Theme
  AgentTheme,
  // Host
  TARXHostContext,
  // Status
  CompletionStatus,
  CompletionReport,
  // Messages
  AgentToHostMessage,
  HostToAgentMessage,
} from './types';
