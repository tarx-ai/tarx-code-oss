// ─────────────────────────────────────────────────────────────────────────────
// @tarx/agent-sdk types
//
// Adapted from MCP App Studio patterns. Key differences:
// - Capabilities are hardware/service based (ports, not host features)
// - Agents run in VS Code webviews, not iframes
// - Tool calls go through extension host, not HTTP proxy
// - Registry is file-based (~/.tarx/agents/), not a web service
// ─────────────────────────────────────────────────────────────────────────────

// ── Capabilities ────────────────────────────────────────────────────────────

export interface TARXCapabilities {
  /** Local LLM inference available (port 11435) */
  localInference: boolean;
  /** Mesh P2P network available (port 11436) */
  mesh: boolean;
  /** Embedding/RAG server available (port 11437) */
  embeddings: boolean;
  /** Spaces/projects DB accessible */
  spaces: boolean;
  /** Memory DB accessible */
  memory: boolean;
  /** Number of active mesh peers */
  meshPeers: number;
  /** Local inference model name, if detected */
  modelName: string | null;
}

// ── Agent Manifest ──────────────────────────────────────────────────────────

export interface AgentManifest {
  /** Unique agent identifier (kebab-case, e.g. "file-organizer") */
  id: string;
  /** Human-readable name */
  name: string;
  /** What this agent does (one sentence) */
  description: string;
  /** Semver version */
  version: string;
  /** Author email or identifier */
  author: string;
  /** MCP tool names this agent uses */
  tools: string[];
  /** Permission scopes (e.g. "spaces:read", "memory:write", "inference:query") */
  permissions: AgentPermission[];
  /** Widget bundle entry point (relative path) */
  entrypoint: string;
  /** Agent category for registry browsing */
  category: AgentCategory;
  /** Tool annotations — safety hints for the host */
  toolAnnotations?: Record<string, ToolAnnotations>;
  /** ISO timestamp */
  createdAt: string;
  /** ISO timestamp */
  updatedAt: string;
}

export type AgentCategory =
  | 'productivity'
  | 'developer'
  | 'data'
  | 'communication'
  | 'system'
  | 'custom';

export type AgentPermission =
  | 'spaces:read'
  | 'spaces:write'
  | 'memory:read'
  | 'memory:write'
  | 'inference:query'
  | 'mesh:query'
  | 'mesh:contribute'
  | 'files:read'
  | 'files:write'
  | 'embeddings:search'
  | 'embeddings:write';

// ── Tool Annotations (from MCP spec) ────────────────────────────────────────

export interface ToolAnnotations {
  /** Tool only reads data, no side effects */
  readOnlyHint?: boolean;
  /** Tool may delete or modify data destructively */
  destructiveHint?: boolean;
  /** Tool accesses external/network resources */
  openWorldHint?: boolean;
  /** Calling with same args produces same result */
  idempotentHint?: boolean;
}

// ── Tool Call ────────────────────────────────────────────────────────────────

export interface ToolCallResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  durationMs: number;
}

// ── Mock System ─────────────────────────────────────────────────────────────

export type MockVariantType = 'success' | 'empty' | 'error' | 'slow' | 'custom';

export interface MockVariant {
  id: string;
  name: string;
  type: MockVariantType;
  response: MockResponse;
  /** Simulated delay in ms */
  delay: number;
}

export interface MockResponse {
  data?: unknown;
  error?: string;
  isError?: boolean;
}

export interface ToolMockConfig {
  toolName: string;
  source: 'mock' | 'real';
  activeVariantId: string | null;
  variants: MockVariant[];
}

// ── Theme ───────────────────────────────────────────────────────────────────

export type AgentTheme = 'dark' | 'light';

// ── Host Context ────────────────────────────────────────────────────────────

export interface TARXHostContext {
  /** Always 'desktop' for TARX Workbench */
  platform: 'desktop';
  /** Current theme */
  theme: AgentTheme;
  /** Active space ID, if any */
  spaceId: string | null;
  /** Runtime capabilities */
  capabilities: TARXCapabilities;
}

// ── Completion Status (from MCP App Studio SKILL.md) ────────────────────────

export type CompletionStatus = 'success' | 'partial' | 'blocked';

export interface CompletionReport {
  status: CompletionStatus;
  requiredTools: string[];
  missingTools: string[];
  failingCalls: Array<{ tool: string; reason: string }>;
  evidence: string[];
}

// ── Message Bridge (VS Code webview ↔ extension host) ───────────────────────

export type AgentToHostMessage =
  | { type: 'tarx:callTool'; id: string; tool: string; args: Record<string, unknown> }
  | { type: 'tarx:setState'; state: Record<string, unknown> }
  | { type: 'tarx:sendMessage'; prompt: string }
  | { type: 'tarx:openExternal'; href: string }
  | { type: 'tarx:log'; level: 'info' | 'warn' | 'error'; message: string; data?: unknown };

export type HostToAgentMessage =
  | { type: 'tarx:toolResult'; id: string; result: ToolCallResult }
  | { type: 'tarx:setGlobals'; globals: TARXHostContext }
  | { type: 'tarx:theme'; theme: AgentTheme }
  | { type: 'tarx:capabilities'; capabilities: TARXCapabilities };
