/*---------------------------------------------------------------------------------------------
 *  TARX Observer — Tool Use Collector
 *  Logs MCP tool invocations: frequency, context, time patterns.
 *  After 50+ observations, computes usage profiles and preferred tools.
 *--------------------------------------------------------------------------------------------*/

import { setPreference, getMeta, setMeta, getDatabase } from '../storage.js';

export interface ToolInvocation {
	tool_name: string;
	timestamp: number;
	context_summary?: string;
	success: boolean;
}

export class ToolUseCollector {

	private invocations: ToolInvocation[] = [];
	private readonly BATCH_SIZE = 20;

	/**
	 * Record a tool invocation.
	 */
	record(invocation: ToolInvocation): void {
		this.invocations.push(invocation);

		// Flush to DB periodically
		if (this.invocations.length >= this.BATCH_SIZE) {
			this.flush();
		}
	}

	/**
	 * Record multiple tool invocations at once (e.g., from a batch event).
	 */
	recordBatch(tools: string[]): void {
		const now = Math.floor(Date.now() / 1000);
		for (const tool of tools) {
			this.invocations.push({
				tool_name: tool,
				timestamp: now,
				success: true
			});
		}
		if (this.invocations.length >= this.BATCH_SIZE) {
			this.flush();
		}
	}

	/**
	 * Flush buffered invocations to the database.
	 */
	flush(): void {
		if (this.invocations.length === 0) return;

		const database = getDatabase();
		// Ensure tool_usage table exists
		database.exec(`
			CREATE TABLE IF NOT EXISTS tool_usage (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				tool_name TEXT NOT NULL,
				timestamp INTEGER NOT NULL,
				context_summary TEXT,
				success INTEGER DEFAULT 1
			);
			CREATE INDEX IF NOT EXISTS idx_tool_name ON tool_usage(tool_name);
			CREATE INDEX IF NOT EXISTS idx_tool_ts ON tool_usage(timestamp);
		`);

		const stmt = database.prepare(
			'INSERT INTO tool_usage (tool_name, timestamp, context_summary, success) VALUES (?, ?, ?, ?)'
		);
		const transaction = database.transaction((invocations: ToolInvocation[]) => {
			for (const inv of invocations) {
				stmt.run(inv.tool_name, inv.timestamp, inv.context_summary || null, inv.success ? 1 : 0);
			}
		});
		transaction(this.invocations);
		this.invocations = [];
	}

	/**
	 * Compute usage statistics. Call after 50+ invocations.
	 */
	computeStats(): ToolUsageStats {
		this.flush(); // Ensure everything is persisted

		const database = getDatabase();

		// Check if table exists
		const tableExists = database.prepare(
			"SELECT name FROM sqlite_master WHERE type='table' AND name='tool_usage'"
		).get();
		if (!tableExists) {
			return { totalInvocations: 0, topTools: [], neverUsed: [], timePatterns: {} };
		}

		const total = database.prepare('SELECT COUNT(*) FROM tool_usage').pluck().get() as number;

		// Top tools by frequency
		const topTools = database.prepare(`
			SELECT tool_name, COUNT(*) as count,
				ROUND(AVG(success) * 100) as success_rate
			FROM tool_usage
			GROUP BY tool_name
			ORDER BY count DESC
			LIMIT 20
		`).all() as Array<{ tool_name: string; count: number; success_rate: number }>;

		// Time-of-day patterns (hour buckets)
		const hourStats = database.prepare(`
			SELECT
				CAST((timestamp % 86400) / 3600 AS INTEGER) as hour,
				COUNT(*) as count
			FROM tool_usage
			GROUP BY hour
			ORDER BY hour
		`).all() as Array<{ hour: number; count: number }>;

		const timePatterns: Record<string, number> = {};
		for (const row of hourStats) {
			const label = `${String(row.hour).padStart(2, '0')}:00`;
			timePatterns[label] = row.count;
		}

		// Update preferences if we have enough data
		if (total >= 50) {
			const topToolNames = topTools.slice(0, 10).map(t => t.tool_name);
			setPreference('preferred_tools', JSON.stringify(topToolNames),
				Math.min(0.95, 0.5 + total * 0.005), total);
		}

		return {
			totalInvocations: total,
			topTools: topTools.map(t => ({
				name: t.tool_name,
				count: t.count,
				successRate: t.success_rate
			})),
			neverUsed: [], // Would need full tool list to compute
			timePatterns
		};
	}
}

// ── Types ──

export interface ToolUsageStats {
	totalInvocations: number;
	topTools: Array<{
		name: string;
		count: number;
		successRate: number;
	}>;
	neverUsed: string[];
	timePatterns: Record<string, number>;
}
