/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPES
// ============================================================================

export interface AgentStep {
	tool: string;
	label: string;
	params?: Record<string, unknown>;
}

export interface AgentTrigger {
	type: 'manual' | 'schedule' | 'event' | 'watch';
	cron?: string;
	event?: string;
	pattern?: string;
}

export interface AgentRun {
	timestamp: string;
	duration: number;
	success: boolean;
	error?: string;
}

export interface AgentDefinition {
	id: string;
	name: string;
	description: string;
	creator: string;
	version: string;
	trigger: AgentTrigger;
	steps: AgentStep[];
	requires: string[];
	status: 'active' | 'disabled';
	lastRun: string | null;
	runs: AgentRun[];
}

// ============================================================================
// INTENT DETECTION
// ============================================================================

export type AgentIntent =
	| { type: 'list' }
	| { type: 'run'; name: string }
	| { type: 'create' }
	| { type: 'status'; name: string }
	| { type: 'disable'; name: string }
	| { type: 'enable'; name: string }
	| null;

const INTENT_PATTERNS: Array<{ pattern: RegExp; extract: (m: RegExpMatchArray) => AgentIntent }> = [
	{ pattern: /^(?:show|list|my)\s+agents?$/i, extract: () => ({ type: 'list' }) },
	{ pattern: /^agents?$/i, extract: () => ({ type: 'list' }) },
	{ pattern: /^(?:run|execute|start)\s+(?:agent\s+)?(.+)$/i, extract: m => ({ type: 'run', name: m[1].trim() }) },
	{ pattern: /^create\s+(?:an?\s+)?agent$/i, extract: () => ({ type: 'create' }) },
	{ pattern: /^(?:new|make)\s+agent$/i, extract: () => ({ type: 'create' }) },
	{ pattern: /^agent\s+(.+?)\s+status$/i, extract: m => ({ type: 'status', name: m[1].trim() }) },
	{ pattern: /^(.+?)\s+(?:agent\s+)?status$/i, extract: m => ({ type: 'status', name: m[1].trim() }) },
	{ pattern: /^disable\s+(?:agent\s+)?(.+)$/i, extract: m => ({ type: 'disable', name: m[1].trim() }) },
	{ pattern: /^enable\s+(?:agent\s+)?(.+)$/i, extract: m => ({ type: 'enable', name: m[1].trim() }) },
];

export function detectAgentIntent(prompt: string): AgentIntent {
	const trimmed = prompt.trim();
	for (const { pattern, extract } of INTENT_PATTERNS) {
		const match = trimmed.match(pattern);
		if (match) {
			return extract(match);
		}
	}
	return null;
}

// ============================================================================
// AGENT FILE I/O
// ============================================================================

function getAgentsDir(): string {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (workspaceFolder) {
		return path.join(workspaceFolder, '.tarx', 'agents');
	}
	// Fallback to home directory
	const home = process.env.HOME || process.env.USERPROFILE || '';
	return path.join(home, '.tarx', 'agents');
}

export function loadAgents(): AgentDefinition[] {
	const dir = getAgentsDir();
	if (!fs.existsSync(dir)) {
		return [];
	}

	const agents: AgentDefinition[] = [];
	for (const file of fs.readdirSync(dir)) {
		if (!file.endsWith('.json')) { continue; }
		try {
			const content = fs.readFileSync(path.join(dir, file), 'utf-8');
			agents.push(JSON.parse(content));
		} catch (e) {
			console.warn(`[TARX Agent] Failed to load ${file}:`, e);
		}
	}
	return agents;
}

function findAgent(name: string): AgentDefinition | null {
	const agents = loadAgents();
	const lower = name.toLowerCase();
	return agents.find(a =>
		a.id.toLowerCase() === lower ||
		a.name.toLowerCase() === lower ||
		a.name.toLowerCase().includes(lower)
	) || null;
}

function saveAgent(agent: AgentDefinition): void {
	const dir = getAgentsDir();
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	const filePath = path.join(dir, `${agent.id}.json`);
	fs.writeFileSync(filePath, JSON.stringify(agent, null, 2), 'utf-8');
}

// ============================================================================
// HANDLERS
// ============================================================================

export function handleListAgents(): string {
	const agents = loadAgents();
	if (agents.length === 0) {
		return '**No agents installed.**\n\nSay "create agent" to build one, or check `.tarx/agents/` for definitions.';
	}

	const active = agents.filter(a => a.status === 'active');
	const disabled = agents.filter(a => a.status === 'disabled');

	let md = `**${agents.length} agent${agents.length === 1 ? '' : 's'} installed**\n\n`;

	if (active.length > 0) {
		md += '### Active\n\n';
		for (const a of active) {
			const lastRun = a.lastRun ? `Last run: ${a.lastRun}` : 'Never run';
			const trigger = a.trigger.type === 'schedule' && a.trigger.cron
				? `Schedule: \`${a.trigger.cron}\``
				: `Trigger: ${a.trigger.type}`;
			md += `**${a.name}** -${a.description}\n`;
			md += `${trigger} | ${lastRun} | by ${a.creator}\n`;
			md += `Steps: ${a.steps.map(s => s.label).join(' → ')}\n\n`;
		}
	}

	if (disabled.length > 0) {
		md += '### Disabled\n\n';
		for (const a of disabled) {
			md += `~~${a.name}~~ -${a.description}\n`;
			md += `Say "enable ${a.id}" to activate.\n\n`;
		}
	}

	md += '---\n';
	md += 'Say "run [name]" to execute, "create agent" to build one, or "[name] status" for details.';

	return md;
}

export async function handleRunAgent(
	name: string,
	response: vscode.ChatResponseStream
): Promise<string> {
	const agent = findAgent(name);
	if (!agent) {
		return `Agent "${name}" not found. Say "show agents" to see installed agents.`;
	}

	if (agent.status === 'disabled') {
		return `Agent "${agent.name}" is disabled. Say "enable ${agent.id}" to activate it.`;
	}

	response.markdown(`**Running ${agent.name}...**\n\n`);

	const startTime = Date.now();
	const results: string[] = [];

	for (let i = 0; i < agent.steps.length; i++) {
		const step = agent.steps[i];
		response.markdown(`**Step ${i + 1}/${agent.steps.length}:** ${step.label}\n`);

		try {
			// Execute MCP tool via VS Code command
			const result = await vscode.commands.executeCommand(
				'tarx.mcp.callTool',
				step.tool,
				step.params || {}
			);
			const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
			results.push(`${step.label}: OK`);
			response.markdown(`Done.\n\n`);
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error);
			results.push(`${step.label}: FAILED -${errMsg}`);
			response.markdown(`**Failed:** ${errMsg}\n\n`);

			// Record failed run
			const duration = Date.now() - startTime;
			agent.lastRun = new Date().toISOString();
			agent.runs.push({ timestamp: agent.lastRun, duration, success: false, error: errMsg });
			if (agent.runs.length > 20) { agent.runs = agent.runs.slice(-20); }
			saveAgent(agent);

			return `**${agent.name} failed** at step ${i + 1}: ${step.label}\n\n${errMsg}`;
		}
	}

	// Record successful run
	const duration = Date.now() - startTime;
	agent.lastRun = new Date().toISOString();
	agent.runs.push({ timestamp: agent.lastRun, duration, success: true });
	if (agent.runs.length > 20) { agent.runs = agent.runs.slice(-20); }
	saveAgent(agent);

	return `**${agent.name} completed** in ${(duration / 1000).toFixed(1)}s\n\n${results.map(r => `- ${r}`).join('\n')}`;
}

export function handleAgentStatus(name: string): string {
	const agent = findAgent(name);
	if (!agent) {
		return `Agent "${name}" not found. Say "show agents" to see installed agents.`;
	}

	let md = `### ${agent.name}\n\n`;
	md += `**Status:** ${agent.status}\n`;
	md += `**Version:** ${agent.version} by ${agent.creator}\n`;
	md += `**Trigger:** ${agent.trigger.type}`;
	if (agent.trigger.cron) { md += ` (\`${agent.trigger.cron}\`)`; }
	md += '\n';
	md += `**Steps:** ${agent.steps.length}\n\n`;

	// Steps detail
	md += '| # | Tool | Label |\n|---|------|-------|\n';
	agent.steps.forEach((s, i) => {
		md += `| ${i + 1} | \`${s.tool}\` | ${s.label} |\n`;
	});
	md += '\n';

	// Requirements
	if (agent.requires.length > 0) {
		md += `**Requires:** ${agent.requires.join(', ')}\n\n`;
	}

	// Run history
	if (agent.runs.length > 0) {
		const recent = agent.runs.slice(-5).reverse();
		md += '**Recent runs:**\n';
		for (const run of recent) {
			const status = run.success ? 'OK' : `FAILED: ${run.error}`;
			md += `- ${run.timestamp} -${(run.duration / 1000).toFixed(1)}s -${status}\n`;
		}
	} else {
		md += '**No run history.**\n';
	}

	return md;
}

export function handleCreateAgent(): string {
	return `**Let's create an agent.**\n\nDescribe what you want this agent to do. For example:\n\n` +
		`- "Check all services every 30 minutes and alert on failures"\n` +
		`- "Watch for file changes and suggest fixes"\n` +
		`- "Compile a daily summary of my activity"\n\n` +
		`What should your agent do?`;
}

export function handleToggleAgent(name: string, enable: boolean): string {
	const agent = findAgent(name);
	if (!agent) {
		return `Agent "${name}" not found. Say "show agents" to see installed agents.`;
	}

	agent.status = enable ? 'active' : 'disabled';
	saveAgent(agent);

	return `**${agent.name}** is now **${agent.status}**.`;
}
