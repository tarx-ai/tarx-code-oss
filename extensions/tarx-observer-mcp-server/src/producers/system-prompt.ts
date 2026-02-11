/*---------------------------------------------------------------------------------------------
 *  TARX Observer — System Prompt Producer
 *  Assembles a dynamic system prompt from learned preferences, domain knowledge,
 *  and prompt fragments. Regenerated hourly or when preferences change significantly.
 *  Budget: 500 tokens max for injected context.
 *--------------------------------------------------------------------------------------------*/

import {
	getActivePromptFragments, getAllPreferences, getDomainTerms,
	setPromptFragment, getMeta, setMeta, estimateTokens
} from '../storage.js';

const MAX_TOKENS = 500;

export class SystemPromptProducer {

	/**
	 * Generate the current system prompt injection.
	 * Assembles from prompt_fragments table, ordered by priority.
	 */
	generate(): string {
		const fragments = getActivePromptFragments();

		if (fragments.length === 0) {
			return this.generateFromRawData();
		}

		const parts: string[] = ['[Observer Context]'];
		let tokenBudget = MAX_TOKENS - 10; // Reserve for wrapper

		for (const fragment of fragments) {
			const tokens = estimateTokens(fragment.content);
			if (tokens <= tokenBudget) {
				parts.push(fragment.content);
				tokenBudget -= tokens;
			}
		}

		parts.push('[/Observer Context]');
		return parts.join('\n');
	}

	/**
	 * Regenerate prompt fragments from current preferences and domain knowledge.
	 * Called hourly or when preferences change.
	 */
	regenerate(): void {
		const preferences = getAllPreferences();
		const domainTerms = getDomainTerms(30);

		// ── Identity fragment (priority 100) ──
		// Keep existing identity fragment unless explicitly changed

		// ── Preferences fragment (priority 70) ──
		const prefLines: string[] = [];
		for (const pref of preferences) {
			if (pref.confidence < 0.6) continue;
			prefLines.push(this.formatPreference(pref.key, pref.value));
		}
		if (prefLines.length > 0) {
			setPromptFragment('preferences',
				'User prefers: ' + prefLines.join(', '),
				70
			);
		}

		// ── Domain fragment (priority 50) ──
		const projectTerms = domainTerms.filter(t => t.category === 'project');
		const toolTerms = domainTerms.filter(t => t.category === 'tool');
		const personTerms = domainTerms.filter(t => t.category === 'person');

		const domainParts: string[] = [];
		if (projectTerms.length > 0) {
			domainParts.push("User's domain: " + projectTerms.map(t =>
				t.definition ? `${t.term} (${t.definition})` : t.term
			).slice(0, 5).join(', '));
		}
		if (personTerms.length > 0) {
			domainParts.push('Key people: ' + personTerms.map(t => t.term).slice(0, 8).join(', '));
		}
		if (toolTerms.length > 0) {
			domainParts.push('Key tools: ' + toolTerms.map(t => t.term).slice(0, 8).join(', '));
		}

		if (domainParts.length > 0) {
			setPromptFragment('domain', domainParts.join('\n'), 50);
		}

		// ── Corrections/boundaries fragment (priority 90) ──
		// Built from model_gaps with high occurrence counts
		// This is handled separately by reading gaps table

		setMeta('last_prompt_regen', new Date().toISOString());
	}

	/**
	 * Fallback: generate from raw preferences/domain when no fragments exist yet.
	 */
	private generateFromRawData(): string {
		const preferences = getAllPreferences();
		const domainTerms = getDomainTerms(10);

		const parts: string[] = ['[Observer Context]'];

		if (preferences.length > 0) {
			const prefStr = preferences
				.filter(p => p.confidence >= 0.6)
				.map(p => this.formatPreference(p.key, p.value))
				.join(', ');
			if (prefStr) parts.push(`User prefers: ${prefStr}`);
		}

		if (domainTerms.length > 0) {
			parts.push("User's domain: " + domainTerms.map(t => t.term).join(', '));
		}

		parts.push('[/Observer Context]');
		return parts.join('\n');
	}

	/**
	 * Format a preference key-value pair for the system prompt.
	 */
	private formatPreference(key: string, value: string): string {
		switch (key) {
			case 'response_length':
				return `${value} responses`;
			case 'tone':
				return `${value} tone`;
			case 'format':
				return value === 'bullets' ? 'bullet-point format' : `${value} format`;
			case 'hedging':
				return value === 'never' ? 'no hedging' : 'hedging tolerated';
			case 'detail_level':
				return `${value} detail`;
			case 'code_style':
				return value === 'code_first' ? 'code examples first'
					: value === 'explanation_first' ? 'explanations first'
					: 'balanced code/explanation';
			case 'verbosity':
				return `${value} verbosity`;
			default:
				return `${key}: ${value}`;
		}
	}
}
