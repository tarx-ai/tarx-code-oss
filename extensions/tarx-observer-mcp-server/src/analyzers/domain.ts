/*---------------------------------------------------------------------------------------------
 *  TARX Observer — Domain Analyzer
 *  Builds vocabulary and expertise model from user interactions.
 *  Auto-categorizes terms and tracks frequency/recency.
 *--------------------------------------------------------------------------------------------*/

import { getRecentInteractions, upsertDomainTerm, getDomainTerms } from '../storage.js';
import type { Interaction, AnalysisResult, DomainTerm } from '../types.js';

// Category inference patterns
const CATEGORY_PATTERNS: Array<{ category: string; patterns: RegExp[] }> = [
	{
		category: 'project',
		patterns: [
			/\b(project|build|ship|deploy|release|launch|repo|codebase)\b/i
		]
	},
	{
		category: 'tool',
		patterns: [
			/\b(tool|command|cli|server|api|endpoint|sdk|framework|library)\b/i
		]
	},
	{
		category: 'person',
		patterns: [
			/\b(says?|told|asked|mentioned|according to|talked to|team|person)\b/i,
			/\b(he|she|they)\s+(said|told|asked|wants?|thinks?)\b/i
		]
	},
	{
		category: 'concept',
		patterns: [
			/\b(concept|pattern|architecture|design|approach|strategy|method)\b/i
		]
	},
	{
		category: 'tech',
		patterns: [
			/\b(typescript|python|react|node|sql|mcp|llm|ai|model|gpu|cpu)\b/i
		]
	}
];

// Common English words to skip (extended)
const SKIP_WORDS = new Set([
	'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
	'her', 'was', 'one', 'our', 'out', 'has', 'his', 'how', 'its', 'may',
	'new', 'now', 'old', 'see', 'way', 'who', 'did', 'get', 'has', 'him',
	'let', 'say', 'she', 'too', 'use', 'been', 'call', 'come', 'each',
	'from', 'have', 'just', 'know', 'like', 'long', 'look', 'make', 'many',
	'most', 'much', 'must', 'name', 'only', 'over', 'such', 'take', 'than',
	'them', 'then', 'very', 'when', 'will', 'with', 'would', 'about', 'after',
	'also', 'back', 'been', 'being', 'could', 'first', 'given', 'going',
	'great', 'might', 'needs', 'never', 'other', 'right', 'shall', 'since',
	'still', 'their', 'there', 'these', 'thing', 'think', 'those', 'three',
	'under', 'using', 'where', 'which', 'while', 'world', 'would', 'years',
	'should', 'before', 'between', 'every', 'really', 'some', 'what', 'this',
	'that', 'want', 'work', 'well', 'sure', 'okay', 'yeah', 'yes', 'thanks',
	'please', 'here', 'help', 'need', 'does', 'done', 'good',
]);

export class DomainAnalyzer {

	/**
	 * Scan recent interactions for recurring domain-specific terms.
	 * Updates domain_knowledge table with new terms and frequency bumps.
	 */
	run(): AnalysisResult {
		const interactions = getRecentInteractions(200);
		if (interactions.length < 5) {
			return { updated: 0, details: { reason: 'insufficient_data' } };
		}

		const termCounts = this.extractTerms(interactions);
		let updated = 0;
		const newTerms: string[] = [];
		const bumpedTerms: string[] = [];

		for (const [term, info] of termCounts.entries()) {
			if (info.count < 2) continue; // Need at least 2 occurrences

			const category = this.inferCategory(term, info.contexts);
			const existing = getDomainTerms(1000).find(t => t.term === term);

			if (existing) {
				upsertDomainTerm(term, undefined, category || undefined);
				bumpedTerms.push(term);
			} else {
				upsertDomainTerm(term, undefined, category || undefined);
				newTerms.push(term);
			}
			updated++;
		}

		return {
			updated,
			details: {
				scanned_interactions: interactions.length,
				unique_terms: termCounts.size,
				new_terms: newTerms,
				bumped_terms: bumpedTerms
			}
		};
	}

	/**
	 * Extract candidate domain terms from user messages.
	 */
	private extractTerms(interactions: Interaction[]): Map<string, TermInfo> {
		const terms = new Map<string, TermInfo>();

		for (const interaction of interactions) {
			const words = interaction.user_message.split(/\s+/);
			const contextWindow = interaction.user_message.substring(0, 200);

			for (const word of words) {
				const clean = word.replace(/[^a-zA-Z0-9_.-]/g, '');
				if (clean.length < 2 || SKIP_WORDS.has(clean.toLowerCase())) continue;

				// Domain term heuristics
				if (this.isDomainCandidate(clean)) {
					const existing = terms.get(clean) || { count: 0, contexts: [] };
					existing.count++;
					if (existing.contexts.length < 5) {
						existing.contexts.push(contextWindow);
					}
					terms.set(clean, existing);
				}
			}
		}

		return terms;
	}

	/**
	 * Check if a word looks like a domain-specific term.
	 */
	private isDomainCandidate(word: string): boolean {
		// CamelCase or PascalCase
		if (/[a-z][A-Z]/.test(word)) return true;
		// ALL_CAPS (likely acronym/constant)
		if (/^[A-Z][A-Z0-9_]{1,}$/.test(word)) return true;
		// Contains dots (qualified names)
		if (word.includes('.') && word.length > 3) return true;
		// kebab-case or snake_case
		if ((word.includes('-') || word.includes('_')) && word.length > 3) return true;
		// Starts with capital, not just capitalized first word
		if (/^[A-Z][a-z]+[A-Z]/.test(word)) return true;
		// Known tech patterns
		if (/^(tarx|mcp|llm|rag|lora|gpu|api|sdk|cli|sql|npm|git)\b/i.test(word)) return true;

		return false;
	}

	/**
	 * Infer the category of a term from the contexts it appears in.
	 */
	private inferCategory(term: string, contexts: string[]): string | null {
		const combinedContext = contexts.join(' ').toLowerCase();

		for (const { category, patterns } of CATEGORY_PATTERNS) {
			if (patterns.some(p => p.test(combinedContext))) {
				return category;
			}
		}

		// Fallback heuristics
		if (/^[A-Z][a-z]+$/.test(term)) return 'person'; // Capitalized single word
		if (term.includes('-server') || term.includes('-mcp')) return 'tool';
		if (term.startsWith('tarx')) return 'project';

		return null;
	}
}

interface TermInfo {
	count: number;
	contexts: string[];
}
