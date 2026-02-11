/*---------------------------------------------------------------------------------------------
 *  TARX Observer — Preference Analyzer
 *  Distills style, tone, and length preferences from interaction history.
 *  Runs periodically (every 30 minutes) or on explicit trigger.
 *--------------------------------------------------------------------------------------------*/

import { getRecentInteractions, setPreference, getAllPreferences } from '../storage.js';
import type { Interaction, AnalysisResult } from '../types.js';

export class PreferenceAnalyzer {

	/**
	 * Analyze last 100 interactions and update preference table.
	 * Only updates if confidence > 0.6 (enough evidence).
	 */
	run(): AnalysisResult {
		const interactions = getRecentInteractions(100);
		if (interactions.length < 10) {
			return { updated: 0, details: { reason: 'insufficient_data', count: interactions.length } };
		}

		let updated = 0;
		const details: Record<string, unknown> = {};

		// ── Response length preference ──
		const qualityInteractions = interactions.filter(i => i.quality_score >= 0.6);
		if (qualityInteractions.length >= 10) {
			const avgTokens = avg(qualityInteractions.map(i => i.assistant_tokens));
			const lengthPref = avgTokens < 60 ? 'very_short'
				: avgTokens < 120 ? 'short'
				: avgTokens < 300 ? 'medium'
				: avgTokens < 600 ? 'long'
				: 'very_long';
			const confidence = Math.min(0.95, 0.5 + qualityInteractions.length * 0.005);
			setPreference('response_length', lengthPref, confidence, qualityInteractions.length);
			details.response_length = { value: lengthPref, avgTokens: Math.round(avgTokens), evidence: qualityInteractions.length };
			updated++;
		}

		// ── Tone preference ──
		const toneSignals = this.analyzeTone(interactions);
		if (toneSignals.confidence >= 0.6) {
			setPreference('tone', toneSignals.value, toneSignals.confidence, toneSignals.evidence);
			details.tone = toneSignals;
			updated++;
		}

		// ── Detail level preference ──
		const detailSignals = this.analyzeDetailLevel(qualityInteractions);
		if (detailSignals.confidence >= 0.6) {
			setPreference('detail_level', detailSignals.value, detailSignals.confidence, detailSignals.evidence);
			details.detail_level = detailSignals;
			updated++;
		}

		// ── Hedging tolerance ──
		const hedgingSignals = this.analyzeHedgingTolerance(interactions);
		if (hedgingSignals.confidence >= 0.6) {
			setPreference('hedging', hedgingSignals.value, hedgingSignals.confidence, hedgingSignals.evidence);
			details.hedging = hedgingSignals;
			updated++;
		}

		// ── Code style ──
		const codeSignals = this.analyzeCodeStyle(interactions);
		if (codeSignals.confidence >= 0.6) {
			setPreference('code_style', codeSignals.value, codeSignals.confidence, codeSignals.evidence);
			details.code_style = codeSignals;
			updated++;
		}

		return { updated, details };
	}

	// ── Tone analysis ──

	private analyzeTone(interactions: Interaction[]): { value: string; confidence: number; evidence: number } {
		// Check user message patterns for tone cues
		let directCues = 0;
		let casualCues = 0;
		let formalCues = 0;

		for (const i of interactions) {
			const msg = i.user_message.toLowerCase();
			if (/\b(just|quick|short|brief|tldr)\b/.test(msg)) directCues++;
			if (/\b(hey|lol|haha|btw|gonna|wanna)\b/.test(msg)) casualCues++;
			if (/\b(please|kindly|would you|could you|appreciate)\b/.test(msg)) formalCues++;
		}

		const total = directCues + casualCues + formalCues;
		if (total < 5) return { value: 'neutral', confidence: 0.4, evidence: total };

		if (directCues >= casualCues && directCues >= formalCues) {
			return { value: 'direct', confidence: Math.min(0.9, 0.5 + directCues / total * 0.5), evidence: directCues };
		}
		if (casualCues >= formalCues) {
			return { value: 'casual', confidence: Math.min(0.9, 0.5 + casualCues / total * 0.5), evidence: casualCues };
		}
		return { value: 'formal', confidence: Math.min(0.9, 0.5 + formalCues / total * 0.5), evidence: formalCues };
	}

	// ── Detail level analysis ──

	private analyzeDetailLevel(interactions: Interaction[]): { value: string; confidence: number; evidence: number } {
		if (interactions.length < 5) return { value: 'moderate', confidence: 0.3, evidence: 0 };

		// Correlate user engagement with response length
		const short = interactions.filter(i => i.assistant_tokens < 100);
		const long = interactions.filter(i => i.assistant_tokens > 200);

		const shortQuality = short.length > 0 ? avg(short.map(i => i.quality_score)) : 0.5;
		const longQuality = long.length > 0 ? avg(long.map(i => i.quality_score)) : 0.5;

		if (shortQuality > longQuality + 0.15) {
			return { value: 'minimal', confidence: Math.min(0.85, 0.5 + (shortQuality - longQuality)), evidence: short.length };
		}
		if (longQuality > shortQuality + 0.15) {
			return { value: 'comprehensive', confidence: Math.min(0.85, 0.5 + (longQuality - shortQuality)), evidence: long.length };
		}
		return { value: 'moderate', confidence: 0.6, evidence: interactions.length };
	}

	// ── Hedging tolerance ──

	private analyzeHedgingTolerance(interactions: Interaction[]): { value: string; confidence: number; evidence: number } {
		const HEDGING_PATTERNS = [
			/\b(perhaps|maybe|might|could be|it's possible|i think|i believe)\b/i,
			/\b(i'm not sure|i'm uncertain|it seems|appears to)\b/i
		];

		let hedgedAndCorrected = 0;
		let hedgedAndAccepted = 0;

		for (const i of interactions) {
			const hasHedging = HEDGING_PATTERNS.some(p => p.test(i.assistant_message));
			if (hasHedging) {
				if (i.was_corrected || i.quality_score < 0.4) {
					hedgedAndCorrected++;
				} else {
					hedgedAndAccepted++;
				}
			}
		}

		const total = hedgedAndCorrected + hedgedAndAccepted;
		if (total < 3) return { value: 'tolerated', confidence: 0.3, evidence: total };

		if (hedgedAndCorrected > hedgedAndAccepted) {
			return { value: 'never', confidence: Math.min(0.9, 0.6 + hedgedAndCorrected / total * 0.3), evidence: total };
		}
		return { value: 'tolerated', confidence: 0.6, evidence: total };
	}

	// ── Code style analysis ──

	private analyzeCodeStyle(interactions: Interaction[]): { value: string; confidence: number; evidence: number } {
		let codeRequests = 0;
		let explanationRequests = 0;

		for (const i of interactions) {
			const msg = i.user_message.toLowerCase();
			if (/\b(code|implement|write|function|script|snippet)\b/.test(msg)) codeRequests++;
			if (/\b(explain|why|how does|what does|describe)\b/.test(msg)) explanationRequests++;
		}

		const total = codeRequests + explanationRequests;
		if (total < 5) return { value: 'balanced', confidence: 0.3, evidence: total };

		if (codeRequests > explanationRequests * 1.5) {
			return { value: 'code_first', confidence: Math.min(0.85, 0.5 + codeRequests / total * 0.4), evidence: codeRequests };
		}
		if (explanationRequests > codeRequests * 1.5) {
			return { value: 'explanation_first', confidence: Math.min(0.85, 0.5 + explanationRequests / total * 0.4), evidence: explanationRequests };
		}
		return { value: 'balanced', confidence: 0.6, evidence: total };
	}
}

// ── Helpers ──

function avg(arr: number[]): number {
	if (arr.length === 0) return 0;
	return arr.reduce((a, b) => a + b, 0) / arr.length;
}
