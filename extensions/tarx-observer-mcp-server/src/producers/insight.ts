/*---------------------------------------------------------------------------------------------
 *  TARX Observer — Insight Producer
 *  Generates proactive suggestions from analyzer outputs.
 *  Surfaces patterns the user might find interesting or actionable.
 *--------------------------------------------------------------------------------------------*/

import {
	getRecentInteractions, getAllPreferences, getDomainTerms,
	getUnresolvedGaps, getGrowthMetrics, getTrainingQueueSize,
	getInteractionCount
} from '../storage.js';
import type { Insight } from '../types.js';

export class InsightProducer {

	/**
	 * Generate insights for a specific category or all categories.
	 */
	generate(category?: 'preferences' | 'domain' | 'gaps' | 'growth'): Insight[] {
		const insights: Insight[] = [];

		if (!category || category === 'preferences') {
			insights.push(...this.preferenceInsights());
		}
		if (!category || category === 'domain') {
			insights.push(...this.domainInsights());
		}
		if (!category || category === 'gaps') {
			insights.push(...this.gapInsights());
		}
		if (!category || category === 'growth') {
			insights.push(...this.growthInsights());
		}

		// Sort by confidence descending
		return insights.sort((a, b) => b.confidence - a.confidence);
	}

	// ── Preference insights ──

	private preferenceInsights(): Insight[] {
		const insights: Insight[] = [];
		const prefs = getAllPreferences();
		const interactions = getRecentInteractions(50);

		// Check for strong preferences
		const strongPrefs = prefs.filter(p => p.confidence >= 0.8);
		if (strongPrefs.length > 0) {
			insights.push({
				category: 'preferences',
				message: `Strong preferences detected: ${strongPrefs.map(p => `${p.key}=${p.value}`).join(', ')}. These are being used to shape responses.`,
				confidence: 0.9,
				evidence_count: strongPrefs.reduce((sum, p) => sum + p.evidence_count, 0)
			});
		}

		// Check for preference shifts
		if (interactions.length >= 30) {
			const recent = interactions.slice(0, 15);
			const older = interactions.slice(15, 30);
			const recentAvgLen = avg(recent.map(i => i.assistant_tokens));
			const olderAvgLen = avg(older.map(i => i.assistant_tokens));

			if (Math.abs(recentAvgLen - olderAvgLen) > 50) {
				const direction = recentAvgLen > olderAvgLen ? 'longer' : 'shorter';
				insights.push({
					category: 'preferences',
					message: `Your preferred response length seems to be shifting ${direction}. Recent avg: ${Math.round(recentAvgLen)} tokens vs. earlier: ${Math.round(olderAvgLen)} tokens.`,
					confidence: 0.7,
					evidence_count: 30
				});
			}
		}

		return insights;
	}

	// ── Domain insights ──

	private domainInsights(): Insight[] {
		const insights: Insight[] = [];
		const terms = getDomainTerms(50);

		// Trending terms (high frequency, recently seen)
		const now = Math.floor(Date.now() / 1000);
		const oneWeekAgo = now - 7 * 86400;
		const trending = terms.filter(t => t.last_seen > oneWeekAgo && t.frequency >= 5);

		if (trending.length > 0) {
			const topTrending = trending.slice(0, 5).map(t => `${t.term} (${t.frequency}x)`);
			insights.push({
				category: 'domain',
				message: `Trending topics this week: ${topTrending.join(', ')}`,
				confidence: 0.8,
				evidence_count: trending.reduce((sum, t) => sum + t.frequency, 0)
			});
		}

		// Terms without definitions
		const undefined_terms = terms.filter(t => !t.definition && t.frequency >= 3);
		if (undefined_terms.length > 0) {
			insights.push({
				category: 'domain',
				message: `${undefined_terms.length} frequently-used terms have no definition: ${undefined_terms.slice(0, 5).map(t => t.term).join(', ')}. Want me to learn what these mean?`,
				confidence: 0.6,
				evidence_count: undefined_terms.length
			});
		}

		return insights;
	}

	// ── Gap insights ──

	private gapInsights(): Insight[] {
		const insights: Insight[] = [];
		const gaps = getUnresolvedGaps();

		if (gaps.length > 0) {
			const recurring = gaps.filter(g => g.occurrence_count >= 3);
			if (recurring.length > 0) {
				insights.push({
					category: 'gaps',
					message: `${recurring.length} recurring errors detected. Most frequent: "${recurring[0].pattern.substring(0, 80)}..." (${recurring[0].occurrence_count} times). Training data has been generated to fix these.`,
					confidence: 0.85,
					evidence_count: recurring.reduce((sum, g) => sum + g.occurrence_count, 0)
				});
			}

			const queueSize = getTrainingQueueSize();
			if (queueSize >= 50) {
				insights.push({
					category: 'gaps',
					message: `Training queue has ${queueSize} curated examples ready for export. Consider running observer_export to capture them for fine-tuning.`,
					confidence: 0.9,
					evidence_count: queueSize
				});
			}
		}

		return insights;
	}

	// ── Growth insights ──

	private growthInsights(): Insight[] {
		const insights: Insight[] = [];
		const interactionCount = getInteractionCount();

		if (interactionCount < 20) {
			insights.push({
				category: 'growth',
				message: `Only ${interactionCount} interactions recorded. Need at least 20 for meaningful growth analysis.`,
				confidence: 0.5,
				evidence_count: interactionCount
			});
			return insights;
		}

		const metrics = getGrowthMetrics();
		if (metrics.length === 0) return insights;

		// Find the latest metric for each type
		const latestByType = new Map<string, typeof metrics[0]>();
		for (const m of metrics) {
			if (!latestByType.has(m.metric)) {
				latestByType.set(m.metric, m);
			}
		}

		for (const [name, metric] of latestByType.entries()) {
			const pct = Math.round(metric.value * 100);
			const label = name.replace(/_/g, ' ');

			if (metric.value >= 0.8) {
				insights.push({
					category: 'growth',
					message: `${label} is at ${pct}% — excellent. You're operating at a high level in this area.`,
					confidence: 0.8,
					evidence_count: interactionCount
				});
			} else if (metric.value < 0.3) {
				insights.push({
					category: 'growth',
					message: `${label} is at ${pct}% — there's room to grow here. This could improve with more diverse interactions.`,
					confidence: 0.7,
					evidence_count: interactionCount
				});
			}
		}

		return insights;
	}
}

// ── Helpers ──

function avg(arr: number[]): number {
	if (arr.length === 0) return 0;
	return arr.reduce((a, b) => a + b, 0) / arr.length;
}
