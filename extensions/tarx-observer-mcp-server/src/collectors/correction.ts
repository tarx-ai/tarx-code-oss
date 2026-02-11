/*---------------------------------------------------------------------------------------------
 *  TARX Observer — Correction Collector
 *  Captures "no I meant X" patterns and converts them into high-value training pairs.
 *  Also records model gaps for pattern analysis.
 *--------------------------------------------------------------------------------------------*/

import { getRecentInteractions, recordGap, addTrainingEntry } from '../storage.js';
import type { Interaction, TrainingEntry, ModelGap } from '../types.js';

export class CorrectionCollector {

	/**
	 * Process a corrected interaction: create training pair + model gap entry.
	 * Called by ResponseQualityCollector when was_corrected=1 is detected.
	 */
	processCorrection(interaction: Interaction): {
		trainingEntry: TrainingEntry;
		gap: ModelGap;
	} {
		const correctionText = interaction.correction_text || '';

		// Record the gap: wrong answer + correct answer
		const gap = recordGap(
			interaction.user_message.substring(0, 200), // pattern = original question
			interaction.assistant_message.substring(0, 500), // wrong
			correctionText.substring(0, 500) // correct
		);

		// Create HIGH VALUE training pair
		// The instruction is the original user message
		// The response is what the user corrected to (or a clean version)
		const trainingEntry = addTrainingEntry({
			instruction: interaction.user_message,
			response: this.cleanCorrectionResponse(correctionText, interaction.assistant_message),
			source: 'correction',
			quality_score: 0.85 // corrections are gold — user explicitly told us what's right
		});

		return { trainingEntry, gap };
	}

	/**
	 * Scan recent interactions for unprocessed corrections.
	 * Useful for batch processing on startup.
	 */
	scanForCorrections(limit: number = 50): number {
		const recent = getRecentInteractions(limit);
		let processed = 0;

		for (const interaction of recent) {
			if (interaction.was_corrected === 1 && interaction.correction_text) {
				this.processCorrection(interaction);
				processed++;
			}
		}

		return processed;
	}

	/**
	 * Build a clean response from the correction.
	 * If the correction is just "no, it's X", extract X as the actual response.
	 * If it's a full replacement, use it directly.
	 */
	private cleanCorrectionResponse(correction: string, originalResponse: string): string {
		const trimmed = correction.trim();

		// Strip correction prefixes: "no, ", "actually, ", "I meant ", etc.
		const cleaned = trimmed
			.replace(/^(no[,.]?\s*|actually[,.]?\s*|i meant\s*|wrong[,.]?\s*|correction:\s*|instead[,.]?\s*)/i, '')
			.trim();

		// If what's left is substantial (>20 chars), use it as the response
		if (cleaned.length > 20) {
			return cleaned;
		}

		// If correction is too short, it's likely just a hint — keep original response
		// but note the correction in a teaching format
		return `${cleaned}\n\n(Note: The previous response was incorrect. The user clarified: "${trimmed}")`;
	}
}
