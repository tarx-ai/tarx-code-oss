#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  TARX Observer MCP Server — Entry Point
 *  Passive intelligence layer: learns user preferences, curates training data,
 *  tracks cognitive growth. 4th MCP server alongside tarx-core, tarx-ops, tarx-ui.
 *
 *  Transport: stdio (same pattern as tarx-core)
 *  Database: ~/Library/Application Support/tarx/observer.db
 *  Tools: 8 (observer_status, observer_insights, observer_export, observer_correct,
 *          observer_forget, observer_train, observer_preferences, observer_growth)
 *--------------------------------------------------------------------------------------------*/

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
	server,
	qualityCollector, correctionCollector, styleCollector, toolUseCollector,
	preferenceAnalyzer, domainAnalyzer, gapAnalyzer, growthAnalyzer,
	systemPromptProducer
} from './server.js';

import {
	getDatabase, getInteractionCount, getMeta, setMeta,
	setPreference, upsertDomainTerm, setPromptFragment, addTrainingEntry
} from './storage.js';

// ── Seed data ──

function seedInitialData(): void {
	const seeded = getMeta('initial_seed_done');
	if (seeded === 'true') return;

	console.error('[Observer] Seeding initial data...');

	// ── Preferences (from known user profile) ──
	setPreference('response_length', 'short', 0.9, 50);
	setPreference('tone', 'direct', 0.9, 50);
	setPreference('format', 'prose', 0.7, 30);
	setPreference('hedging', 'never', 0.8, 40);
	setPreference('verbosity', 'minimal', 0.8, 40);

	// ── Domain knowledge (core terms) ──
	upsertDomainTerm('TARX', 'Local-first AI platform, VS Code fork, standalone desktop app', 'project');
	upsertDomainTerm('llama-server', 'Local inference engine on port 11435, NOT Ollama', 'tool');
	upsertDomainTerm('MCP', 'Model Context Protocol — 4 servers, 100+ tools', 'concept');
	upsertDomainTerm('mesh', 'P2P network via libp2p for distributed compute', 'concept');
	upsertDomainTerm('Observer', 'Passive training data collector and model personalization system', 'tool');
	upsertDomainTerm('tarx-core', 'Primary MCP server — 46 tools for memory, files, spaces, sessions', 'tool');
	upsertDomainTerm('tarx-ops', 'Operations MCP server — 47 tools, creator-only, audit log', 'tool');
	upsertDomainTerm('tarx-ui', 'UI testing MCP server — 177 tools for VS Code UI control', 'tool');
	upsertDomainTerm('LoRA', 'Low-Rank Adaptation — efficient fine-tuning method', 'concept');
	upsertDomainTerm('RAG', 'Retrieval-Augmented Generation — knowledge file embeddings', 'concept');
	upsertDomainTerm('nomic-embed-text', 'Embedding model on port 11437 — 768-dim, 512-char chunks', 'tool');
	upsertDomainTerm('Grey', 'Team member', 'person');
	upsertDomainTerm('Duke', 'Team member', 'person');
	upsertDomainTerm('Joe', 'Team member', 'person');
	upsertDomainTerm('Avery', 'Team member — flagged cognitive performance tracking', 'person');
	upsertDomainTerm('Brandy', 'Team member', 'person');
	upsertDomainTerm('Natalie', 'Team member', 'person');

	// ── Prompt fragments ──
	setPromptFragment('identity',
		'You are TARX. You run locally on the user\'s machine. You are not a cloud service. You are not ChatGPT, Claude, or any other cloud AI.',
		100
	);
	setPromptFragment('preferences',
		'This user prefers short, direct answers. No hedging. No apologies. No "I\'d be happy to help." Just answer.',
		70
	);
	setPromptFragment('boundaries',
		'When unsure, say so plainly. Don\'t hallucinate. Push back on vague input. If a question is unclear, ask for specifics.',
		90
	);
	setPromptFragment('domain',
		'User\'s domain: TARX platform (VS Code fork, local AI, mesh networking). Key tools: llama-server, MCP, RAG. Key people: Grey, Duke, Joe, Avery, Brandy, Natalie.',
		50
	);
	setPromptFragment('corrections',
		'Common corrections: Don\'t say "Ollama" (it\'s llama-server). Don\'t say "TARX Code" (it\'s "TARX" or "TARX Workbench"). Don\'t say "Supabase" (it\'s SQLite).',
		90
	);

	setMeta('initial_seed_done', 'true');
	console.error('[Observer] Seed complete: 5 preferences, 16 domain terms, 5 prompt fragments');
}

// ── Background scheduler ──

let schedulerTimers: ReturnType<typeof setInterval>[] = [];

function startScheduler(): void {
	const interactionCount = getInteractionCount();
	if (interactionCount < 10) {
		console.error(`[Observer] Scheduler deferred — need 10+ interactions (currently ${interactionCount})`);
		// Check again in 5 minutes
		const checkTimer = setInterval(() => {
			if (getInteractionCount() >= 10) {
				clearInterval(checkTimer);
				activateScheduler();
			}
		}, 5 * 60 * 1000);
		schedulerTimers.push(checkTimer);
		return;
	}
	activateScheduler();
}

function activateScheduler(): void {
	setMeta('scheduler_active', 'true');
	console.error('[Observer] Scheduler activated');

	// Run preference + domain analyzers every 30 minutes
	schedulerTimers.push(setInterval(() => {
		try {
			const prefResult = preferenceAnalyzer.run();
			const domainResult = domainAnalyzer.run();
			setMeta('last_analysis_run', new Date().toISOString());
			console.error(`[Observer] Analysis run: ${prefResult.updated} prefs updated, ${domainResult.updated} terms updated`);
		} catch (err) {
			console.error('[Observer] Analysis error:', err);
		}
	}, 30 * 60 * 1000));

	// Run gap analyzer hourly
	schedulerTimers.push(setInterval(() => {
		try {
			const result = gapAnalyzer.run();
			console.error(`[Observer] Gap analysis: ${result.updated} training pairs generated`);
		} catch (err) {
			console.error('[Observer] Gap analysis error:', err);
		}
	}, 60 * 60 * 1000));

	// Run growth analyzer daily (24h)
	schedulerTimers.push(setInterval(() => {
		try {
			const result = growthAnalyzer.run();
			console.error(`[Observer] Growth analysis: ${result.updated} metrics recorded`);
		} catch (err) {
			console.error('[Observer] Growth analysis error:', err);
		}
	}, 24 * 60 * 60 * 1000));

	// Regenerate system prompt hourly
	schedulerTimers.push(setInterval(() => {
		try {
			systemPromptProducer.regenerate();
			console.error('[Observer] System prompt regenerated');
		} catch (err) {
			console.error('[Observer] Prompt regen error:', err);
		}
	}, 60 * 60 * 1000));
}

// ── Main ──

async function main(): Promise<void> {
	// Initialize database (creates tables if needed)
	getDatabase();

	// Seed initial data on first run
	seedInitialData();

	// Start scheduler
	startScheduler();

	// Connect MCP transport
	const transport = new StdioServerTransport();
	await server.connect(transport);

	console.error('TARX Observer MCP Server v1.0.0 started');
	console.error('  Tools: 8 (observer_status, observer_insights, observer_export, observer_correct, observer_forget, observer_train, observer_preferences, observer_growth)');
	console.error('  Database: ~/Library/Application Support/tarx/observer.db');
	console.error('  Scheduler: preference+domain (30m), gaps (1h), growth (24h), prompt (1h)');
}

main().catch(console.error);
