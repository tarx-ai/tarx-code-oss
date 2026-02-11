/*---------------------------------------------------------------------------------------------
 *  TARX Observer — Growth Analyzer
 *  Tracks user cognitive performance over time.
 *  Metrics: self-sufficiency, domain depth, tool mastery.
 *--------------------------------------------------------------------------------------------*/

import {
	getRecentInteractions, recordGrowthMetric, getGrowthMetrics,
	getDomainTerms, getDatabase
} from '../storage.js';
import type { AnalysisResult, GrowthDashboard } from '../types.js';

export class GrowthAnalyzer {

	/**
	 * Run weekly growth analysis.
	 * Computes 3 core metrics and stores them with the current period.
	 */
	run(): AnalysisResult {
		const interactions = getRecentInteractions(500);
		if (interactions.length < 20) {
			return { updated: 0, details: { reason: 'insufficient_data', count: interactions.length } };
		}

		const now = new Date();
		const period = this.getCurrentPeriod(now);
		let updated = 0;

		// ── Self-sufficiency ──
		const selfSufficiency = this.computeSelfSufficiency(interactions);
		recordGrowthMetric('self_sufficiency', selfSufficiency.score, period, selfSufficiency.details);
		updated++;

		// ── Domain depth ──
		const domainDepth = this.computeDomainDepth(interactions);
		recordGrowthMetric('domain_depth', domainDepth.score, period, domainDepth.details);
		updated++;

		// ── Tool mastery ──
		const toolMastery = this.computeToolMastery();
		recordGrowthMetric('tool_mastery', toolMastery.score, period, toolMastery.details);
		updated++;

		return {
			updated,
			details: {
				period,
				self_sufficiency: selfSufficiency.score,
				domain_depth: domainDepth.score,
				tool_mastery: toolMastery.score
			}
		};
	}

	/**
	 * Generate a human-readable growth dashboard.
	 */
	getDashboard(periodFilter?: 'week' | 'month' | 'all'): GrowthDashboard {
		const metrics: GrowthDashboard['metrics'] = [];

		for (const metricName of ['self_sufficiency', 'domain_depth', 'tool_mastery']) {
			const history = getGrowthMetrics(metricName);
			if (history.length === 0) continue;

			const current = history[0];
			const previous = history.length > 1 ? history[1] : null;

			let trend: 'improving' | 'stable' | 'declining' = 'stable';
			if (previous) {
				const diff = current.value - previous.value;
				if (diff > 0.05) trend = 'improving';
				else if (diff < -0.05) trend = 'declining';
			}

			const detailsObj = current.details ? JSON.parse(current.details) : {};

			metrics.push({
				metric: metricName,
				current_value: Math.round(current.value * 100) / 100,
				trend,
				details: this.formatMetricDetails(metricName, detailsObj)
			});
		}

		return {
			metrics,
			summary: this.generateSummary(metrics)
		};
	}

	// ── Self-sufficiency ──

	private computeSelfSufficiency(interactions: { user_message: string; quality_score: number }[]): {
		score: number;
		details: Record<string, unknown>;
	} {
		// Track question novelty: are they asking new things or repeating?
		const questionFingerprints = new Set<string>();
		let novelQuestions = 0;
		let repeatedQuestions = 0;

		for (const i of interactions) {
			const fingerprint = this.fingerprint(i.user_message);
			if (questionFingerprints.has(fingerprint)) {
				repeatedQuestions++;
			} else {
				novelQuestions++;
				questionFingerprints.add(fingerprint);
			}
		}

		const noveltyRatio = novelQuestions / Math.max(interactions.length, 1);

		// Also check question complexity (longer, more specific questions = more self-sufficient)
		const avgLength = interactions.reduce((sum, i) => sum + i.user_message.length, 0) / interactions.length;
		const complexityBonus = Math.min(0.2, avgLength / 1000);

		const score = Math.min(1.0, noveltyRatio * 0.8 + complexityBonus);

		return {
			score,
			details: {
				novel_questions: novelQuestions,
				repeated_questions: repeatedQuestions,
				novelty_ratio: Math.round(noveltyRatio * 100) / 100,
				avg_question_length: Math.round(avgLength)
			}
		};
	}

	// ── Domain depth ──

	private computeDomainDepth(interactions: { user_message: string }[]): {
		score: number;
		details: Record<string, unknown>;
	} {
		const domainTerms = getDomainTerms(100);
		const termSet = new Set(domainTerms.map(t => t.term.toLowerCase()));

		let domainTermUsage = 0;
		let totalWords = 0;
		const sophisticatedTerms = new Set<string>();

		for (const i of interactions) {
			const words = i.user_message.toLowerCase().split(/\s+/);
			totalWords += words.length;
			for (const word of words) {
				const clean = word.replace(/[^a-z0-9_-]/g, '');
				if (termSet.has(clean)) {
					domainTermUsage++;
					sophisticatedTerms.add(clean);
				}
			}
		}

		// Domain density: how often domain terms appear
		const density = domainTermUsage / Math.max(totalWords, 1);
		// Breadth: what fraction of known terms does the user use
		const breadth = sophisticatedTerms.size / Math.max(domainTerms.length, 1);

		const score = Math.min(1.0, density * 20 + breadth * 0.5);

		return {
			score,
			details: {
				domain_terms_used: sophisticatedTerms.size,
				total_domain_terms: domainTerms.length,
				density: Math.round(density * 1000) / 1000,
				breadth: Math.round(breadth * 100) / 100
			}
		};
	}

	// ── Tool mastery ──

	private computeToolMastery(): {
		score: number;
		details: Record<string, unknown>;
	} {
		const database = getDatabase();

		// Check if tool_usage table exists
		const tableExists = database.prepare(
			"SELECT name FROM sqlite_master WHERE type='table' AND name='tool_usage'"
		).get();

		if (!tableExists) {
			return { score: 0, details: { reason: 'no_tool_data' } };
		}

		const total = database.prepare('SELECT COUNT(*) FROM tool_usage').pluck().get() as number;
		const uniqueTools = database.prepare(
			'SELECT COUNT(DISTINCT tool_name) FROM tool_usage'
		).pluck().get() as number;

		// Known total tools across all MCP servers
		const TOTAL_AVAILABLE_TOOLS = 105; // 46 core + 47 ops + 8 observer + 4 future

		const breadth = uniqueTools / TOTAL_AVAILABLE_TOOLS;
		const depth = Math.min(1.0, total / 500); // 500 invocations = max depth

		const score = Math.min(1.0, breadth * 0.6 + depth * 0.4);

		return {
			score,
			details: {
				tools_used: uniqueTools,
				total_available: TOTAL_AVAILABLE_TOOLS,
				total_invocations: total,
				breadth: Math.round(breadth * 100) / 100,
				depth: Math.round(depth * 100) / 100
			}
		};
	}

	// ── Helpers ──

	private fingerprint(message: string): string {
		// Create a coarse fingerprint: sorted significant words
		const words = message.toLowerCase()
			.split(/\s+/)
			.filter(w => w.length > 3)
			.sort()
			.slice(0, 10);
		return words.join('|');
	}

	private getCurrentPeriod(date: Date): string {
		const year = date.getFullYear();
		const startOfYear = new Date(year, 0, 1);
		const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000);
		const week = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);
		return `${year}-W${String(week).padStart(2, '0')}`;
	}

	private formatMetricDetails(metric: string, details: Record<string, unknown>): string {
		switch (metric) {
			case 'self_sufficiency':
				return `${details.novel_questions || 0} novel questions, ${details.repeated_questions || 0} repeated. Avg question length: ${details.avg_question_length || 0} chars.`;
			case 'domain_depth':
				return `Using ${details.domain_terms_used || 0}/${details.total_domain_terms || 0} known domain terms. Density: ${details.density || 0}.`;
			case 'tool_mastery':
				return `${details.tools_used || 0}/${details.total_available || 0} tools used, ${details.total_invocations || 0} total invocations.`;
			default:
				return JSON.stringify(details);
		}
	}

	private generateSummary(metrics: GrowthDashboard['metrics']): string {
		if (metrics.length === 0) return 'No growth data available yet. Need at least 20 interactions.';

		const parts: string[] = [];
		for (const m of metrics) {
			const label = m.metric.replace(/_/g, ' ');
			const pct = Math.round(m.current_value * 100);
			const arrow = m.trend === 'improving' ? 'trending up' : m.trend === 'declining' ? 'trending down' : 'stable';
			parts.push(`${label}: ${pct}% (${arrow})`);
		}

		return parts.join('. ') + '.';
	}
}
