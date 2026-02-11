/*---------------------------------------------------------------------------------------------
 *  TARX Observer — Response Quality Collector
 *  Tracks implicit quality signals: edits, copies, ignores, follow-up corrections.
 *  Zero-latency: observes after the fact, never blocks interaction flow.
 *--------------------------------------------------------------------------------------------*/

import {
	recordInteraction, updateInteractionSignals, getLastInteraction, estimateTokens
} from '../storage.js';
import type { Interaction, InteractionInput } from '../types.js';

// Correction-detection patterns
const CORRECTION_PATTERNS = [
	/^no[,.]?\s/i,
	/^actually[,.]?\s/i,
	/^i meant\b/i,
	/^wrong\b/i,
	/^not what i (asked|meant|wanted)/i,
	/^that's (not right|wrong|incorrect)/i,
	/^correction:/i,
	/^instead[,.]?\s/i,
	/^let me (rephrase|clarify)/i,
];

// Topic-shift detection (coarse)
const TOPIC_SHIFT_PATTERNS = [
	/^(hey|ok|okay|so|now|next|moving on|different topic|anyway|btw|by the way)/i,
];

export class ResponseQualityCollector {

	private pendingInteractionId: string | null = null;
	private observationTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly OBSERVATION_WINDOW_MS = 30_000;

	/**
	 * Record a new interaction and start the observation window.
	 */
	observe(input: InteractionInput): Interaction {
		// Cancel any pending observation
		this.finalizePending('timeout');

		const interaction = recordInteraction(input);
		this.pendingInteractionId = interaction.id;

		// Start 30s observation window
		this.observationTimer = setTimeout(() => {
			this.finalizePending('timeout');
		}, this.OBSERVATION_WINDOW_MS);

		return interaction;
	}

	/**
	 * Called when the user sends a follow-up message.
	 * Analyzes it for correction patterns, topic shifts, or engagement.
	 */
	onFollowUp(userMessage: string): void {
		if (!this.pendingInteractionId) return;

		const id = this.pendingInteractionId;

		if (this.isCorrection(userMessage)) {
			updateInteractionSignals(id, {
				was_corrected: 1,
				correction_text: userMessage,
				quality_score: 0.2
			});
			this.clearPending();
			return;
		}

		if (this.isTopicShift(userMessage)) {
			updateInteractionSignals(id, {
				was_ignored: 1,
				quality_score: 0.3
			});
			this.clearPending();
			return;
		}

		// Engaged follow-up (builds on the response)
		updateInteractionSignals(id, {
			quality_score: 0.7
		});
		this.clearPending();
	}

	/**
	 * Called when user copies response text.
	 */
	onCopy(): void {
		if (!this.pendingInteractionId) return;
		updateInteractionSignals(this.pendingInteractionId, {
			was_copied: 1,
			quality_score: 0.9
		});
	}

	/**
	 * Called when user edits/regenerates a response.
	 */
	onEdit(): void {
		if (!this.pendingInteractionId) return;
		updateInteractionSignals(this.pendingInteractionId, {
			was_edited: 1,
			quality_score: 0.3
		});
	}

	/**
	 * Called when user explicitly rates a response.
	 */
	onRate(rating: 'thumbs_up' | 'thumbs_down'): void {
		if (!this.pendingInteractionId) return;
		updateInteractionSignals(this.pendingInteractionId, {
			rating,
			quality_score: rating === 'thumbs_up' ? 0.95 : 0.1
		});
	}

	/**
	 * Flag quality issues on the last interaction.
	 */
	flagIssues(issues: string[]): void {
		if (!this.pendingInteractionId) return;
		updateInteractionSignals(this.pendingInteractionId, {
			flagged_issues: JSON.stringify(issues)
		});
	}

	/**
	 * Get the current pending interaction ID (if any).
	 */
	getPendingId(): string | null {
		return this.pendingInteractionId;
	}

	// ── Private ──

	private isCorrection(message: string): boolean {
		const trimmed = message.trim();
		return CORRECTION_PATTERNS.some(p => p.test(trimmed));
	}

	private isTopicShift(message: string): boolean {
		const trimmed = message.trim();
		const lastInteraction = getLastInteraction();
		if (!lastInteraction) return false;

		// If the follow-up is very short AND matches topic-shift patterns
		if (estimateTokens(trimmed) < 15 && TOPIC_SHIFT_PATTERNS.some(p => p.test(trimmed))) {
			return true;
		}

		// If user and assistant messages share < 10% vocabulary, likely topic shift
		const prevWords = new Set(lastInteraction.assistant_message.toLowerCase().split(/\s+/));
		const newWords = trimmed.toLowerCase().split(/\s+/);
		const overlap = newWords.filter(w => prevWords.has(w) && w.length > 3).length;
		return overlap < newWords.length * 0.1 && newWords.length > 5;
	}

	private finalizePending(reason: 'timeout' | 'new_interaction'): void {
		if (this.pendingInteractionId && reason === 'timeout') {
			// No follow-up within 30s — moderate quality (user likely satisfied or left)
			updateInteractionSignals(this.pendingInteractionId, {
				quality_score: 0.6
			});
		}
		this.clearPending();
	}

	private clearPending(): void {
		if (this.observationTimer) {
			clearTimeout(this.observationTimer);
			this.observationTimer = null;
		}
		this.pendingInteractionId = null;
	}
}
