/*---------------------------------------------------------------------------------------------
 *  TARX Observer — Training Data Producer
 *  Exports curated JSONL training data from the training queue.
 *  Filters by quality score, attaches system context, marks as exported.
 *--------------------------------------------------------------------------------------------*/

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import {
	getTrainingQueue, markTrainingExported, getTrainingQueueSize, estimateTokens
} from '../storage.js';
import { SystemPromptProducer } from './system-prompt.js';
import type { ExportResult } from '../types.js';

const EXPORT_DIR = join(homedir(), 'Library/Application Support/tarx/training-data');

export class TrainingDataProducer {

	private systemPromptProducer: SystemPromptProducer;

	constructor(systemPromptProducer: SystemPromptProducer) {
		this.systemPromptProducer = systemPromptProducer;
	}

	/**
	 * Export curated training data to JSONL file.
	 */
	export(options: {
		minQuality?: number;
		format?: 'jsonl' | 'json';
		includeSystem?: boolean;
	} = {}): ExportResult {
		const minQuality = options.minQuality ?? 0.6;
		const format = options.format ?? 'jsonl';
		const includeSystem = options.includeSystem ?? true;

		// Get unexported entries above quality threshold
		const entries = getTrainingQueue(minQuality, true);

		if (entries.length === 0) {
			return { path: '', count: 0, total_tokens: 0 };
		}

		// Ensure export directory exists
		if (!existsSync(EXPORT_DIR)) {
			mkdirSync(EXPORT_DIR, { recursive: true });
		}

		// Generate system prompt context
		const systemContext = includeSystem ? this.systemPromptProducer.generate() : undefined;

		// Build export records
		const records = entries.map(entry => ({
			instruction: entry.instruction,
			response: entry.response,
			system_context: entry.system_context || systemContext || undefined,
			source: entry.source,
			quality_score: entry.quality_score,
			tokens: entry.tokens || estimateTokens(entry.instruction + entry.response)
		}));

		// Write file
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
		const ext = format === 'json' ? 'json' : 'jsonl';
		const filename = `export-${timestamp}.${ext}`;
		const filepath = join(EXPORT_DIR, filename);

		if (format === 'json') {
			writeFileSync(filepath, JSON.stringify(records, null, 2));
		} else {
			const lines = records.map(r => JSON.stringify(r));
			writeFileSync(filepath, lines.join('\n') + '\n');
		}

		// Mark as exported
		const ids = entries.map(e => e.id);
		markTrainingExported(ids);

		// Compute total tokens
		const totalTokens = records.reduce((sum, r) => sum + (r.tokens || 0), 0);

		return {
			path: filepath,
			count: records.length,
			total_tokens: totalTokens
		};
	}

	/**
	 * Get stats about pending training data without exporting.
	 */
	getStats(): {
		pending: number;
		bySource: Record<string, number>;
		avgQuality: number;
	} {
		const entries = getTrainingQueue(0.0, true);
		const bySource: Record<string, number> = {};
		let qualitySum = 0;

		for (const entry of entries) {
			bySource[entry.source] = (bySource[entry.source] || 0) + 1;
			qualitySum += entry.quality_score;
		}

		return {
			pending: entries.length,
			bySource,
			avgQuality: entries.length > 0 ? Math.round(qualitySum / entries.length * 100) / 100 : 0
		};
	}
}
