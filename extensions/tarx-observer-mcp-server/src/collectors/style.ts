/*---------------------------------------------------------------------------------------------
 *  TARX Observer — Style Collector
 *  Tracks token lengths, formatting preferences, and vocabulary.
 *  Builds a profile of how the user prefers to communicate and receive information.
 *--------------------------------------------------------------------------------------------*/

import { getRecentInteractions, setPreference, estimateTokens } from '../storage.js';
import type { Interaction } from '../types.js';

// Rolling window size
const WINDOW_SIZE = 50;

export class StyleCollector {

	/**
	 * Analyze recent interactions and update style preferences.
	 * Call this after each interaction or periodically.
	 */
	analyze(interactions?: Interaction[]): StyleProfile {
		const recent = interactions || getRecentInteractions(WINDOW_SIZE);
		if (recent.length < 5) {
			return { tokenStats: null, formatPrefs: null, vocabulary: [] };
		}

		// Only analyze quality interactions (not ignored/corrected)
		const quality = recent.filter(i => i.quality_score >= 0.5);

		const tokenStats = this.analyzeTokenLengths(quality);
		const formatPrefs = this.analyzeFormatPreferences(recent);
		const vocabulary = this.extractVocabulary(recent);

		// Update preferences based on analysis
		if (tokenStats && quality.length >= 10) {
			const lengthPref = tokenStats.avgAssistantTokens < 80 ? 'short'
				: tokenStats.avgAssistantTokens < 250 ? 'medium'
				: 'long';
			const confidence = Math.min(0.95, 0.4 + quality.length * 0.01);
			setPreference('response_length', lengthPref, confidence, quality.length);
		}

		if (formatPrefs) {
			if (formatPrefs.bulletRatio > 0.4) {
				setPreference('format', 'bullets', Math.min(0.9, 0.5 + formatPrefs.bulletRatio * 0.5), recent.length);
			} else if (formatPrefs.codeRatio > 0.3) {
				setPreference('format', 'code_heavy', Math.min(0.9, 0.5 + formatPrefs.codeRatio * 0.5), recent.length);
			} else {
				setPreference('format', 'prose', 0.6, recent.length);
			}
		}

		return { tokenStats, formatPrefs, vocabulary };
	}

	/**
	 * Compute token length statistics for quality responses.
	 */
	private analyzeTokenLengths(interactions: Interaction[]): TokenStats | null {
		if (interactions.length === 0) return null;

		const userTokens = interactions.map(i => i.user_tokens);
		const assistantTokens = interactions.map(i => i.assistant_tokens);

		return {
			avgUserTokens: Math.round(avg(userTokens)),
			avgAssistantTokens: Math.round(avg(assistantTokens)),
			medianAssistantTokens: Math.round(median(assistantTokens)),
			p90AssistantTokens: Math.round(percentile(assistantTokens, 0.9)),
			sampleSize: interactions.length
		};
	}

	/**
	 * Detect formatting preferences from assistant responses the user engaged with.
	 */
	private analyzeFormatPreferences(interactions: Interaction[]): FormatPrefs | null {
		if (interactions.length === 0) return null;

		let bulletCount = 0;
		let codeCount = 0;
		let headingCount = 0;

		for (const i of interactions) {
			const msg = i.assistant_message;
			if (/^[\s]*[-*•]\s/m.test(msg)) bulletCount++;
			if (/```/.test(msg)) codeCount++;
			if (/^#+\s/m.test(msg)) headingCount++;
		}

		return {
			bulletRatio: bulletCount / interactions.length,
			codeRatio: codeCount / interactions.length,
			headingRatio: headingCount / interactions.length,
			sampleSize: interactions.length
		};
	}

	/**
	 * Extract unique terms the user uses frequently that aren't standard English.
	 * Returns terms sorted by frequency.
	 */
	private extractVocabulary(interactions: Interaction[]): VocabEntry[] {
		const termCounts = new Map<string, number>();

		for (const i of interactions) {
			const words = i.user_message.split(/\s+/);
			for (const word of words) {
				const clean = word.replace(/[^a-zA-Z0-9_-]/g, '');
				if (clean.length < 3 || COMMON_WORDS.has(clean.toLowerCase())) continue;

				// Detect likely domain terms: camelCase, PascalCase, UPPERCASE, has-dashes, has_underscores
				if (
					/[A-Z]/.test(clean) && /[a-z]/.test(clean) || // camelCase/PascalCase
					/^[A-Z]{2,}$/.test(clean) || // ACRONYM
					clean.includes('-') || // kebab-case
					clean.includes('_') // snake_case
				) {
					termCounts.set(clean, (termCounts.get(clean) || 0) + 1);
				}
			}
		}

		return Array.from(termCounts.entries())
			.filter(([_, count]) => count >= 3)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 50)
			.map(([term, count]) => ({ term, count }));
	}
}

// ── Types ──

export interface StyleProfile {
	tokenStats: TokenStats | null;
	formatPrefs: FormatPrefs | null;
	vocabulary: VocabEntry[];
}

interface TokenStats {
	avgUserTokens: number;
	avgAssistantTokens: number;
	medianAssistantTokens: number;
	p90AssistantTokens: number;
	sampleSize: number;
}

interface FormatPrefs {
	bulletRatio: number;
	codeRatio: number;
	headingRatio: number;
	sampleSize: number;
}

interface VocabEntry {
	term: string;
	count: number;
}

// ── Helpers ──

function avg(arr: number[]): number {
	return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr: number[]): number {
	const sorted = [...arr].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(arr: number[], p: number): number {
	const sorted = [...arr].sort((a, b) => a - b);
	const idx = Math.ceil(p * sorted.length) - 1;
	return sorted[Math.max(0, idx)];
}

// Common English words to ignore (top ~150)
const COMMON_WORDS = new Set([
	'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for',
	'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his',
	'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my',
	'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if',
	'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like',
	'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your',
	'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look',
	'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two',
	'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because',
	'any', 'these', 'give', 'day', 'most', 'us', 'are', 'was', 'were', 'been',
	'has', 'had', 'did', 'does', 'should', 'need', 'here', 'where', 'why', 'may',
	'still', 'very', 'much', 'too', 'let', 'yes', 'sure', 'right', 'the', 'will',
	'try', 'run', 'set', 'add', 'file', 'each', 'more', 'less', 'done', 'thing',
]);
