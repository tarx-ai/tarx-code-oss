/**
 * TARX Intent Router
 *
 * Classifies user messages as LOCAL (conversation) or NETWORK (action).
 * Local → Qwen 8B on localhost:11435
 * Network → Claude API for file ops, commands, multi-step tasks
 *
 * V1: Rule-based. V2: Self-classifying via local model.
 */

export type ModelRoute = 'local' | 'network';

export interface RouteDecision {
  route: ModelRoute;
  confidence: number;
  reason: string;
}

// Action patterns that require network model
const ACTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // File operations
  { pattern: /\b(create|write|edit|update|modify|delete|remove|add|insert|replace|save)\b.*\b(file|component|module|class|function|page|route|config|test)\b/i, label: 'file-op' },
  { pattern: /\b(fix|debug|repair|patch|resolve)\b/i, label: 'fix' },
  { pattern: /\b(refactor|migrate|convert|transform|rename)\b/i, label: 'refactor' },

  // Terminal / build
  { pattern: /\b(run|execute|build|compile|install|deploy|test|lint|start|stop|restart)\b/i, label: 'terminal' },
  { pattern: /\b(npm|yarn|pnpm|cargo|pip|git|docker|curl|make)\s/i, label: 'cli-tool' },

  // Multi-step
  { pattern: /\b(implement|set\s?up|scaffold|bootstrap|initialize|configure)\b/i, label: 'multi-step' },

  // MCP tools
  { pattern: /\b(check|search|query|fetch|list)\b.*\b(sentry|notion|github|slack|drive|jira)\b/i, label: 'mcp-tool' },
  { pattern: /\b(send|post|upload|push)\b.*\b(to|into)\b/i, label: 'send-action' },

  // Code gen (with production intent)
  { pattern: /\b(write|generate|create|build|make)\b.*\b(code|script|function|api|endpoint|hook|util|class|interface|type)\b/i, label: 'codegen' },

  // Git
  { pattern: /\b(commit|push|pull|merge|branch|checkout|stash|rebase|cherry-pick)\b/i, label: 'git' },
];

// Explicit overrides
const FORCE_NETWORK = /\b(use claude|use network|use cloud|use api)\b/i;
const FORCE_LOCAL = /\b(use local|use tarx|use offline|just chat)\b/i;

// Question patterns that should stay local
const QUESTION_PATTERNS = [
  /^(what|how|why|when|where|who|which|can you explain|could you explain|tell me about)\b/i,
  /\?$/,
  /\b(what is|what are|what does|how does|how do|how to|why is|why does)\b/i,
];

export function classifyIntent(message: string): RouteDecision {
  const trimmed = message.trim();

  // Explicit overrides
  if (FORCE_NETWORK.test(trimmed)) {
    return { route: 'network', confidence: 1.0, reason: 'Explicit network request' };
  }
  if (FORCE_LOCAL.test(trimmed)) {
    return { route: 'local', confidence: 1.0, reason: 'Explicit local request' };
  }

  // Check if this is a question
  const isQuestion = QUESTION_PATTERNS.some(p => p.test(trimmed));

  // Check action patterns
  for (const { pattern, label } of ACTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      // If it's a question about an action, keep local
      if (isQuestion && !startsWithImperative(trimmed)) {
        return {
          route: 'local',
          confidence: 0.8,
          reason: `Question about ${label} - staying local`,
        };
      }
      return {
        route: 'network',
        confidence: 0.9,
        reason: `Action pattern: ${label}`,
      };
    }
  }

  // Default: local (conversation)
  return {
    route: 'local',
    confidence: 0.7,
    reason: 'No action patterns - conversation mode',
  };
}

function startsWithImperative(message: string): boolean {
  const imperatives = /^(create|write|build|make|add|delete|remove|fix|update|edit|run|execute|deploy|install|commit|push|pull|merge|checkout|refactor|implement|set\s?up|configure|generate|scaffold)\b/i;
  return imperatives.test(message.trim());
}

// Route indicator for UI
export function getRouteIndicator(route: ModelRoute): { emoji: string; label: string } {
  if (route === 'local') {
    return { emoji: '\u26A1', label: 'Local' };
  }
  return { emoji: '\u2601\uFE0F', label: 'Claude' };
}
