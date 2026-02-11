/*---------------------------------------------------------------------------------------------
 *  TARX Observer — MCP Server (Tool Registration + Handlers)
 *  8 tools for user modeling, training data curation, and cognitive growth tracking.
 *--------------------------------------------------------------------------------------------*/

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
	getObserverStatus, getAllPreferences, setPreference, deletePreference,
	getTrainingQueue, getTrainingQueueSize, getUnresolvedGaps, recordGap,
	addTrainingEntry, createTrainingRun, getDomainTerms,
	deleteInteraction, deleteDomainTerm, deleteGap, deleteByPattern,
	getInteractionCount, getMeta, upsertDomainTerm
} from './storage.js';

import { ResponseQualityCollector } from './collectors/response-quality.js';
import { CorrectionCollector } from './collectors/correction.js';
import { StyleCollector } from './collectors/style.js';
import { ToolUseCollector } from './collectors/tool-use.js';

import { PreferenceAnalyzer } from './analyzers/preference.js';
import { DomainAnalyzer } from './analyzers/domain.js';
import { GapAnalyzer } from './analyzers/gap.js';
import { GrowthAnalyzer } from './analyzers/growth.js';

import { SystemPromptProducer } from './producers/system-prompt.js';
import { TrainingDataProducer } from './producers/training-data.js';
import { MemoryGraphProducer } from './producers/memory-graph.js';
import { InsightProducer } from './producers/insight.js';

// ── Singleton instances ──

const qualityCollector = new ResponseQualityCollector();
const correctionCollector = new CorrectionCollector();
const styleCollector = new StyleCollector();
const toolUseCollector = new ToolUseCollector();

const preferenceAnalyzer = new PreferenceAnalyzer();
const domainAnalyzer = new DomainAnalyzer();
const gapAnalyzer = new GapAnalyzer();
const growthAnalyzer = new GrowthAnalyzer();

const systemPromptProducer = new SystemPromptProducer();
const trainingDataProducer = new TrainingDataProducer(systemPromptProducer);
const memoryGraphProducer = new MemoryGraphProducer();
const insightProducer = new InsightProducer();

// Export for scheduler + index
export {
	qualityCollector, correctionCollector, styleCollector, toolUseCollector,
	preferenceAnalyzer, domainAnalyzer, gapAnalyzer, growthAnalyzer,
	systemPromptProducer, trainingDataProducer, memoryGraphProducer, insightProducer
};

// ── MCP Server ──

export const server = new McpServer({
	name: "tarx-observer",
	version: "1.0.0"
});

// ── Tool 1: observer_status ──

server.tool(
	"observer_status",
	"Get Observer status: interactions captured, preferences learned, domain terms, model gaps, training queue size, quality average",
	{},
	async () => {
		try {
			const status = getObserverStatus();
			const systemPrompt = systemPromptProducer.generate();

			return {
				content: [{
					type: "text",
					text: JSON.stringify({
						...status,
						current_system_prompt: systemPrompt,
						scheduler_active: getMeta('scheduler_active') === 'true',
						version: "1.0.0"
					}, null, 2)
				}]
			};
		} catch (error) {
			return {
				content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
				isError: true
			};
		}
	}
);

// ── Tool 2: observer_insights ──

server.tool(
	"observer_insights",
	"Get Observer insights: what it has learned about the user. Filter by category: preferences, domain, gaps, growth",
	{
		category: z.enum(["preferences", "domain", "gaps", "growth"]).optional()
			.describe("Filter insights by category. Omit for all categories.")
	},
	async ({ category }) => {
		try {
			const insights = insightProducer.generate(category);
			return {
				content: [{
					type: "text",
					text: JSON.stringify({ insights, count: insights.length }, null, 2)
				}]
			};
		} catch (error) {
			return {
				content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
				isError: true
			};
		}
	}
);

// ── Tool 3: observer_export ──

server.tool(
	"observer_export",
	"Export curated training data as JSONL or JSON. Filters by quality score, optionally includes system prompt context.",
	{
		min_quality: z.number().min(0).max(1).optional()
			.describe("Minimum quality score (0.0-1.0). Default: 0.6"),
		format: z.enum(["jsonl", "json"]).optional()
			.describe("Output format. Default: jsonl"),
		include_system: z.boolean().optional()
			.describe("Include system prompt context with each entry. Default: true")
	},
	async ({ min_quality, format, include_system }) => {
		try {
			const result = trainingDataProducer.export({
				minQuality: min_quality,
				format,
				includeSystem: include_system
			});

			if (result.count === 0) {
				return {
					content: [{
						type: "text",
						text: JSON.stringify({
							message: "No unexported training data above quality threshold",
							queue_size: getTrainingQueueSize(),
							min_quality: min_quality ?? 0.6
						}, null, 2)
					}]
				};
			}

			return {
				content: [{
					type: "text",
					text: JSON.stringify({
						exported: true,
						path: result.path,
						count: result.count,
						total_tokens: result.total_tokens,
						stats: trainingDataProducer.getStats()
					}, null, 2)
				}]
			};
		} catch (error) {
			return {
				content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
				isError: true
			};
		}
	}
);

// ── Tool 4: observer_correct ──

server.tool(
	"observer_correct",
	"Explicitly correct a model belief. Creates a training pair and records the gap for future fixing.",
	{
		topic: z.string().describe("What the correction is about"),
		wrong: z.string().describe("What Observer/model believed (the incorrect information)"),
		correct: z.string().describe("What it should be (the correct information)")
	},
	async ({ topic, wrong, correct }) => {
		try {
			// Record the gap
			const gap = recordGap(topic, wrong, correct);

			// Create high-value training pair
			const entry = addTrainingEntry({
				instruction: `What is correct about: ${topic}`,
				response: correct,
				source: 'correction',
				quality_score: 0.9
			});

			// Also create a correction-style training pair
			addTrainingEntry({
				instruction: topic,
				response: correct,
				source: 'correction',
				quality_score: 0.85
			});

			// If the correction is about a domain term, update domain knowledge
			upsertDomainTerm(topic, correct, 'concept');

			return {
				content: [{
					type: "text",
					text: JSON.stringify({
						gap_id: gap.id,
						training_pairs_generated: 2,
						domain_term_updated: true,
						message: `Recorded correction: "${topic}". Wrong: "${wrong.substring(0, 80)}...". Correct: "${correct.substring(0, 80)}...". 2 training pairs generated.`
					}, null, 2)
				}]
			};
		} catch (error) {
			return {
				content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
				isError: true
			};
		}
	}
);

// ── Tool 5: observer_forget ──

server.tool(
	"observer_forget",
	"Remove something from Observer's memory: a preference, domain term, gap, or interaction. Use for privacy or corrections.",
	{
		type: z.enum(["preference", "domain_term", "gap", "interaction"])
			.describe("What type of data to forget"),
		id: z.string().optional()
			.describe("Specific record ID to delete"),
		pattern: z.string().optional()
			.describe("Match by content pattern (used if no ID provided)")
	},
	async ({ type, id, pattern }) => {
		try {
			let deleted = 0;

			if (id) {
				switch (type) {
					case 'preference':
						deleted = deletePreference(id) ? 1 : 0;
						break;
					case 'domain_term':
						deleted = deleteDomainTerm(id) ? 1 : 0;
						break;
					case 'gap':
						deleted = deleteGap(id) ? 1 : 0;
						break;
					case 'interaction':
						deleted = deleteInteraction(id) ? 1 : 0;
						break;
				}
			} else if (pattern) {
				const tableMap: Record<string, { table: string; column: string }> = {
					preference: { table: 'preferences', column: 'key' },
					domain_term: { table: 'domain_knowledge', column: 'term' },
					gap: { table: 'model_gaps', column: 'pattern' },
					interaction: { table: 'interactions', column: 'user_message' }
				};
				const { table, column } = tableMap[type];
				deleted = deleteByPattern(table, column, pattern);
			}

			return {
				content: [{
					type: "text",
					text: JSON.stringify({
						deleted_count: deleted,
						type,
						id: id || undefined,
						pattern: pattern || undefined
					}, null, 2)
				}]
			};
		} catch (error) {
			return {
				content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
				isError: true
			};
		}
	}
);

// ── Tool 6: observer_train ──

server.tool(
	"observer_train",
	"Trigger a training run (or dry run). Uses curated data from the training queue. Future: mesh-distributed.",
	{
		method: z.enum(["lora", "dpo"]).optional()
			.describe("Training method. Default: lora"),
		min_examples: z.number().optional()
			.describe("Minimum examples required to proceed. Default: 100"),
		dry_run: z.boolean().optional()
			.describe("If true, report what would train without actually starting. Default: false")
	},
	async ({ method = "lora", min_examples = 100, dry_run = false }) => {
		try {
			const queue = getTrainingQueue(0.6, true);
			const stats = trainingDataProducer.getStats();

			if (queue.length < min_examples) {
				return {
					content: [{
						type: "text",
						text: JSON.stringify({
							status: "insufficient_data",
							available: queue.length,
							required: min_examples,
							message: `Need ${min_examples - queue.length} more curated examples. Current queue: ${queue.length} (avg quality: ${stats.avgQuality}).`,
							stats
						}, null, 2)
					}]
				};
			}

			if (dry_run) {
				return {
					content: [{
						type: "text",
						text: JSON.stringify({
							status: "dry_run",
							would_train: queue.length,
							method,
							estimated_time: method === 'lora' ? '15-30 minutes' : '45-90 minutes',
							quality_distribution: {
								high: queue.filter(e => e.quality_score >= 0.8).length,
								medium: queue.filter(e => e.quality_score >= 0.6 && e.quality_score < 0.8).length,
							},
							stats
						}, null, 2)
					}]
				};
			}

			// Create training run record
			const run = createTrainingRun(method, queue.length);

			return {
				content: [{
					type: "text",
					text: JSON.stringify({
						run_id: run.id,
						examples_count: queue.length,
						method,
						status: "queued",
						estimated_time: method === 'lora' ? '15-30 minutes' : '45-90 minutes',
						message: `Training run ${run.id} queued with ${queue.length} examples using ${method}. Waiting for mesh compute or local GPU.`
					}, null, 2)
				}]
			};
		} catch (error) {
			return {
				content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
				isError: true
			};
		}
	}
);

// ── Tool 7: observer_preferences ──

server.tool(
	"observer_preferences",
	"View, update, or delete learned user preferences.",
	{
		action: z.enum(["list", "update", "delete"])
			.describe("What to do: list all, update one, or delete one"),
		key: z.string().optional()
			.describe("Preference key (required for update/delete)"),
		value: z.string().optional()
			.describe("New value (required for update)")
	},
	async ({ action, key, value }) => {
		try {
			switch (action) {
				case 'list': {
					const prefs = getAllPreferences();
					return {
						content: [{
							type: "text",
							text: JSON.stringify({
								preferences: prefs,
								count: prefs.length
							}, null, 2)
						}]
					};
				}
				case 'update': {
					if (!key || !value) {
						return {
							content: [{ type: "text", text: JSON.stringify({ error: "key and value required for update" }) }],
							isError: true
						};
					}
					setPreference(key, value, 1.0, 1); // Manual update = full confidence
					return {
						content: [{
							type: "text",
							text: JSON.stringify({
								updated: true,
								key,
								value,
								confidence: 1.0,
								source: "manual"
							}, null, 2)
						}]
					};
				}
				case 'delete': {
					if (!key) {
						return {
							content: [{ type: "text", text: JSON.stringify({ error: "key required for delete" }) }],
							isError: true
						};
					}
					const deleted = deletePreference(key);
					return {
						content: [{
							type: "text",
							text: JSON.stringify({ deleted, key }, null, 2)
						}]
					};
				}
			}
		} catch (error) {
			return {
				content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
				isError: true
			};
		}
	}
);

// ── Tool 8: observer_growth ──

server.tool(
	"observer_growth",
	"View cognitive growth dashboard: self-sufficiency, domain depth, tool mastery, with trends over time.",
	{
		period: z.enum(["week", "month", "all"]).optional()
			.describe("Time period for growth data. Default: all")
	},
	async ({ period }) => {
		try {
			const dashboard = growthAnalyzer.getDashboard(period);

			if (dashboard.metrics.length === 0 && getInteractionCount() < 20) {
				return {
					content: [{
						type: "text",
						text: JSON.stringify({
							message: `Need at least 20 interactions for growth analysis. Currently: ${getInteractionCount()}.`,
							metrics: [],
							summary: "Collecting data..."
						}, null, 2)
					}]
				};
			}

			return {
				content: [{
					type: "text",
					text: JSON.stringify(dashboard, null, 2)
				}]
			};
		} catch (error) {
			return {
				content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
				isError: true
			};
		}
	}
);
