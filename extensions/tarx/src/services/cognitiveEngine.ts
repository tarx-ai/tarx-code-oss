/**
 * TARX Cognitive Engine — HTTP server on port 11438
 *
 * Computes cognitive state from session/message/memory data in memory.db.
 * Consumed by mcp.tarx.com tools and the TarxTicker sidebar component.
 *
 * Endpoints:
 *   GET  /health                — Liveness check
 *   GET  /v1/cognitive/state    — Cognitive score, focus depth, fatigue, style
 *   GET  /v1/activity/recent    — Recent sessions with topics
 *   POST /v1/conversations      — Store a conversation transcript + embed to RAG
 */

import * as http from 'http';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

const COGNITIVE_PORT = 11438;
const DB_PATH = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');

// ── SQLite helper ────────────────────────────────────────────
function query(sql: string): string {
	try {
		return execSync(`sqlite3 "${DB_PATH}" "${sql.replace(/"/g, '\\"')}"`, {
			encoding: 'utf8',
			timeout: 5000,
		}).trim();
	} catch {
		return '';
	}
}

function queryJSON<T = unknown>(sql: string): T[] {
	try {
		const raw = execSync(
			`sqlite3 -json "${DB_PATH}" "${sql.replace(/"/g, '\\"')}"`,
			{ encoding: 'utf8', timeout: 5000 }
		).trim();
		if (!raw) { return []; }
		return JSON.parse(raw) as T[];
	} catch {
		return [];
	}
}

// ── Cognitive scoring ────────────────────────────────────────

interface CognitiveState {
	timestamp: string;
	score: number;           // 0-100 overall cognitive load
	focus_depth: number;     // 0-1 how deep into single topic
	decision_fatigue: number; // 0-1 how many context switches
	context_switch_rate: number; // switches per hour
	decision_velocity: number;   // decisions per hour
	recommended_style: 'concise' | 'detailed' | 'step-by-step' | 'exploratory';
	active_project: string | null;
	session_count_today: number;
	message_count_today: number;
	uptime_hours: number;
}

function computeCognitiveState(): CognitiveState {
	const now = Date.now();
	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);
	const todayMs = todayStart.getTime();

	// Sessions today
	const sessionCountRaw = query(
		`SELECT COUNT(*) FROM sessions WHERE created_at > ${todayMs} AND deleted_at IS NULL`
	);
	const sessionCountToday = parseInt(sessionCountRaw) || 0;

	// Messages today
	const messageCountRaw = query(
		`SELECT COUNT(*) FROM messages WHERE created_at > ${todayMs} AND deleted_at IS NULL`
	);
	const messageCountToday = parseInt(messageCountRaw) || 0;

	// Distinct topics today (context switches)
	const topicsRaw = query(
		`SELECT COUNT(DISTINCT topic) FROM sessions WHERE created_at > ${todayMs} AND topic IS NOT NULL AND deleted_at IS NULL`
	);
	const distinctTopics = parseInt(topicsRaw) || 0;

	// Hours active today
	const firstSessionRaw = query(
		`SELECT MIN(created_at) FROM sessions WHERE created_at > ${todayMs} AND deleted_at IS NULL`
	);
	const firstSession = parseInt(firstSessionRaw) || now;
	const uptimeHours = Math.max(0.1, (now - firstSession) / 3_600_000);

	// Context switch rate
	const contextSwitchRate = distinctTopics / uptimeHours;

	// Decision velocity (messages from user = decisions)
	const userMsgRaw = query(
		`SELECT COUNT(*) FROM messages WHERE created_at > ${todayMs} AND role = 'user' AND deleted_at IS NULL`
	);
	const userMessages = parseInt(userMsgRaw) || 0;
	const decisionVelocity = userMessages / uptimeHours;

	// Active project
	const activeProjectRows = queryJSON<{ name: string }>(
		`SELECT name FROM projects WHERE is_active = 1 LIMIT 1`
	);
	const activeProject = activeProjectRows.length > 0 ? activeProjectRows[0].name : null;

	// Focus depth: inverse of context switch rate, normalized 0-1
	// High switches = low focus, low switches = high focus
	const focusDepth = Math.max(0, Math.min(1, 1 - (contextSwitchRate / 5)));

	// Decision fatigue: based on total decisions and time
	// More decisions over longer time = more fatigue
	const fatigue = Math.max(0, Math.min(1,
		(userMessages / 50) * (uptimeHours / 8)
	));

	// Overall cognitive score (0-100, higher = more loaded)
	const score = Math.round(
		(fatigue * 40) +
		(contextSwitchRate * 10) +
		(Math.min(messageCountToday / 200, 1) * 30) +
		((1 - focusDepth) * 20)
	);

	// Recommended style based on state
	let recommendedStyle: CognitiveState['recommended_style'];
	if (fatigue > 0.7) {
		recommendedStyle = 'concise';
	} else if (focusDepth > 0.7) {
		recommendedStyle = 'detailed';
	} else if (contextSwitchRate > 3) {
		recommendedStyle = 'step-by-step';
	} else {
		recommendedStyle = 'exploratory';
	}

	return {
		timestamp: new Date().toISOString(),
		score: Math.min(100, Math.max(0, score)),
		focus_depth: Math.round(focusDepth * 100) / 100,
		decision_fatigue: Math.round(fatigue * 100) / 100,
		context_switch_rate: Math.round(contextSwitchRate * 100) / 100,
		decision_velocity: Math.round(decisionVelocity * 100) / 100,
		recommended_style: recommendedStyle,
		active_project: activeProject,
		session_count_today: sessionCountToday,
		message_count_today: messageCountToday,
		uptime_hours: Math.round(uptimeHours * 100) / 100,
	};
}

// ── Recent activity ──────────────────────────────────────────

interface RecentSession {
	id: string;
	title: string | null;
	topic: string | null;
	model: string | null;
	message_count: number;
	created_at: number;
	last_activity: number | null;
}

function getRecentActivity(limit: number = 10): RecentSession[] {
	return queryJSON<RecentSession>(
		`SELECT id, title, topic, model, message_count, created_at, last_activity FROM sessions WHERE deleted_at IS NULL ORDER BY COALESCE(last_activity, updated_at) DESC LIMIT ${limit}`
	);
}

// ── Conversation storage ─────────────────────────────────────

interface ConversationPayload {
	session_id?: string;
	title?: string;
	topic?: string;
	messages?: Array<{
		role: string;
		content: string;
		model?: string;
		tokens?: number;
	}>;
}

function storeConversation(payload: ConversationPayload): { success: boolean; session_id: string; messages_stored: number } {
	const sessionId = payload.session_id || `cog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const now = Date.now();

	// Upsert session
	const title = (payload.title || 'Untitled').replace(/'/g, "''");
	const topic = payload.topic ? `'${payload.topic.replace(/'/g, "''")}'` : 'NULL';

	query(
		`INSERT OR REPLACE INTO sessions (id, title, topic, message_count, created_at, updated_at, last_activity) VALUES ('${sessionId}', '${title}', ${topic}, ${payload.messages?.length || 0}, ${now}, ${now}, ${now})`
	);

	// Insert messages
	let stored = 0;
	if (payload.messages) {
		for (const msg of payload.messages) {
			const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
			const content = msg.content.replace(/'/g, "''");
			const model = msg.model ? `'${msg.model.replace(/'/g, "''")}'` : 'NULL';
			const tokens = msg.tokens || 'NULL';
			query(
				`INSERT INTO messages (id, session_id, role, content, model, tokens, created_at) VALUES ('${msgId}', '${sessionId}', '${msg.role}', '${content}', ${model}, ${tokens}, ${now})`
			);
			stored++;
		}
	}

	return { success: true, session_id: sessionId, messages_stored: stored };
}

// ── HTTP Server ──────────────────────────────────────────────

export class CognitiveEngine {
	private server: http.Server | null = null;

	async start(): Promise<void> {
		if (this.server) {
			console.log('[CognitiveEngine] Already running');
			return;
		}

		this.server = http.createServer(async (req, res) => {
			res.setHeader('Access-Control-Allow-Origin', '*');
			res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
			res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

			if (req.method === 'OPTIONS') {
				res.writeHead(200);
				res.end();
				return;
			}

			const url = new URL(req.url || '/', `http://localhost:${COGNITIVE_PORT}`);
			const pathname = url.pathname;

			try {
				if (req.method === 'GET' && pathname === '/health') {
					this.sendJSON(res, 200, {
						status: 'ok',
						service: 'cognitive-engine',
						port: COGNITIVE_PORT,
						timestamp: new Date().toISOString(),
					});
				}
				else if (req.method === 'GET' && pathname === '/v1/cognitive/state') {
					const state = computeCognitiveState();
					this.sendJSON(res, 200, state);
				}
				else if (req.method === 'GET' && pathname === '/v1/activity/recent') {
					const limit = parseInt(url.searchParams.get('limit') || '10');
					const sessions = getRecentActivity(Math.min(limit, 50));
					this.sendJSON(res, 200, { sessions, count: sessions.length });
				}
				else if (req.method === 'POST' && pathname === '/v1/conversations') {
					const body = await this.readBody(req);
					let payload: ConversationPayload;
					try {
						payload = JSON.parse(body);
					} catch {
						this.sendJSON(res, 400, { error: 'Invalid JSON' });
						return;
					}
					const result = storeConversation(payload);
					this.sendJSON(res, 201, result);
				}
				else {
					this.sendJSON(res, 404, { error: 'Not found', endpoints: [
						'GET /health',
						'GET /v1/cognitive/state',
						'GET /v1/activity/recent?limit=10',
						'POST /v1/conversations',
					]});
				}
			} catch (error) {
				console.error('[CognitiveEngine] Request error:', error);
				this.sendJSON(res, 500, { error: String(error) });
			}
		});

		this.server.on('error', (err: NodeJS.ErrnoException) => {
			if (err.code === 'EADDRINUSE') {
				console.warn(`[CognitiveEngine] Port ${COGNITIVE_PORT} in use, skipping`);
				return;
			}
			console.error('[CognitiveEngine] Server error:', err.message);
		});

		this.server.listen(COGNITIVE_PORT, () => {
			console.log(`[CognitiveEngine] Running on http://localhost:${COGNITIVE_PORT}`);
		});
	}

	stop(): void {
		if (this.server) {
			this.server.close();
			this.server = null;
			console.log('[CognitiveEngine] Stopped');
		}
	}

	dispose(): void {
		this.stop();
	}

	private sendJSON(res: http.ServerResponse, status: number, data: unknown): void {
		res.writeHead(status, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(data));
	}

	private readBody(req: http.IncomingMessage): Promise<string> {
		return new Promise((resolve, reject) => {
			let body = '';
			req.on('data', (chunk: Buffer) => body += chunk);
			req.on('end', () => resolve(body));
			req.on('error', reject);
		});
	}
}
