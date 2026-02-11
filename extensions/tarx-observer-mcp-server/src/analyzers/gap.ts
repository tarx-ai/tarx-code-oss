/*---------------------------------------------------------------------------------------------
 *  TARX Observer — Gap Analyzer
 *  Identifies patterns where the model repeatedly gets things wrong.
 *  Generates synthetic training pairs to address gaps.
 *--------------------------------------------------------------------------------------------*/

import {
	getUnresolvedGaps, addTrainingEntry, resolveGap, getRecentInteractions
} from '../storage.js';
import type { ModelGap, AnalysisResult } from '../types.js';

export class GapAnalyzer {

	/**
	 * Analyze unresolved model gaps.
	 * Group similar gaps, generate synthetic training pairs to fix them.
	 */
	run(): AnalysisResult {
		const gaps = getUnresolvedGaps();
		if (gaps.length === 0) {
			return { updated: 0, details: { reason: 'no_gaps' } };
		}

		const groups = this.groupSimilarGaps(gaps);
		let trainingPairsGenerated = 0;
		const details: Record<string, unknown> = { groups: groups.length };

		for (const group of groups) {
			// Only generate training data for gaps that have occurred 2+ times
			// or have a clear correct response
			const primary = group[0];
			if (primary.occurrence_count < 2 && group.length < 2) continue;

			const pairs = this.generateTrainingPairs(group);
			trainingPairsGenerated += pairs;
		}

		return {
			updated: trainingPairsGenerated,
			details: {
				...details,
				total_gaps: gaps.length,
				training_pairs_generated: trainingPairsGenerated
			}
		};
	}

	/**
	 * Group gaps by similarity (same topic area, similar wrong answers).
	 */
	private groupSimilarGaps(gaps: ModelGap[]): ModelGap[][] {
		const groups: ModelGap[][] = [];
		const used = new Set<string>();

		for (const gap of gaps) {
			if (used.has(gap.id)) continue;

			const group = [gap];
			used.add(gap.id);

			// Find similar gaps
			for (const other of gaps) {
				if (used.has(other.id)) continue;
				if (this.areSimilar(gap, other)) {
					group.push(other);
					used.add(other.id);
				}
			}

			groups.push(group);
		}

		return groups;
	}

	/**
	 * Check if two gaps are about the same issue.
	 */
	private areSimilar(a: ModelGap, b: ModelGap): boolean {
		// Simple word overlap heuristic
		const aWords = new Set(a.pattern.toLowerCase().split(/\s+/).filter(w => w.length > 3));
		const bWords = b.pattern.toLowerCase().split(/\s+/).filter(w => w.length > 3);

		const overlap = bWords.filter(w => aWords.has(w)).length;
		const similarity = overlap / Math.max(aWords.size, bWords.length, 1);

		return similarity > 0.3;
	}

	/**
	 * Generate synthetic training pairs from a group of related gaps.
	 * Creates variations of the question + correct answer.
	 */
	private generateTrainingPairs(group: ModelGap[]): number {
		const primary = group[0];
		if (!primary.correct_response) return 0;

		// Create the direct correction pair
		addTrainingEntry({
			instruction: primary.pattern,
			response: primary.correct_response,
			source: 'synthetic',
			quality_score: 0.8
		});

		// Generate variations of the question
		const variations = this.generateVariations(primary.pattern);
		for (const variation of variations) {
			addTrainingEntry({
				instruction: variation,
				response: primary.correct_response,
				source: 'synthetic',
				quality_score: 0.75
			});
		}

		// If there's a wrong response, create a DPO-style pair too
		// (stored separately for DPO training if desired)
		if (primary.wrong_response) {
			addTrainingEntry({
				instruction: `[DPO:REJECTED] ${primary.pattern}`,
				response: primary.wrong_response,
				source: 'synthetic',
				quality_score: 0.1 // Low quality = bad example for DPO
			});
		}

		return 1 + variations.length + (primary.wrong_response ? 1 : 0);
	}

	/**
	 * Generate rephrased versions of a question to strengthen training signal.
	 */
	private generateVariations(pattern: string): string[] {
		const variations: string[] = [];
		const trimmed = pattern.trim();

		// Variation 1: Add "Can you tell me" prefix
		if (!trimmed.toLowerCase().startsWith('can you') && !trimmed.toLowerCase().startsWith('what')) {
			variations.push(`Can you tell me: ${trimmed}`);
		}

		// Variation 2: Rephrase as direct question
		if (!trimmed.endsWith('?')) {
			variations.push(`${trimmed}?`);
		}

		// Variation 3: "Explain" prefix
		if (!trimmed.toLowerCase().startsWith('explain')) {
			variations.push(`Explain: ${trimmed}`);
		}

		return variations.slice(0, 3); // Max 3 variations per gap
	}
}
