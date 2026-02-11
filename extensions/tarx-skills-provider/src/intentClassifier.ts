/**
 * TARX Intent Classifier
 *
 * Simple keyword/pattern matching for V1.
 * Maps user messages to the most appropriate skill.
 */

import type { IntentMatch, SkillIntent } from './types.js';

/** Keyword patterns for each skill intent */
const INTENT_PATTERNS: Record<SkillIntent, { keywords: string[]; patterns: RegExp[] }> = {
	'code-gen': {
		keywords: [
			'write', 'generate', 'create', 'code', 'implement', 'build',
			'function', 'class', 'component', 'module', 'refactor',
			'add', 'make', 'scaffold', 'boilerplate', 'template',
		],
		patterns: [
			/write\s+(a|me|the)\s+/i,
			/create\s+(a|an|the)\s+/i,
			/generate\s+/i,
			/implement\s+/i,
			/add\s+(a|an)\s+(new\s+)?/i,
			/can\s+you\s+(write|create|make|build)/i,
			/how\s+(do|would)\s+(I|you)\s+(write|create|implement)/i,
		],
	},
	'memory': {
		keywords: [
			'remember', 'recall', 'forget', 'memory', 'memorize',
			'note', 'noted', 'don\'t forget', 'keep in mind',
			'what do you know', 'do you remember', 'previously',
		],
		patterns: [
			/remember\s+(this|that)/i,
			/don'?t\s+forget/i,
			/keep\s+in\s+mind/i,
			/what\s+do\s+you\s+(know|remember)/i,
			/do\s+you\s+remember/i,
			/note\s+(this|that)/i,
			/from\s+(last|our\s+previous)\s+(session|conversation|chat)/i,
		],
	},
	'debug': {
		keywords: [
			'error', 'bug', 'crash', 'debug', 'fix', 'broken',
			'not working', 'issue', 'exception', 'stack trace',
			'sentry', 'logs', 'failing', 'failed', 'health',
		],
		patterns: [
			/something\s+(broke|crashed|isn'?t\s+working)/i,
			/not\s+working/i,
			/why\s+(is|does|did)\s+.+\s+(fail|crash|error|break)/i,
			/what'?s?\s+wrong\s+with/i,
			/getting\s+(an?\s+)?error/i,
			/check\s+(the\s+)?(health|status|logs|sentry)/i,
			/recent\s+(errors|issues|crashes)/i,
		],
	},
	'knowledge': {
		keywords: [
			'search', 'find', 'document', 'documentation', 'docs',
			'upload', 'file', 'knowledge', 'rag', 'look up',
			'what does', 'how does', 'where is', 'spec', 'reference',
		],
		patterns: [
			/search\s+(for|through|in|the)\s+/i,
			/find\s+(me\s+)?(the|a|info|information)\s+/i,
			/upload\s+(this|a|the)\s+/i,
			/what\s+does\s+.+\s+say\s+about/i,
			/in\s+(the|my)\s+(docs|documentation|files|notes)/i,
			/look\s+(up|for|through)/i,
			/according\s+to\s+(the|my)\s+/i,
		],
	},
	'projects': {
		keywords: [
			'project', 'space', 'session', 'workspace', 'organize',
			'status', 'overview', 'list', 'show', 'tasks',
			'working on', 'new project', 'my projects',
		],
		patterns: [
			/show\s+(me\s+)?(my\s+)?(projects|spaces|sessions|tasks)/i,
			/what\s+am\s+I\s+working\s+on/i,
			/new\s+(project|space|session)/i,
			/project\s+(status|overview)/i,
			/list\s+(my\s+)?(projects|spaces|sessions)/i,
			/create\s+(a\s+)?(new\s+)?(project|space)/i,
		],
	},
	'unknown': {
		keywords: [],
		patterns: [],
	},
};

/** Skill name mapping from intent */
const INTENT_TO_SKILL: Record<SkillIntent, string> = {
	'code-gen': 'tarx-code-gen',
	'memory': 'tarx-memory',
	'debug': 'tarx-debug',
	'knowledge': 'tarx-knowledge',
	'projects': 'tarx-projects',
	'unknown': '',
};

/**
 * Classify user message intent and return ranked skill matches.
 *
 * Scoring:
 * - Each keyword match: +1 point
 * - Each regex pattern match: +3 points (more specific)
 * - Confidence = score / maxPossibleScore, capped at 1.0
 */
export function classifyIntent(message: string): IntentMatch[] {
	const lower = message.toLowerCase();
	const results: IntentMatch[] = [];

	for (const [intent, { keywords, patterns }] of Object.entries(INTENT_PATTERNS)) {
		if (intent === 'unknown') continue;

		let score = 0;
		const matched: string[] = [];
		const maxScore = keywords.length + patterns.length * 3;

		// Keyword matching
		for (const kw of keywords) {
			if (lower.includes(kw)) {
				score += 1;
				matched.push(kw);
			}
		}

		// Pattern matching (weighted higher)
		for (const pat of patterns) {
			if (pat.test(message)) {
				score += 3;
				matched.push(pat.source.slice(0, 30));
			}
		}

		if (score > 0) {
			results.push({
				intent: intent as SkillIntent,
				confidence: Math.min(score / Math.max(maxScore * 0.3, 1), 1.0),
				skillName: INTENT_TO_SKILL[intent as SkillIntent],
				matchedKeywords: matched,
			});
		}
	}

	// Sort by confidence descending
	results.sort((a, b) => b.confidence - a.confidence);

	// If no matches, return unknown
	if (results.length === 0) {
		results.push({
			intent: 'unknown',
			confidence: 0,
			skillName: '',
			matchedKeywords: [],
		});
	}

	return results;
}

/**
 * Get the best matching skill for a message.
 * Returns null if confidence is below threshold.
 */
export function getBestSkill(message: string, threshold = 0.15): IntentMatch | null {
	const matches = classifyIntent(message);
	const best = matches[0];
	if (!best || best.intent === 'unknown' || best.confidence < threshold) {
		return null;
	}
	return best;
}
