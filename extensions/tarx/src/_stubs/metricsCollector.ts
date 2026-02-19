/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX Metrics Collector
 *  - Aggregates weekly usage metrics from existing database tables
 *  - No new tracking — relies on messages, training_data, knowledge_embeddings, files, skills
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export interface WeeklyMetrics {
	messages_sent: number;
	sessions_active: number;
	tokens_used: number;
	thumbs_up: number;
	thumbs_down: number;
	knowledge_items: number;
	files_uploaded: number;
	skills_installed: number;
	top_skills: Array<{ name: string; uses: number }>;
	estimated_minutes_saved: number;
	period_start: number;
	period_end: number;
}

/**
 * Fetch weekly metrics via MCP tool.
 */
export async function getWeeklyMetrics(weekOffset: number = 0): Promise<WeeklyMetrics | null> {
	try {
		const ext = vscode.extensions.getExtension('tarx.tarx');
		if (ext?.isActive && ext.exports?.mcpCall) {
			const result = await ext.exports.mcpCall('tarx_weekly_report', { week_offset: weekOffset });
			return result as WeeklyMetrics;
		}
	} catch {
		// MCP not available
	}
	return null;
}

/**
 * Format a date range for display.
 */
export function formatWeekRange(start: number, end: number): string {
	const startDate = new Date(start);
	const endDate = new Date(end);
	const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
	return `${startDate.toLocaleDateString('en-US', options)} - ${endDate.toLocaleDateString('en-US', options)}, ${endDate.getFullYear()}`;
}
