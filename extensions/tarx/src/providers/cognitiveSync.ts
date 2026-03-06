/**
 * Cognitive Sync — pushes session data to the cognitive engine (port 11438)
 * on a 5-minute timer so cognitive state stays fresh.
 *
 * Reads sessions from memory.db via sqlite3 CLI (same pattern as
 * claudeSessionsProvider.ts) and POSTs new ones to the cognitive engine.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as http from 'http';
import { execSync } from 'child_process';
import { reportCognitiveSync } from '../services/telemetryReporter';

const COGNITIVE_URL = 'http://127.0.0.1:11438';
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const LAST_SYNC_KEY = 'tarx.cognitive.lastSync';
const DB_PATH = path.join(os.homedir(), 'Library', 'Application Support', 'tarx', 'memory.db');

let timer: ReturnType<typeof setInterval> | undefined;
let extensionContext: vscode.ExtensionContext | undefined;

function log(msg: string): void {
	console.log(`[TARX CognitiveSync] ${msg}`);
}

/**
 * POST a conversation to the cognitive engine.
 */
function postConversation(payload: {
	title: string;
	summary: string;
	key_decisions: string[];
	topics: string[];
	full_text: string;
	source: string;
	duration_seconds: number;
}): Promise<boolean> {
	return new Promise((resolve) => {
		const body = JSON.stringify(payload);
		const url = new URL('/v1/conversations', COGNITIVE_URL);

		const req = http.request(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(body)
			},
			timeout: 10000
		}, (res) => {
			res.resume(); // drain
			resolve(res.statusCode === 201);
		});

		req.on('error', () => resolve(false));
		req.on('timeout', () => { req.destroy(); resolve(false); });
		req.write(body);
		req.end();
	});
}

/**
 * Extract simple topics from session title + content.
 */
function extractTopics(title: string, content: string): string[] {
	const topics = new Set<string>();

	// Pull keywords from title
	const titleWords = (title || '').toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.split(/\s+/)
		.filter(w => w.length > 3);
	for (const w of titleWords.slice(0, 5)) {
		topics.add(w);
	}

	// Common topic patterns from content
	const patterns = [
		/(?:working on|building|implementing|fixing|debugging)\s+(\w+)/gi,
		/(?:refactor|migrate|deploy|test|review)\s+(\w+)/gi,
	];
	for (const pat of patterns) {
		let match;
		while ((match = pat.exec(content)) !== null) {
			topics.add(match[1].toLowerCase());
		}
	}

	return [...topics].slice(0, 10);
}

/**
 * Run a single sync cycle: find new sessions and POST them.
 */
async function syncOnce(): Promise<void> {
	if (!extensionContext) return;
	if (!fs.existsSync(DB_PATH)) {
		log('DB not found, skipping');
		return;
	}

	// Check cognitive engine health first
	const healthy = await new Promise<boolean>((resolve) => {
		const req = http.request(`${COGNITIVE_URL}/health`, { method: 'GET', timeout: 3000 }, (res) => {
			res.resume();
			resolve(res.statusCode === 200);
		});
		req.on('error', () => resolve(false));
		req.on('timeout', () => { req.destroy(); resolve(false); });
		req.end();
	});

	if (!healthy) {
		log('Cognitive engine offline, skipping');
		return;
	}

	const lastSync = extensionContext.globalState.get<number>(LAST_SYNC_KEY, 0);
	const nowSec = Math.floor(Date.now() / 1000);

	try {
		// Query sessions updated since last sync
		const query = `SELECT s.id, s.title, s.created_at, s.updated_at, s.message_count, s.model,
			(SELECT GROUP_CONCAT(m.content, ' ') FROM messages m WHERE m.session_id = s.id ORDER BY m.created_at LIMIT 10) as content
			FROM sessions s
			WHERE s.updated_at > ${lastSync} AND s.deleted_at IS NULL
			ORDER BY s.updated_at ASC
			LIMIT 20`;

		const result = execSync(`sqlite3 "${DB_PATH}" -json "${query}"`, {
			encoding: 'utf8',
			timeout: 10000
		}).trim();

		if (!result || result === '[]') {
			log('No new sessions');
			await extensionContext.globalState.update(LAST_SYNC_KEY, nowSec);
			return;
		}

		const sessions = JSON.parse(result) as Array<{
			id: string;
			title: string | null;
			created_at: number;
			updated_at: number;
			message_count: number;
			model: string | null;
			content: string | null;
		}>;

		let synced = 0;
		for (const session of sessions) {
			const content = session.content || '';
			const summary = content.slice(0, 500);
			const topics = extractTopics(session.title || '', content);
			const durationSec = session.updated_at - session.created_at;

			const ok = await postConversation({
				title: session.title || 'Untitled session',
				summary,
				key_decisions: [], // Could be extracted with NLP in future
				topics,
				full_text: content.slice(0, 5000), // Cap at 5k chars for embedding
				source: session.model?.includes('claude') ? 'claude.ai' : 'workbench',
				duration_seconds: Math.max(durationSec, 1)
			});

			if (ok) synced++;
		}

		await extensionContext.globalState.update(LAST_SYNC_KEY, nowSec);
		log(`Synced ${synced}/${sessions.length} sessions`);

		// Report cognitive state to telemetry after sync
		try {
			const cogRes = await new Promise<string | null>((resolve) => {
				const req = http.request(`${COGNITIVE_URL}/v1/cognitive/state`, { method: 'GET', timeout: 3000 }, (res) => {
					let body = '';
					res.on('data', (chunk: Buffer) => body += chunk);
					res.on('end', () => resolve(res.statusCode === 200 ? body : null));
				});
				req.on('error', () => resolve(null));
				req.on('timeout', () => { req.destroy(); resolve(null); });
				req.end();
			});
			if (cogRes) {
				const state = JSON.parse(cogRes) as {
					focus_depth?: number; decision_fatigue?: number;
					context_switch_rate?: number; session_count_today?: number;
					message_count_today?: number; recommended_style?: string;
				};
				reportCognitiveSync({
					focus_depth: state.focus_depth ?? 0,
					decision_fatigue: state.decision_fatigue ?? 0,
					context_switch_rate: state.context_switch_rate ?? 0,
					session_count: state.session_count_today ?? 0,
					message_count: state.message_count_today ?? 0,
					recommended_style: state.recommended_style ?? 'unknown',
				});
			}
		} catch {
			// telemetry is best-effort
		}
	} catch (err: any) {
		log(`Sync error: ${err.message}`);
	}
}

/**
 * Start the cognitive sync timer. Call from extension activate().
 */
export function startCognitiveSync(context: vscode.ExtensionContext): void {
	extensionContext = context;
	log('Starting (5min interval)');

	// Initial sync after 30s (let daemon start first)
	setTimeout(() => {
		syncOnce().catch(err => log(`Initial sync failed: ${err.message}`));
	}, 30000);

	timer = setInterval(() => {
		syncOnce().catch(err => log(`Sync failed: ${err.message}`));
	}, SYNC_INTERVAL_MS);
}

/**
 * Stop the cognitive sync timer. Call from extension deactivate().
 */
export function stopCognitiveSync(): void {
	if (timer) {
		clearInterval(timer);
		timer = undefined;
	}
	extensionContext = undefined;
	log('Stopped');
}
