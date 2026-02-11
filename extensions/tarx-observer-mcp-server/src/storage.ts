#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  TARX Observer — SQLite Persistence (observer.db)
 *  Stores interactions, preferences, domain knowledge, model gaps, training queue,
 *  growth metrics, and dynamic prompt fragments.
 *--------------------------------------------------------------------------------------------*/

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type {
	Interaction, InteractionInput, Preference, DomainTerm,
	ModelGap, TrainingEntry, TrainingRun, GrowthMetric,
	PromptFragment, ObserverStatus
} from './types.js';

// ── Paths ──

const DB_DIR = join(homedir(), 'Library/Application Support/tarx');
const DB_PATH = join(DB_DIR, 'observer.db');

// ── Singleton ──

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
	if (!db) {
		if (!existsSync(DB_DIR)) {
			mkdirSync(DB_DIR, { recursive: true });
		}
		db = new Database(DB_PATH);
		db.pragma('journal_mode = WAL');
		db.pragma('foreign_keys = ON');
		initializeSchema(db);
	}
	return db;
}

export function closeDatabase(): void {
	if (db) {
		db.close();
		db = null;
	}
}

// ── Schema ──

function initializeSchema(database: Database.Database): void {
	database.exec(`
		CREATE TABLE IF NOT EXISTS interactions (
			id TEXT PRIMARY KEY,
			session_id TEXT,
			user_message TEXT NOT NULL,
			assistant_message TEXT NOT NULL,
			user_tokens INTEGER DEFAULT 0,
			assistant_tokens INTEGER DEFAULT 0,
			response_time_ms INTEGER DEFAULT 0,
			created_at INTEGER DEFAULT (unixepoch()),
			was_edited INTEGER DEFAULT 0,
			was_copied INTEGER DEFAULT 0,
			was_ignored INTEGER DEFAULT 0,
			was_corrected INTEGER DEFAULT 0,
			correction_text TEXT,
			rating TEXT CHECK(rating IN ('thumbs_up','thumbs_down','none')) DEFAULT 'none',
			quality_score REAL DEFAULT 0.5,
			flagged_issues TEXT
		);

		CREATE INDEX IF NOT EXISTS idx_interactions_session ON interactions(session_id);
		CREATE INDEX IF NOT EXISTS idx_interactions_created ON interactions(created_at);
		CREATE INDEX IF NOT EXISTS idx_interactions_quality ON interactions(quality_score);

		CREATE TABLE IF NOT EXISTS preferences (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			confidence REAL DEFAULT 0.5,
			evidence_count INTEGER DEFAULT 0,
			last_updated INTEGER DEFAULT (unixepoch())
		);

		CREATE TABLE IF NOT EXISTS domain_knowledge (
			id TEXT PRIMARY KEY,
			term TEXT NOT NULL UNIQUE,
			definition TEXT,
			category TEXT,
			frequency INTEGER DEFAULT 1,
			confidence REAL DEFAULT 0.5,
			first_seen INTEGER DEFAULT (unixepoch()),
			last_seen INTEGER DEFAULT (unixepoch())
		);

		CREATE INDEX IF NOT EXISTS idx_domain_term ON domain_knowledge(term);
		CREATE INDEX IF NOT EXISTS idx_domain_category ON domain_knowledge(category);

		CREATE TABLE IF NOT EXISTS model_gaps (
			id TEXT PRIMARY KEY,
			pattern TEXT NOT NULL,
			wrong_response TEXT,
			correct_response TEXT,
			occurrence_count INTEGER DEFAULT 1,
			last_occurred INTEGER DEFAULT (unixepoch()),
			resolved INTEGER DEFAULT 0
		);

		CREATE INDEX IF NOT EXISTS idx_gaps_resolved ON model_gaps(resolved);

		CREATE TABLE IF NOT EXISTS training_queue (
			id TEXT PRIMARY KEY,
			instruction TEXT NOT NULL,
			response TEXT NOT NULL,
			system_context TEXT,
			source TEXT NOT NULL,
			quality_score REAL NOT NULL,
			tokens INTEGER,
			exported INTEGER DEFAULT 0,
			created_at INTEGER DEFAULT (unixepoch())
		);

		CREATE INDEX IF NOT EXISTS idx_training_exported ON training_queue(exported);
		CREATE INDEX IF NOT EXISTS idx_training_quality ON training_queue(quality_score);

		CREATE TABLE IF NOT EXISTS training_runs (
			id TEXT PRIMARY KEY,
			started_at INTEGER DEFAULT (unixepoch()),
			completed_at INTEGER,
			examples_count INTEGER DEFAULT 0,
			method TEXT DEFAULT 'lora',
			status TEXT DEFAULT 'pending',
			mesh_peers_used INTEGER DEFAULT 0,
			adapter_path TEXT,
			metrics TEXT
		);

		CREATE TABLE IF NOT EXISTS growth_metrics (
			id TEXT PRIMARY KEY,
			metric TEXT NOT NULL,
			value REAL NOT NULL,
			period TEXT NOT NULL,
			details TEXT,
			created_at INTEGER DEFAULT (unixepoch())
		);

		CREATE INDEX IF NOT EXISTS idx_growth_metric ON growth_metrics(metric);
		CREATE INDEX IF NOT EXISTS idx_growth_period ON growth_metrics(period);

		CREATE TABLE IF NOT EXISTS prompt_fragments (
			id TEXT PRIMARY KEY,
			category TEXT NOT NULL,
			content TEXT NOT NULL,
			priority INTEGER DEFAULT 50,
			active INTEGER DEFAULT 1,
			last_updated INTEGER DEFAULT (unixepoch())
		);

		CREATE INDEX IF NOT EXISTS idx_prompt_category ON prompt_fragments(category);
		CREATE INDEX IF NOT EXISTS idx_prompt_active ON prompt_fragments(active);

		CREATE TABLE IF NOT EXISTS meta (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);
	`);
}

// ── Interaction CRUD ──

export function recordInteraction(input: InteractionInput): Interaction {
	const database = getDatabase();
	const id = randomUUID();
	const now = Math.floor(Date.now() / 1000);
	const userTokens = estimateTokens(input.user_message);
	const assistantTokens = estimateTokens(input.assistant_message);

	database.prepare(`
		INSERT INTO interactions (id, session_id, user_message, assistant_message,
			user_tokens, assistant_tokens, response_time_ms, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`).run(id, input.session_id || null, input.user_message, input.assistant_message,
		userTokens, assistantTokens, input.response_time_ms || 0, now);

	return database.prepare('SELECT * FROM interactions WHERE id = ?').get(id) as Interaction;
}

export function updateInteractionSignals(id: string, signals: Partial<Pick<Interaction,
	'was_edited' | 'was_copied' | 'was_ignored' | 'was_corrected' | 'correction_text' | 'rating' | 'quality_score' | 'flagged_issues'
>>): void {
	const database = getDatabase();
	const sets: string[] = [];
	const values: unknown[] = [];

	for (const [key, val] of Object.entries(signals)) {
		if (val !== undefined) {
			sets.push(`${key} = ?`);
			values.push(val);
		}
	}
	if (sets.length === 0) return;
	values.push(id);
	database.prepare(`UPDATE interactions SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function getRecentInteractions(limit: number = 100): Interaction[] {
	const database = getDatabase();
	return database.prepare(
		'SELECT * FROM interactions ORDER BY created_at DESC LIMIT ?'
	).all(limit) as Interaction[];
}

export function getInteractionCount(): number {
	const database = getDatabase();
	return database.prepare('SELECT COUNT(*) FROM interactions').pluck().get() as number;
}

export function getLastInteraction(): Interaction | null {
	const database = getDatabase();
	return (database.prepare(
		'SELECT * FROM interactions ORDER BY created_at DESC LIMIT 1'
	).get() || null) as Interaction | null;
}

// ── Preference CRUD ──

export function setPreference(key: string, value: string, confidence: number, evidenceCount: number): void {
	const database = getDatabase();
	const now = Math.floor(Date.now() / 1000);
	database.prepare(`
		INSERT INTO preferences (key, value, confidence, evidence_count, last_updated)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(key) DO UPDATE SET
			value = excluded.value,
			confidence = excluded.confidence,
			evidence_count = excluded.evidence_count,
			last_updated = excluded.last_updated
	`).run(key, value, confidence, evidenceCount, now);
}

export function getPreference(key: string): Preference | null {
	const database = getDatabase();
	return (database.prepare('SELECT * FROM preferences WHERE key = ?').get(key) || null) as Preference | null;
}

export function getAllPreferences(): Preference[] {
	const database = getDatabase();
	return database.prepare('SELECT * FROM preferences ORDER BY confidence DESC').all() as Preference[];
}

export function deletePreference(key: string): boolean {
	const database = getDatabase();
	const result = database.prepare('DELETE FROM preferences WHERE key = ?').run(key);
	return result.changes > 0;
}

// ── Domain Knowledge CRUD ──

export function upsertDomainTerm(term: string, definition?: string, category?: string): DomainTerm {
	const database = getDatabase();
	const now = Math.floor(Date.now() / 1000);
	const existing = database.prepare('SELECT * FROM domain_knowledge WHERE term = ?').get(term) as DomainTerm | undefined;

	if (existing) {
		database.prepare(`
			UPDATE domain_knowledge SET
				frequency = frequency + 1,
				last_seen = ?,
				definition = COALESCE(?, definition),
				category = COALESCE(?, category)
			WHERE term = ?
		`).run(now, definition || null, category || null, term);
		return database.prepare('SELECT * FROM domain_knowledge WHERE term = ?').get(term) as DomainTerm;
	}

	const id = randomUUID();
	database.prepare(`
		INSERT INTO domain_knowledge (id, term, definition, category, frequency, confidence, first_seen, last_seen)
		VALUES (?, ?, ?, ?, 1, 0.5, ?, ?)
	`).run(id, term, definition || null, category || null, now, now);
	return database.prepare('SELECT * FROM domain_knowledge WHERE id = ?').get(id) as DomainTerm;
}

export function getDomainTerms(limit: number = 50): DomainTerm[] {
	const database = getDatabase();
	return database.prepare(
		'SELECT * FROM domain_knowledge ORDER BY frequency DESC, last_seen DESC LIMIT ?'
	).all(limit) as DomainTerm[];
}

export function getDomainTermCount(): number {
	const database = getDatabase();
	return database.prepare('SELECT COUNT(*) FROM domain_knowledge').pluck().get() as number;
}

// ── Model Gaps CRUD ──

export function recordGap(pattern: string, wrongResponse: string, correctResponse: string): ModelGap {
	const database = getDatabase();
	const now = Math.floor(Date.now() / 1000);

	// Check for existing similar gap
	const existing = database.prepare(
		'SELECT * FROM model_gaps WHERE pattern = ? AND resolved = 0'
	).get(pattern) as ModelGap | undefined;

	if (existing) {
		database.prepare(`
			UPDATE model_gaps SET
				occurrence_count = occurrence_count + 1,
				last_occurred = ?,
				correct_response = ?
			WHERE id = ?
		`).run(now, correctResponse, existing.id);
		return database.prepare('SELECT * FROM model_gaps WHERE id = ?').get(existing.id) as ModelGap;
	}

	const id = randomUUID();
	database.prepare(`
		INSERT INTO model_gaps (id, pattern, wrong_response, correct_response, occurrence_count, last_occurred)
		VALUES (?, ?, ?, ?, 1, ?)
	`).run(id, pattern, wrongResponse, correctResponse, now);
	return database.prepare('SELECT * FROM model_gaps WHERE id = ?').get(id) as ModelGap;
}

export function getUnresolvedGaps(): ModelGap[] {
	const database = getDatabase();
	return database.prepare(
		'SELECT * FROM model_gaps WHERE resolved = 0 ORDER BY occurrence_count DESC'
	).all() as ModelGap[];
}

export function getGapCount(): number {
	const database = getDatabase();
	return database.prepare('SELECT COUNT(*) FROM model_gaps WHERE resolved = 0').pluck().get() as number;
}

export function resolveGap(id: string): boolean {
	const database = getDatabase();
	const result = database.prepare('UPDATE model_gaps SET resolved = 1 WHERE id = ?').run(id);
	return result.changes > 0;
}

// ── Training Queue CRUD ──

export function addTrainingEntry(entry: {
	instruction: string;
	response: string;
	system_context?: string;
	source: 'interaction' | 'correction' | 'synthetic' | 'manual';
	quality_score: number;
}): TrainingEntry {
	const database = getDatabase();
	const id = randomUUID();
	const tokens = estimateTokens(entry.instruction) + estimateTokens(entry.response);
	const now = Math.floor(Date.now() / 1000);

	database.prepare(`
		INSERT INTO training_queue (id, instruction, response, system_context, source, quality_score, tokens, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`).run(id, entry.instruction, entry.response, entry.system_context || null,
		entry.source, entry.quality_score, tokens, now);
	return database.prepare('SELECT * FROM training_queue WHERE id = ?').get(id) as TrainingEntry;
}

export function getTrainingQueue(minQuality: number = 0.6, unexportedOnly: boolean = true): TrainingEntry[] {
	const database = getDatabase();
	const sql = unexportedOnly
		? 'SELECT * FROM training_queue WHERE quality_score >= ? AND exported = 0 ORDER BY quality_score DESC'
		: 'SELECT * FROM training_queue WHERE quality_score >= ? ORDER BY quality_score DESC';
	return database.prepare(sql).all(minQuality) as TrainingEntry[];
}

export function getTrainingQueueSize(): number {
	const database = getDatabase();
	return database.prepare('SELECT COUNT(*) FROM training_queue WHERE exported = 0').pluck().get() as number;
}

export function markTrainingExported(ids: string[]): void {
	const database = getDatabase();
	const stmt = database.prepare('UPDATE training_queue SET exported = 1 WHERE id = ?');
	const transaction = database.transaction((idList: string[]) => {
		for (const id of idList) stmt.run(id);
	});
	transaction(ids);
}

// ── Training Runs ──

export function createTrainingRun(method: 'lora' | 'full' | 'dpo', examplesCount: number): TrainingRun {
	const database = getDatabase();
	const id = randomUUID();
	database.prepare(`
		INSERT INTO training_runs (id, examples_count, method, status) VALUES (?, ?, ?, 'pending')
	`).run(id, examplesCount, method);
	return database.prepare('SELECT * FROM training_runs WHERE id = ?').get(id) as TrainingRun;
}

export function updateTrainingRun(id: string, updates: Partial<TrainingRun>): void {
	const database = getDatabase();
	const sets: string[] = [];
	const values: unknown[] = [];
	for (const [key, val] of Object.entries(updates)) {
		if (val !== undefined) {
			sets.push(`${key} = ?`);
			values.push(val);
		}
	}
	if (sets.length === 0) return;
	values.push(id);
	database.prepare(`UPDATE training_runs SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

// ── Growth Metrics ──

export function recordGrowthMetric(metric: string, value: number, period: string, details?: Record<string, unknown>): GrowthMetric {
	const database = getDatabase();
	const id = randomUUID();
	database.prepare(`
		INSERT INTO growth_metrics (id, metric, value, period, details)
		VALUES (?, ?, ?, ?, ?)
	`).run(id, metric, value, period, details ? JSON.stringify(details) : null);
	return database.prepare('SELECT * FROM growth_metrics WHERE id = ?').get(id) as GrowthMetric;
}

export function getGrowthMetrics(metric?: string, period?: string): GrowthMetric[] {
	const database = getDatabase();
	if (metric && period) {
		return database.prepare(
			'SELECT * FROM growth_metrics WHERE metric = ? AND period = ? ORDER BY created_at DESC'
		).all(metric, period) as GrowthMetric[];
	}
	if (metric) {
		return database.prepare(
			'SELECT * FROM growth_metrics WHERE metric = ? ORDER BY created_at DESC LIMIT 20'
		).all(metric) as GrowthMetric[];
	}
	return database.prepare(
		'SELECT * FROM growth_metrics ORDER BY created_at DESC LIMIT 50'
	).all() as GrowthMetric[];
}

// ── Prompt Fragments ──

export function setPromptFragment(category: string, content: string, priority: number = 50): PromptFragment {
	const database = getDatabase();
	const now = Math.floor(Date.now() / 1000);

	// Upsert by category (one active fragment per category)
	const existing = database.prepare(
		'SELECT * FROM prompt_fragments WHERE category = ? AND active = 1'
	).get(category) as PromptFragment | undefined;

	if (existing) {
		database.prepare(`
			UPDATE prompt_fragments SET content = ?, priority = ?, last_updated = ? WHERE id = ?
		`).run(content, priority, now, existing.id);
		return database.prepare('SELECT * FROM prompt_fragments WHERE id = ?').get(existing.id) as PromptFragment;
	}

	const id = randomUUID();
	database.prepare(`
		INSERT INTO prompt_fragments (id, category, content, priority, active, last_updated)
		VALUES (?, ?, ?, ?, 1, ?)
	`).run(id, category, content, priority, now);
	return database.prepare('SELECT * FROM prompt_fragments WHERE id = ?').get(id) as PromptFragment;
}

export function getActivePromptFragments(): PromptFragment[] {
	const database = getDatabase();
	return database.prepare(
		'SELECT * FROM prompt_fragments WHERE active = 1 ORDER BY priority DESC'
	).all() as PromptFragment[];
}

// ── Meta ──

export function setMeta(key: string, value: string): void {
	const database = getDatabase();
	database.prepare(`
		INSERT INTO meta (key, value) VALUES (?, ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value
	`).run(key, value);
}

export function getMeta(key: string): string | null {
	const database = getDatabase();
	const row = database.prepare('SELECT value FROM meta WHERE key = ?').pluck().get(key) as string | undefined;
	return row ?? null;
}

// ── Status ──

export function getObserverStatus(): ObserverStatus {
	const database = getDatabase();
	const interactions = database.prepare('SELECT COUNT(*) FROM interactions').pluck().get() as number;
	const preferences = database.prepare('SELECT COUNT(*) FROM preferences').pluck().get() as number;
	const terms = database.prepare('SELECT COUNT(*) FROM domain_knowledge').pluck().get() as number;
	const gaps = database.prepare('SELECT COUNT(*) FROM model_gaps WHERE resolved = 0').pluck().get() as number;
	const queue = database.prepare('SELECT COUNT(*) FROM training_queue WHERE exported = 0').pluck().get() as number;
	const avgQ = (database.prepare('SELECT AVG(quality_score) FROM interactions').pluck().get() as number | null) || 0.5;
	const lastRun = getMeta('last_analysis_run');

	return {
		interactions_captured: interactions,
		preferences_learned: preferences,
		domain_terms: terms,
		model_gaps: gaps,
		training_queue_size: queue,
		last_analysis_run: lastRun,
		quality_score_avg: Math.round(avgQ * 100) / 100
	};
}

// ── Deletion helpers ──

export function deleteInteraction(id: string): boolean {
	const database = getDatabase();
	return database.prepare('DELETE FROM interactions WHERE id = ?').run(id).changes > 0;
}

export function deleteDomainTerm(term: string): boolean {
	const database = getDatabase();
	return database.prepare('DELETE FROM domain_knowledge WHERE term = ?').run(term).changes > 0;
}

export function deleteGap(id: string): boolean {
	const database = getDatabase();
	return database.prepare('DELETE FROM model_gaps WHERE id = ?').run(id).changes > 0;
}

export function deleteByPattern(table: string, column: string, pattern: string): number {
	const database = getDatabase();
	const allowedTables = ['interactions', 'domain_knowledge', 'model_gaps', 'training_queue'];
	if (!allowedTables.includes(table)) return 0;
	const result = database.prepare(
		`DELETE FROM ${table} WHERE ${column} LIKE ?`
	).run(`%${pattern}%`);
	return result.changes;
}

// ── Utility ──

export function estimateTokens(text: string): number {
	if (!text) return 0;
	return Math.ceil(text.split(/\s+/).length * 1.3);
}
