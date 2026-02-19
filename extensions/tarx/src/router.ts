/**
 * TARX Model Router
 *
 * "One UI, Two Brains"
 *
 * Routes user messages between:
 * - LOCAL (Qwen 8B via llama-server) — conversation, Q&A, explanation
 * - NETWORK (Claude API) — actions, tool use, multi-step tasks
 *
 * V1: Rule-based classifier
 * V2: Use local model to self-classify (future)
 */

export type ModelRoute = 'local' | 'network';

export interface RouteDecision {
	route: ModelRoute;
	confidence: number; // 0-1
	reason: string;
	matchedPattern?: string;
}

/**
 * Action patterns that trigger NETWORK routing
 * Organized by category for maintainability
 */
const ACTION_PATTERNS: { pattern: RegExp; category: string }[] = [
	// File operations
	{ pattern: /\b(create|write|edit|update|modify|delete|remove|add|insert|replace|save)\b.*\b(file|component|module|class|function|page|route|config|test|spec)\b/i, category: 'file-ops' },
	{ pattern: /\b(fix|debug|repair|patch|resolve)\b/i, category: 'fix' },
	{ pattern: /\b(refactor|migrate|convert|transform|rename)\b/i, category: 'refactor' },

	// Terminal / build
	{ pattern: /\b(run|execute|build|compile|install|deploy|test|lint|start|stop|restart)\b/i, category: 'terminal' },
	{ pattern: /\b(npm|yarn|pnpm|cargo|pip|git|docker|curl|make|gradle|maven)\s/i, category: 'cli-tool' },

	// Multi-step tasks
	{ pattern: /\b(implement|set\s?up|scaffold|bootstrap|initialize|configure)\b/i, category: 'multi-step' },
	{ pattern: /\b(step\s?\d|first|then|next|finally)\b.*\b(create|build|add|write)\b/i, category: 'sequential' },

	// MCP tools / integrations
	{ pattern: /\b(check|search|query|fetch|list)\b.*\b(sentry|notion|github|slack|drive|jira|linear)\b/i, category: 'mcp-tool' },
	{ pattern: /\b(send|post|upload|push)\b.*\b(to|into)\b/i, category: 'external-action' },

	// Code generation (with intent to produce)
	{ pattern: /\b(write|generate|create|build|make)\b.*\b(code|script|function|api|endpoint|hook|util|helper|service|middleware)\b/i, category: 'code-gen' },

	// Git operations
	{ pattern: /\b(commit|push|pull|merge|branch|checkout|stash|rebase|cherry-pick|tag)\b/i, category: 'git' },

	// Workspace operations
	{ pattern: /\b(open|close|save|rename)\b.*\b(file|folder|project|workspace|tab)\b/i, category: 'workspace' },
];

/**
 * Patterns that explicitly request a specific model
 */
const EXPLICIT_NETWORK_PATTERNS = [
	/\b(use claude|use network|use cloud|use api|ask claude)\b/i,
	/\b@claude\b/i,
];

const EXPLICIT_LOCAL_PATTERNS = [
	/\b(use local|use tarx|use offline|use qwen)\b/i,
	/\b@local\b/i,
];

/**
 * Question patterns that should stay LOCAL
 * These override action-like words when present
 */
const QUESTION_PATTERNS = [
	/^(what|how|why|when|where|who|which|can you explain|could you explain|tell me about)\b/i,
	/\?$/,  // Ends with question mark
	/\b(what is|what are|what does|how does|how do|how to|why is|why does)\b/i,
	/\b(explain|describe|summarize|clarify|elaborate)\b.*\b(this|that|it|the)\b/i,
];

/**
 * Classify user intent and determine model routing
 *
 * @param message - User's input message
 * @returns RouteDecision with route, confidence, and reasoning
 */
export function classifyIntent(message: string): RouteDecision {
	const trimmed = message.trim();
	const lower = trimmed.toLowerCase();

	// --- Check for explicit model requests first (highest priority) ---
	for (const pattern of EXPLICIT_NETWORK_PATTERNS) {
		if (pattern.test(lower)) {
			return {
				route: 'network',
				confidence: 1.0,
				reason: 'Explicit network model request',
			};
		}
	}

	for (const pattern of EXPLICIT_LOCAL_PATTERNS) {
		if (pattern.test(lower)) {
			return {
				route: 'local',
				confidence: 1.0,
				reason: 'Explicit local model request',
			};
		}
	}

	// --- Check if this is a question (should stay local) ---
	const isQuestion = QUESTION_PATTERNS.some(p => p.test(lower));

	// --- Check for action patterns ---
	for (const { pattern, category } of ACTION_PATTERNS) {
		if (pattern.test(lower)) {
			// If it's a question about an action, keep it local
			// e.g., "What does git rebase do?" vs "Rebase main onto feature"
			if (isQuestion && !hasImperativeVerb(trimmed)) {
				return {
					route: 'local',
					confidence: 0.8,
					reason: `Question about ${category} — staying local`,
					matchedPattern: pattern.source,
				};
			}

			return {
				route: 'network',
				confidence: 0.9,
				reason: `Action pattern matched: ${category}`,
				matchedPattern: pattern.source,
			};
		}
	}

	// --- Default: LOCAL (conversation) ---
	return {
		route: 'local',
		confidence: 0.7,
		reason: 'No action patterns detected — treating as conversation',
	};
}

/**
 * Check if message starts with an imperative verb (command form)
 */
function hasImperativeVerb(message: string): boolean {
	const imperativeStarters = /^(create|write|build|make|add|delete|remove|fix|update|edit|run|execute|deploy|install|commit|push|pull|merge|checkout|refactor|implement|set\s?up|configure|generate|scaffold)\b/i;
	return imperativeStarters.test(message.trim());
}

/**
 * Router configuration
 */
export interface RouterConfig {
	defaultMode: 'auto' | 'local' | 'network';
	forceLocal: boolean;  // Override for offline mode
	forceNetwork: boolean;  // Override for testing
	networkModel: string;  // e.g., 'claude-sonnet-4-20250514'
}

const DEFAULT_CONFIG: RouterConfig = {
	defaultMode: 'auto',
	forceLocal: false,
	forceNetwork: false,
	networkModel: 'claude-sonnet-4-20250514',
};

let currentConfig: RouterConfig = { ...DEFAULT_CONFIG };

/**
 * Update router configuration
 */
export function setRouterConfig(config: Partial<RouterConfig>): void {
	currentConfig = { ...currentConfig, ...config };
}

/**
 * Get current router configuration
 */
export function getRouterConfig(): RouterConfig {
	return { ...currentConfig };
}

/**
 * Route a message considering both classification and configuration
 */
export function routeMessage(message: string): RouteDecision {
	const config = currentConfig;

	// Force overrides
	if (config.forceLocal) {
		return {
			route: 'local',
			confidence: 1.0,
			reason: 'Forced local mode (offline)',
		};
	}

	if (config.forceNetwork) {
		return {
			route: 'network',
			confidence: 1.0,
			reason: 'Forced network mode (testing)',
		};
	}

	// Explicit mode
	if (config.defaultMode === 'local') {
		return {
			route: 'local',
			confidence: 1.0,
			reason: 'Default mode set to local',
		};
	}

	if (config.defaultMode === 'network') {
		return {
			route: 'network',
			confidence: 1.0,
			reason: 'Default mode set to network',
		};
	}

	// Auto mode - use classifier
	return classifyIntent(message);
}

/**
 * Get human-readable route indicator with codicon
 */
export function getRouteIndicator(route: ModelRoute): { icon: string; label: string; color: string } {
	if (route === 'local') {
		return { icon: 'TARX', label: 'Local', color: 'green' };
	} else {
		return { icon: 'TARX', label: 'Claude', color: 'blue' };
	}
}
