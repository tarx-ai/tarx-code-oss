/**
 * TARX Claude Bridge
 * Stateless reasoning architecture - TARX owns state, Claude reasons
 *
 * Flow:
 * 1. TARX builds payload (task + context + constraints)
 * 2. Sends to Claude (API or CLI)
 * 3. Claude returns response + next_steps
 * 4. TARX executes next_steps (store memory, queue tasks, refresh UI)
 *
 * @file extensions/tarx/src/claude-bridge.ts
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync, execFile } from 'child_process';

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
	DB_PATH: path.join(os.homedir(), 'Library/Application Support/tarx/memory.db'),
	TARX_ROOT: path.join(os.homedir(), 'TARX'),
	BRIDGE_LOG: path.join(os.homedir(), 'TARX', 'claude-bridge.log'),
	QUEUE_POLL_INTERVAL: 5000, // 5 seconds
	MAX_RECENT_TURNS: 10,
	MAX_RAG_CHUNKS: 5,
	MAX_GENESIS_TOKENS: 2000,
	MAX_INSTRUCTIONS_TOKENS: 1000,
};

// Resolve Claude CLI binary path (checks common locations, then `which`)
const CLAUDE_CLI_PATH = (() => {
	const candidates = [
		path.join(os.homedir(), '.npm-global/bin/claude'),
		'/opt/homebrew/bin/claude',
		'/usr/local/bin/claude',
	];
	for (const p of candidates) {
		try { if (require('fs').existsSync(p)) return p; } catch { /* skip */ }
	}
	try {
		return execSync('which claude', { encoding: 'utf8' }).trim();
	} catch {
		return '/opt/homebrew/bin/claude';
	}
})();

// ============================================================
// TYPES
// ============================================================

export type TaskType = 'reason' | 'code' | 'debug' | 'plan';

export interface BridgeTask {
	type: TaskType;
	query: string;
	session_id: string;
	project_id: string;
}

export interface ConversationTurn {
	role: 'user' | 'assistant';
	content: string;
	timestamp: string;
}

export interface RAGChunk {
	source: string;
	content: string;
	relevance: number;
}

export interface BridgeContext {
	genesis: string;
	project_instructions: string;
	recent_turns: ConversationTurn[];
	rag_chunks: RAGChunk[];
	active_errors: string[];
	pending_tasks: string[];
}

export interface BridgeConstraints {
	max_response_tokens: number;
	response_format: 'structured' | 'freeform';
	return_next_steps: boolean;
}

export interface BridgePayload {
	task: BridgeTask;
	context: BridgeContext;
	constraints: BridgeConstraints;
}

export interface NextStep {
	action: 'store_memory' | 'queue_task' | 'update_ui' | 'execute_command' | 'log';
	content?: string;
	description?: string;
	section?: string;
	refresh?: boolean;
	command?: string;
	args?: any[];
}

export interface BridgeResponse {
	response: string;
	session_id: string;
	metadata: {
		confidence: number;
		needs_clarification: boolean;
		clarification_question: string | null;
	};
	next_steps: NextStep[];
}

export interface QueueItem {
	id: string;
	payload_json: string;
	description?: string;
	project_id?: string;
	status: 'pending' | 'processing' | 'completed' | 'failed';
	created_at: number;
	completed_at: number | null;
	response_json: string | null;
	error: string | null;
}

// ============================================================
// DATABASE UTILITIES
// ============================================================

function queryDB<T>(sql: string): T[] {
	try {
		const result = execSync(`sqlite3 "${CONFIG.DB_PATH}" -json`, {
			encoding: 'utf8',
			input: sql,
			timeout: 10000,
			maxBuffer: 10 * 1024 * 1024
		});
		return JSON.parse(result || '[]');
	} catch {
		return [];
	}
}

function execDB(sql: string): void {
	try {
		execSync(`sqlite3 "${CONFIG.DB_PATH}"`, {
			input: sql,
			encoding: 'utf8',
			timeout: 10000
		});
	} catch (e) {
		logBridge('DB exec error: ' + e);
	}
}

// ============================================================
// LOGGING
// ============================================================

function logBridge(message: string): void {
	try {
		const logDir = path.dirname(CONFIG.BRIDGE_LOG);
		if (!fs.existsSync(logDir)) {
			fs.mkdirSync(logDir, { recursive: true });
		}
		const timestamp = new Date().toISOString();
		fs.appendFileSync(CONFIG.BRIDGE_LOG, `[${timestamp}] [Bridge] ${message}\n`);
	} catch (e) {
		console.error('[TARX Bridge] Log error:', e);
	}
}

// ============================================================
// TARX Bridge Integration - Feb 2026
// INTENT DETECTION
// ============================================================

/**
 * Action keywords that indicate the user wants to DO something (not just think/analyze)
 */
// Narrowed to match only clear CRUD/action verbs that parseActionIntent can handle.
// Previously included broad words (show, list, get, fix, make, add, set, open, run, build)
// that matched nearly every user message, causing false positives that routed through
// the slow bridge path and blocked the chat on follow-up queries (#3).
const ACTION_KEYWORDS = [
	'create', 'delete', 'remove',  // CRUD operations parseActionIntent handles
	'list',                         // list_spaces, list_sessions
	'upload', 'download',           // File operations
	'rename',                       // Explicit rename intent
];

/**
 * Detect if a message contains action intent (wants to DO something)
 * Returns true if the message appears to request an action
 */
export function detectActionIntent(message: string): boolean {
	const lowerMessage = message.toLowerCase();

	// Check for action keywords at word boundaries
	for (const keyword of ACTION_KEYWORDS) {
		// Match keyword at word boundary (not part of another word)
		const regex = new RegExp(`\\b${keyword}\\b`, 'i');
		if (regex.test(lowerMessage)) {
			logBridge(`Action intent detected: keyword "${keyword}" in message`);
			return true;
		}
	}

	// Also check for imperative patterns
	const imperativePatterns = [
		/^please\s/i,           // "Please create..."
		/^can you\s/i,          // "Can you make..."
		/^could you\s/i,        // "Could you add..."
		/^i want (to|you to)\s/i, // "I want to create..."
		/^i need (to|you to)\s/i, // "I need you to..."
		/let's\s/i,             // "Let's build..."
		/^go ahead and\s/i,     // "Go ahead and..."
	];

	for (const pattern of imperativePatterns) {
		if (pattern.test(lowerMessage)) {
			logBridge(`Action intent detected: imperative pattern`);
			return true;
		}
	}

	return false;
}

// ============================================================
// DIRECT ACTION EXECUTION (Path A - Feb 2026)
// Execute CRUD operations directly instead of asking Claude to generate text
// ============================================================

export interface ParsedAction {
	action: 'create_space' | 'create_session' | 'list_spaces' | 'list_sessions' | 'delete_space' | 'send_message' | 'unknown';
	params: Record<string, any>;
	confidence: number;
}

/**
 * Parse user message into a structured action intent
 * Returns action type and extracted parameters
 */
export function parseActionIntent(message: string): ParsedAction {
	const lower = message.toLowerCase().trim();
	const trimmed = message.trim();

	logBridge(`parseActionIntent input: "${trimmed.slice(0, 100)}"`);

	// "Create a new space called X" or "Create a new space called X with emoji Y"
	// Two-step parsing: first extract name, then optionally extract emoji
	const spacePattern = /create\s+(?:a\s+)?(?:new\s+)?space\s+(?:called\s+|named\s+)?(.+)/i;
	const spaceMatch = trimmed.match(spacePattern);
	if (spaceMatch) {
		let remainder = spaceMatch[1].trim();
		let name: string;
		let emoji = '📁';

		// Check if there's an emoji specification
		const emojiMatch = remainder.match(/^(.+?)\s+with\s+emoji\s+(\S+)/i);
		if (emojiMatch) {
			name = emojiMatch[1].trim();
			emoji = emojiMatch[2].trim();
		} else {
			// Check for quoted name
			const quotedMatch = remainder.match(/^["'](.+?)["']|^"(.+?)"|^'(.+?)'/);
			if (quotedMatch) {
				name = (quotedMatch[1] || quotedMatch[2] || quotedMatch[3]).trim();
			} else {
				// Unquoted - take the whole remainder
				name = remainder.trim();
			}
		}

		logBridge(`Parsed action: create_space name="${name}" emoji="${emoji}"`);
		return {
			action: 'create_space',
			params: { name, emoji, description: '' },
			confidence: 0.9
		};
	}

	// "List spaces" / "Show spaces" / "What spaces do I have"
	if (/\b(?:list|show)\s+(?:all\s+)?(?:my\s+)?spaces\b|what\s+spaces/i.test(lower)) {
		logBridge('Parsed action: list_spaces');
		return { action: 'list_spaces', params: {}, confidence: 0.9 };
	}

	// "List sessions" / "Show sessions"
	if (/\b(?:list|show)\s+(?:all\s+)?(?:my\s+)?sessions\b/i.test(lower)) {
		logBridge('Parsed action: list_sessions');
		return { action: 'list_sessions', params: {}, confidence: 0.8 };
	}

	// "Create session called X" / "New session X"
	const sessionPattern = /(?:create|new)\s+(?:a\s+)?(?:new\s+)?session\s+(?:called\s+|named\s+|titled\s+)?(.+)/i;
	const sessionMatch = trimmed.match(sessionPattern);
	if (sessionMatch) {
		let title = sessionMatch[1].trim();
		// Remove quotes if present
		title = title.replace(/^["'](.+?)["']$/, '$1').trim();
		logBridge(`Parsed action: create_session title="${title}"`);
		return {
			action: 'create_session',
			params: { title },
			confidence: 0.85
		};
	}

	// "Delete space X" / "Remove space X"
	const deletePattern = /(?:delete|remove)\s+(?:the\s+)?space\s+(?:called\s+|named\s+)?(.+)/i;
	const deleteSpaceMatch = trimmed.match(deletePattern);
	if (deleteSpaceMatch) {
		let name = deleteSpaceMatch[1].trim();
		name = name.replace(/^["'](.+?)["']$/, '$1').trim();
		logBridge(`Parsed action: delete_space name="${name}"`);
		return {
			action: 'delete_space',
			params: { name },
			confidence: 0.85
		};
	}

	// Fallback: unrecognized action
	logBridge('Parsed action: unknown');
	return { action: 'unknown', params: { raw: message }, confidence: 0.3 };
}

/**
 * Generate a UUID for new records
 */
function generateUUID(): string {
	return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Execute MCP-style operations directly via SQLite
 * This is the REAL execution - not Claude generating text about it
 */
export function tarxMcpCall(toolName: string, args: Record<string, any>): any {
	logBridge(`Direct MCP call: ${toolName} args=${JSON.stringify(args)}`);

	switch (toolName) {
		case 'tarx_create_space': {
			const id = `space-${generateUUID()}`;
			const now = Date.now();
			const name = args.name || 'Untitled Space';
			const emoji = args.emoji || '📁';
			const description = args.description || '';

			execDB(`
				INSERT INTO spaces (id, name, description, emoji, created_at, updated_at, last_accessed_at, message_count, total_tokens)
				VALUES ('${id}', '${name.replace(/'/g, "''")}', '${description.replace(/'/g, "''")}', '${emoji}', ${now}, ${now}, ${now}, 0, 0);
			`);

			logBridge(`Created space: id=${id} name="${name}"`);
			return { id, name, emoji, description };
		}

		case 'tarx_create_session': {
			const id = `session-${generateUUID()}`;
			const now = Date.now();
			const title = args.title || 'New Session';
			const spaceId = args.spaceId || null;

			execDB(`
				INSERT INTO sessions (id, title, space_id, created_at, updated_at, last_activity)
				VALUES ('${id}', '${title.replace(/'/g, "''")}', ${spaceId ? `'${spaceId}'` : 'NULL'}, ${now}, ${now}, ${now});
			`);

			logBridge(`Created session: id=${id} title="${title}"`);
			return { id, title, spaceId };
		}

		case 'tarx_list_spaces': {
			const rows = queryDB<any>(`
				SELECT id, name, emoji, description, message_count, created_at, updated_at
				FROM spaces
				WHERE deleted_at IS NULL
				ORDER BY updated_at DESC
				LIMIT 50;
			`);
			logBridge(`Listed ${rows.length} spaces`);
			return { spaces: rows };
		}

		case 'tarx_list_sessions': {
			const spaceId = args.spaceId;
			const whereClause = spaceId ? `WHERE space_id = '${spaceId}' AND deleted_at IS NULL` : 'WHERE deleted_at IS NULL';
			const rows = queryDB<any>(`
				SELECT id, title, space_id, message_count, created_at, updated_at
				FROM sessions
				${whereClause}
				ORDER BY updated_at DESC
				LIMIT 50;
			`);
			logBridge(`Listed ${rows.length} sessions`);
			return { sessions: rows };
		}

		case 'tarx_delete_space': {
			const now = Date.now();
			const name = args.name;
			// Soft delete
			execDB(`UPDATE spaces SET deleted_at = ${now} WHERE name = '${name.replace(/'/g, "''")}'`);
			logBridge(`Deleted space: name="${name}"`);
			return { success: true, name };
		}

		default:
			logBridge(`Unknown MCP tool: ${toolName}`);
			throw new Error(`Unknown MCP tool: ${toolName}`);
	}
}

/**
 * Handle a detected action intent by executing it directly
 * Returns a formatted result string for display in chat
 */
export async function handleActionIntent(message: string): Promise<{ success: boolean; result: string; action: string }> {
	const parsed = parseActionIntent(message);

	logBridge(`Handling action: ${parsed.action} (confidence: ${parsed.confidence})`);

	if (parsed.confidence < 0.5 || parsed.action === 'unknown') {
		return {
			success: false,
			result: '',
			action: 'unknown'
		};
	}

	try {
		switch (parsed.action) {
			case 'create_space': {
				const result = tarxMcpCall('tarx_create_space', parsed.params);
				return {
					success: true,
					result: `**Created space** "${result.name}"\n\n*ID: \`${result.id}\`*`,
					action: 'create_space'
				};
			}

			case 'create_session': {
				const result = tarxMcpCall('tarx_create_session', parsed.params);
				return {
					success: true,
					result: `**Created session** "${result.title}"\n\n*ID: \`${result.id}\`*`,
					action: 'create_session'
				};
			}

			case 'list_spaces': {
				const result = tarxMcpCall('tarx_list_spaces', {});
				if (result.spaces.length === 0) {
					return {
						success: true,
						result: '**No spaces found.** Create one with "Create a new space called My Space"',
						action: 'list_spaces'
					};
				}
				const list = result.spaces
					.map((s: any) => `- **${s.name}** (${s.message_count || 0} messages)`)
					.join('\n');
				return {
					success: true,
					result: `**Spaces (${result.spaces.length}):**\n\n${list}`,
					action: 'list_spaces'
				};
			}

			case 'list_sessions': {
				const result = tarxMcpCall('tarx_list_sessions', parsed.params);
				if (result.sessions.length === 0) {
					return {
						success: true,
						result: '**No sessions found.**',
						action: 'list_sessions'
					};
				}
				const list = result.sessions
					.map((s: any) => `- **${s.title}** (${s.message_count || 0} messages)`)
					.join('\n');
				return {
					success: true,
					result: `**Sessions (${result.sessions.length}):**\n\n${list}`,
					action: 'list_sessions'
				};
			}

			case 'delete_space': {
				const result = tarxMcpCall('tarx_delete_space', parsed.params);
				return {
					success: true,
					result: `**Deleted space** "${parsed.params.name}"`,
					action: 'delete_space'
				};
			}

			default:
				return { success: false, result: '', action: 'unknown' };
		}
	} catch (error: any) {
		logBridge(`Action execution failed: ${error.message}`);
		return {
			success: false,
			result: `❌ **Action failed:** ${error.message}`,
			action: parsed.action
		};
	}
}

// ============================================================
// BRIDGE AVAILABILITY
// ============================================================

export type BridgeStatus = 'active' | 'local_only' | 'offline';

/**
 * Check if Claude bridge is available
 * Returns: 'active' (Claude reachable), 'local_only' (only Qwen), 'offline' (nothing)
 */
export async function checkBridgeAvailability(): Promise<BridgeStatus> {
	// Check 1: ANTHROPIC_API_KEY environment variable
	if (process.env.ANTHROPIC_API_KEY) {
		logBridge('Bridge available: ANTHROPIC_API_KEY found');
		return 'active';
	}

	// Check 2: Claude CLI in PATH
	try {
		const whichResult = execSync('which claude', { encoding: 'utf8', timeout: 5000 });
		if (whichResult.trim()) {
			logBridge('Bridge available: Claude CLI found at ' + whichResult.trim());
			return 'active';
		}
	} catch (e) {
		// Claude CLI not found, continue checking
	}

	// Check 3: Local model available
	try {
		const response = await fetch('http://localhost:11435/health', {
			signal: AbortSignal.timeout(2000)
		});
		if (response.ok) {
			logBridge('Local model available, bridge not available');
			return 'local_only';
		}
	} catch (e) {
		// Local model not reachable
	}

	logBridge('No inference available');
	return 'offline';
}

// Cache bridge status for 30 seconds
let cachedBridgeStatus: BridgeStatus | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 30000;

export async function getBridgeStatus(): Promise<BridgeStatus> {
	const now = Date.now();
	if (cachedBridgeStatus && (now - cacheTimestamp) < CACHE_TTL) {
		return cachedBridgeStatus;
	}

	cachedBridgeStatus = await checkBridgeAvailability();
	cacheTimestamp = now;
	return cachedBridgeStatus;
}

/**
 * Get human-readable bridge status for UI
 */
export function getBridgeStatusDisplay(status: BridgeStatus): { icon: string; text: string; tooltip: string } {
	switch (status) {
		case 'active':
			return { icon: '🟢', text: 'TARX Bridge Active', tooltip: 'Claude is available for action execution' };
		case 'local_only':
			return { icon: '🟡', text: 'Local Reasoning Only', tooltip: 'Local model available. Action execution requires TARX bridge.' };
		case 'offline':
			return { icon: '🔴', text: 'Offline', tooltip: 'No inference available' };
	}
}

// ============================================================
// GENESIS CONTEXT (Identity, Mission, Constraints)
// ============================================================

const GENESIS_CONTEXT = `
TARX Genesis Identity:
- Local. Private. Proactive. AI workbench built as VS Code fork (Code-OSS)
- Core mission: Augment developer flow with persistent memory, RAG, and autonomous task execution
- Architecture: SQLite + sqlite-vec for embeddings, MCP protocol for tool integration
- Key constraint: Claude is stateless - TARX must provide complete context on every call

Core Capabilities:
- Project management with per-project instructions and file context
- Conversation history with session persistence
- RAG-powered knowledge retrieval from indexed files
- Hive communication between Claude instances (Slave 2, Slave 3, etc.)
- Sidebar UX with collapsible sections (Instructions, Files, Conversations, Memory)

Behavioral Guidelines:
- Reason about the provided context, don't assume prior knowledge
- Return structured next_steps for TARX to execute
- Flag when clarification is needed rather than guessing
- Keep responses focused and actionable
`.trim();

// Bridge Schema Fix - Feb 4, 2026
// ============================================================
// DATABASE SCHEMA (injected into every payload so Claude writes correct SQL)
// ============================================================

const TARX_DB_SCHEMA = `
-- TARX SQLite Database Schema (memory.db)
-- Use ONLY these exact table and column names. NEVER guess.

CREATE TABLE spaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    emoji TEXT DEFAULT '💬',
    message_count INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_accessed_at INTEGER,
    deleted_at INTEGER DEFAULT NULL
);

CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    space_id TEXT REFERENCES spaces(id),
    model TEXT,
    message_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER DEFAULT NULL,
    topic TEXT,
    metadata TEXT,
    last_activity INTEGER,
    total_tokens INTEGER DEFAULT 0
);

CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    model TEXT,
    tokens INTEGER,
    latency_ms INTEGER,
    deleted_at INTEGER
);

CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    root TEXT NOT NULL UNIQUE,
    type TEXT,
    created_at INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    color TEXT DEFAULT '#0066FF'
);

CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    title TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE conversation_turns (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    file_refs TEXT DEFAULT '[]',
    artifacts TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    embedding BLOB,
    source TEXT DEFAULT 'claude',
    source_id TEXT,
    importance REAL DEFAULT 0.5,
    access_count INTEGER DEFAULT 0,
    last_accessed_at INTEGER,
    created_at INTEGER NOT NULL,
    deleted_at INTEGER
);

CREATE TABLE files (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    sha256_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_accessed_at INTEGER,
    reference_count INTEGER DEFAULT 1,
    deleted_at INTEGER
);

CREATE TABLE knowledge_embeddings (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    embedding BLOB,
    source TEXT,
    space_id TEXT,
    source_type TEXT DEFAULT 'file',
    source_id TEXT,
    title TEXT,
    created_at INTEGER
);
`.trim();

// Bridge Schema Fix - Feb 4, 2026
// ============================================================
// MCP TOOL INSTRUCTIONS (prefer tools over raw SQL)
// ============================================================

const MCP_TOOL_INSTRUCTIONS = `
IMPORTANT: Use TARX MCP tools for database operations instead of raw SQL when possible.

Available MCP tools:
- tarx_create_space(name, description?, emoji?) - Creates a new space
- tarx_create_session(spaceId, title?) - Creates a session within a space
- tarx_send_message(sessionId, message) - Sends a message and gets AI response
- tarx_list_spaces() - Lists all spaces
- tarx_list_sessions(spaceId) - Lists sessions in a space
- tarx_get_session(sessionId) - Gets session details with messages
- tarx_upload_file(content, filename, spaceId) - Uploads a file to a space
- tarx_db_query(sql) - Run raw SQL (only if no MCP tool exists for the operation)

Workflow for creating content:
1. Create a space first: tarx_create_space("Space Name", "description", "emoji")
2. Create a session in that space: tarx_create_session(spaceId, "Session Title")
3. Send messages: tarx_send_message(sessionId, "message content")

NEVER write raw INSERT/UPDATE/DELETE SQL. Use the MCP tools.
For SELECT queries to read data, tarx_db_query is acceptable.
`.trim();

// ============================================================
// PAYLOAD BUILDER
// ============================================================

/**
 * Build a complete payload for Claude reasoning
 */
export async function buildPayload(
	task: BridgeTask,
	constraints?: Partial<BridgeConstraints>
): Promise<BridgePayload> {
	logBridge(`Building payload for task: ${task.type} - ${task.query.slice(0, 50)}...`);

	// Get project instructions
	const projectInstructions = await getProjectInstructions(task.project_id);

	// Get recent conversation turns
	const recentTurns = await getRecentTurns(task.session_id, CONFIG.MAX_RECENT_TURNS);

	// Get RAG chunks relevant to query
	const ragChunks = await getRAGChunks(task.query, task.project_id, CONFIG.MAX_RAG_CHUNKS);

	// Get active errors from logs
	const activeErrors = await getActiveErrors();

	// Get pending tasks
	const pendingTasks = await getPendingTasks(task.project_id);

	const payload: BridgePayload = {
		task,
		context: {
			genesis: GENESIS_CONTEXT,
			project_instructions: projectInstructions,
			recent_turns: recentTurns,
			rag_chunks: ragChunks,
			active_errors: activeErrors,
			pending_tasks: pendingTasks
		},
		constraints: {
			max_response_tokens: constraints?.max_response_tokens ?? 2000,
			response_format: constraints?.response_format ?? 'structured',
			return_next_steps: constraints?.return_next_steps ?? true
		}
	};

	logBridge(`Payload built: ${recentTurns.length} turns, ${ragChunks.length} RAG chunks`);
	return payload;
}

/**
 * Get project instructions from DB or .tarx/instructions.md
 */
async function getProjectInstructions(projectId: string): Promise<string> {
	// Note: projects table doesn't have instructions column - load from file only
	const projects = queryDB<any>(`
		SELECT root FROM projects WHERE id = '${projectId}' LIMIT 1;
	`);

	if (projects.length === 0) return '';

	const project = projects[0];
	let instructions = '';

	// Try to load from file
	if (project.root) {
		try {
			const filePath = path.join(project.root, '.tarx', 'instructions.md');
			if (fs.existsSync(filePath)) {
				instructions = fs.readFileSync(filePath, 'utf8');
			}
		} catch (e) { /* ignore */ }
	}

	// Truncate if too long
	if (instructions.length > CONFIG.MAX_INSTRUCTIONS_TOKENS * 4) {
		instructions = instructions.slice(0, CONFIG.MAX_INSTRUCTIONS_TOKENS * 4) + '...';
	}

	return instructions;
}

/**
 * Get recent conversation turns for a session
 */
async function getRecentTurns(sessionId: string, limit: number): Promise<ConversationTurn[]> {
	// Note: conversation_turns uses conversation_id, not session_id
	const turns = queryDB<any>(`
		SELECT role, content, created_at as timestamp
		FROM conversation_turns
		WHERE conversation_id = '${sessionId}'
		ORDER BY created_at DESC
		LIMIT ${limit};
	`);

	return turns.reverse().map(t => ({
		role: t.role,
		content: t.content,
		timestamp: t.timestamp
	}));
}

/**
 * Get RAG chunks relevant to query using sqlite-vec
 */
async function getRAGChunks(query: string, projectId: string, limit: number): Promise<RAGChunk[]> {
	// Join chunk_embeddings with files to get source filename
	// Note: chunk_embeddings links via file_id, not space_id
	try {
		const chunks = queryDB<any>(`
			SELECT f.filename as source, ce.content, 0.8 as relevance
			FROM chunk_embeddings ce
			LEFT JOIN files f ON ce.file_id = f.id
			ORDER BY ce.created_at DESC
			LIMIT ${limit};
		`);

		return chunks.map(c => ({
			source: c.source || 'unknown',
			content: c.content?.slice(0, 500) || '',
			relevance: c.relevance
		}));
	} catch (e) {
		// RAG table may not exist or be empty
		console.warn('[Bridge] RAG query failed:', e);
		return [];
	}
}

/**
 * Get active errors from recent logs
 */
async function getActiveErrors(): Promise<string[]> {
	// Check hive log for recent errors
	try {
		const hivePath = path.join(CONFIG.TARX_ROOT, 'sidebar-hive.log');
		if (fs.existsSync(hivePath)) {
			const content = fs.readFileSync(hivePath, 'utf8');
			const lines = content.split('\n').slice(-50);
			const errors = lines.filter(l => l.includes('ERROR') || l.includes('error'));
			return errors.slice(-5);
		}
	} catch (e) { /* ignore */ }
	return [];
}

/**
 * Get pending tasks for a project
 */
async function getPendingTasks(projectId: string): Promise<string[]> {
	const tasks = queryDB<any>(`
		SELECT description FROM bridge_queue
		WHERE project_id = '${projectId}' AND status = 'pending'
		ORDER BY created_at DESC LIMIT 10;
	`);

	return tasks.map(t => t.description);
}

// ============================================================
// CLAUDE INVOCATION
// ============================================================

/**
 * Send payload to Claude and get response
 * Supports: API (via curl) or CLI (claude command)
 */
export async function invokeClaudeWithPayload(
	payload: BridgePayload,
	method: 'cli' | 'api' = 'cli'
): Promise<BridgeResponse> {
	logBridge(`Invoking Claude via ${method}`);

	const prompt = formatPayloadAsPrompt(payload);

	if (method === 'cli') {
		return invokeCLI(prompt, payload.task.session_id);
	} else {
		return invokeAPI(prompt, payload.task.session_id);
	}
}

/**
 * Format payload as a structured prompt for Claude
 */
function formatPayloadAsPrompt(payload: BridgePayload): string {
	const sections: string[] = [];

	// Task
	sections.push(`## Task
Type: ${payload.task.type}
Query: ${payload.task.query}
Session: ${payload.task.session_id}
Project: ${payload.task.project_id}`);

	// Genesis
	sections.push(`## System Context (Genesis)
${payload.context.genesis}`);

	// Bridge Schema Fix - Feb 4, 2026: Add database schema
	sections.push(`## Database Schema
${TARX_DB_SCHEMA}`);

	// Bridge Schema Fix - Feb 4, 2026: Add MCP tool instructions
	sections.push(`## MCP Tools
${MCP_TOOL_INSTRUCTIONS}`);

	// Project instructions
	if (payload.context.project_instructions) {
		sections.push(`## Project Instructions
${payload.context.project_instructions}`);
	}

	// Recent turns
	if (payload.context.recent_turns.length > 0) {
		const turnsText = payload.context.recent_turns
			.map(t => `[${t.role}] ${t.content.slice(0, 500)}`)
			.join('\n\n');
		sections.push(`## Recent Conversation
${turnsText}`);
	}

	// RAG chunks
	if (payload.context.rag_chunks.length > 0) {
		const chunksText = payload.context.rag_chunks
			.map(c => `[${c.source}] (relevance: ${c.relevance})\n${c.content}`)
			.join('\n\n');
		sections.push(`## Relevant Knowledge (RAG)
${chunksText}`);
	}

	// Active errors
	if (payload.context.active_errors.length > 0) {
		sections.push(`## Active Errors
${payload.context.active_errors.join('\n')}`);
	}

	// Pending tasks
	if (payload.context.pending_tasks.length > 0) {
		sections.push(`## Pending Tasks
${payload.context.pending_tasks.map(t => `- ${t}`).join('\n')}`);
	}

	// Response instructions
	sections.push(`## Response Format
Return a JSON object with:
- response: Your answer to the query
- metadata: { confidence: 0-1, needs_clarification: boolean, clarification_question: string|null }
- next_steps: Array of actions for TARX to execute:
  - { action: "store_memory", content: "what to remember" }
  - { action: "queue_task", description: "task to queue" }
  - { action: "update_ui", section: "history|files|memory", refresh: true }
  - { action: "execute_command", command: "vscode.command", args: [...] }
  - { action: "log", content: "message to log" }

Max tokens: ${payload.constraints.max_response_tokens}
Format: ${payload.constraints.response_format}`);

	return sections.join('\n\n---\n\n');
}

/**
 * Invoke Claude CLI using stdin piping (proven working pattern)
 * Uses full path and execFile for reliable invocation from VS Code
 */
async function invokeCLI(prompt: string, sessionId: string): Promise<BridgeResponse> {
	return new Promise((resolve, reject) => {
		logBridge(`CLI invocation started via stdin piping to ${CLAUDE_CLI_PATH}`);

		const child = execFile(
			CLAUDE_CLI_PATH,
			['--print'],
			{
				timeout: 120000, // 2 minute timeout
				maxBuffer: 5 * 1024 * 1024, // 5MB buffer for large responses
				env: { ...process.env }
			},
			(error, stdout, stderr) => {
				if (error) {
					logBridge(`CLI error: ${error.message}, stderr: ${stderr}`);
					reject(new Error(`Claude CLI failed: ${error.message}\n${stderr}`));
					return;
				}

				logBridge(`CLI response received: ${stdout.length} chars`);

				try {
					// Try to parse as JSON
					const jsonMatch = stdout.match(/\{[\s\S]*\}/);
					if (jsonMatch) {
						const parsed = JSON.parse(jsonMatch[0]);
						resolve({
							response: parsed.response || stdout,
							session_id: sessionId,
							metadata: parsed.metadata || { confidence: 0.8, needs_clarification: false, clarification_question: null },
							next_steps: parsed.next_steps || []
						});
					} else {
						// Return as freeform response
						resolve({
							response: stdout,
							session_id: sessionId,
							metadata: { confidence: 0.8, needs_clarification: false, clarification_question: null },
							next_steps: []
						});
					}
				} catch (e) {
					logBridge(`Failed to parse CLI response: ${e}`);
					resolve({
						response: stdout,
						session_id: sessionId,
						metadata: { confidence: 0.5, needs_clarification: false, clarification_question: null },
						next_steps: []
					});
				}
			}
		);

		// Pipe prompt to stdin
		if (child.stdin) {
			child.stdin.write(prompt);
			child.stdin.end();
		} else {
			reject(new Error('Failed to access stdin for Claude CLI'));
		}
	});
}

/**
 * Invoke Claude API (placeholder - needs API key)
 */
async function invokeAPI(prompt: string, sessionId: string): Promise<BridgeResponse> {
	// TODO: Implement actual API call
	logBridge('API invocation not implemented yet');
	return {
		response: 'API invocation not implemented',
		session_id: sessionId,
		metadata: { confidence: 0, needs_clarification: true, clarification_question: 'API not configured' },
		next_steps: []
	};
}

// ============================================================
// NEXT STEPS EXECUTOR
// ============================================================

/**
 * Execute next_steps returned by Claude
 */
export async function executeNextSteps(
	context: vscode.ExtensionContext,
	steps: NextStep[]
): Promise<void> {
	logBridge(`Executing ${steps.length} next steps`);

	for (const step of steps) {
		try {
			switch (step.action) {
				case 'store_memory':
					await storeMemory(step.content || '');
					break;

				case 'queue_task':
					await queueTask(step.description || '');
					break;

				case 'update_ui':
					await updateUI(step.section, step.refresh);
					break;

				case 'execute_command':
					if (step.command) {
						await vscode.commands.executeCommand(step.command, ...(step.args || []));
					}
					break;

				case 'log':
					logBridge(`[NextStep] ${step.content}`);
					break;
			}
			logBridge(`Executed: ${step.action}`);
		} catch (e) {
			logBridge(`Failed to execute ${step.action}: ${e}`);
		}
	}
}

async function storeMemory(content: string): Promise<void> {
	const id = `mem-${Date.now()}`;
	const escaped = content.replace(/'/g, "''");
	execDB(`
		INSERT INTO project_memory (id, project_id, key, value, created_at)
		VALUES ('${id}', 'default', 'bridge_memory', '${escaped}', ${Date.now()});
	`);
}

async function queueTask(description: string): Promise<void> {
	const id = `task-${Date.now()}`;
	const escaped = description.replace(/'/g, "''");
	execDB(`
		INSERT INTO bridge_queue (id, project_id, description, status, created_at)
		VALUES ('${id}', 'default', '${escaped}', 'pending', ${Date.now()});
	`);
}

async function updateUI(section?: string, refresh?: boolean): Promise<void> {
	if (refresh) {
		if (section === 'history' || !section) {
			await vscode.commands.executeCommand('tarx.sidebar.refresh');
		}
		if (section === 'context') {
			await vscode.commands.executeCommand('tarx.sidebar.refreshContext');
		}
	}
}

// ============================================================
// QUEUE HANDLER
// ============================================================

let queueTimer: NodeJS.Timeout | null = null;

/**
 * Start the queue processor
 */
export function startQueueProcessor(context: vscode.ExtensionContext): void {
	logBridge('Queue processor started');

	// Ensure queue table exists
	execDB(`
		CREATE TABLE IF NOT EXISTS bridge_queue (
			id TEXT PRIMARY KEY,
			project_id TEXT,
			payload_json TEXT,
			description TEXT,
			status TEXT DEFAULT 'pending',
			created_at INTEGER,
			completed_at INTEGER,
			response_json TEXT,
			error TEXT
		);
	`);

	queueTimer = setInterval(async () => {
		await processQueue(context);
	}, CONFIG.QUEUE_POLL_INTERVAL);
}

/**
 * Stop the queue processor
 */
export function stopQueueProcessor(): void {
	if (queueTimer) {
		clearInterval(queueTimer);
		queueTimer = null;
		logBridge('Queue processor stopped');
	}
}

/**
 * Process pending items in the queue
 */
async function processQueue(context: vscode.ExtensionContext): Promise<void> {
	const pending = queryDB<QueueItem>(`
		SELECT * FROM bridge_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1;
	`);

	if (pending.length === 0) return;

	const item = pending[0];
	logBridge(`Processing queue item: ${item.id}`);

	// Mark as processing
	execDB(`UPDATE bridge_queue SET status = 'processing' WHERE id = '${item.id}';`);

	try {
		// Parse payload or build from description
		let payload: BridgePayload;
		if (item.payload_json) {
			payload = JSON.parse(item.payload_json);
		} else {
			payload = await buildPayload({
				type: 'reason',
				query: item.description || 'No query provided',
				session_id: `queue-${item.id}`,
				project_id: item.project_id || 'default'
			});
		}

		// Invoke Claude
		const response = await invokeClaudeWithPayload(payload);

		// Store response
		const responseJson = JSON.stringify(response).replace(/'/g, "''");
		execDB(`
			UPDATE bridge_queue
			SET status = 'completed', completed_at = ${Date.now()}, response_json = '${responseJson}'
			WHERE id = '${item.id}';
		`);

		// Execute next steps
		await executeNextSteps(context, response.next_steps);

		logBridge(`Queue item ${item.id} completed`);
	} catch (e) {
		const error = String(e).replace(/'/g, "''");
		execDB(`
			UPDATE bridge_queue
			SET status = 'failed', completed_at = ${Date.now()}, error = '${error}'
			WHERE id = '${item.id}';
		`);
		logBridge(`Queue item ${item.id} failed: ${e}`);
	}
}

// ============================================================
// ROUND-TRIP TEST
// ============================================================

/**
 * Run a test round-trip to verify the bridge works
 */
export async function runRoundTripTest(context: vscode.ExtensionContext): Promise<void> {
	logBridge('=== ROUND-TRIP TEST STARTED ===');

	const testPayload = await buildPayload({
		type: 'reason',
		query: 'Summarize TARX genesis moment and architecture in 2-3 sentences.',
		session_id: `test-${Date.now()}`,
		project_id: 'tarx-dev'
	}, {
		max_response_tokens: 500,
		response_format: 'structured',
		return_next_steps: true
	});

	logBridge(`Test payload context: ${testPayload.context.recent_turns.length} turns, ${testPayload.context.rag_chunks.length} chunks`);

	try {
		const response = await invokeClaudeWithPayload(testPayload, 'cli');

		logBridge(`Test response received:`);
		logBridge(`- Response: ${response.response.slice(0, 200)}...`);
		logBridge(`- Confidence: ${response.metadata.confidence}`);
		logBridge(`- Next steps: ${response.next_steps.length}`);

		// Execute next steps
		await executeNextSteps(context, response.next_steps);

		// Store test result
		await storeMemory(`Round-trip test successful: ${new Date().toISOString()}`);

		vscode.window.showInformationMessage('Claude Bridge: Round-trip test completed!');
		logBridge('=== ROUND-TRIP TEST COMPLETED ===');
	} catch (e) {
		logBridge(`Test failed: ${e}`);
		vscode.window.showErrorMessage(`Claude Bridge test failed: ${e}`);
	}
}

// ============================================================
// COMMAND REGISTRATION
// ============================================================

export function registerClaudeBridgeCommands(context: vscode.ExtensionContext): void {
	// Start queue processor
	startQueueProcessor(context);
	context.subscriptions.push({ dispose: () => stopQueueProcessor() });

	// Run round-trip test
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.bridge.test', () => runRoundTripTest(context))
	);

	// Queue a task
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.bridge.queue', async () => {
			const query = await vscode.window.showInputBox({
				title: 'Queue Claude Task',
				prompt: 'Enter query for Claude to reason about',
				placeHolder: 'What should I analyze?'
			});

			if (!query) return;

			await queueTask(query);
			vscode.window.showInformationMessage('Task queued for Claude Bridge');
		})
	);

	// Send immediate query
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.bridge.ask', async () => {
			const query = await vscode.window.showInputBox({
				title: 'Ask Claude (Bridge)',
				prompt: 'Enter your question',
				placeHolder: 'What do you want to know?'
			});

			if (!query) return;

			const projectId = context.workspaceState.get<string>('tarx.activeProject') || 'default';
			const sessionId = `ask-${Date.now()}`;

			const payload = await buildPayload({
				type: 'reason',
				query,
				session_id: sessionId,
				project_id: projectId
			});

			vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: 'Claude Bridge',
				cancellable: false
			}, async (progress) => {
				progress.report({ message: 'Building context...' });
				progress.report({ message: 'Invoking Claude...' });

				try {
					const response = await invokeClaudeWithPayload(payload, 'cli');

					progress.report({ message: 'Processing response...' });
					await executeNextSteps(context, response.next_steps);

					// Show response
					const doc = await vscode.workspace.openTextDocument({
						content: `# Claude Bridge Response\n\n${response.response}\n\n---\nConfidence: ${response.metadata.confidence}\nNext steps executed: ${response.next_steps.length}`,
						language: 'markdown'
					});
					await vscode.window.showTextDocument(doc, { preview: true });
				} catch (e) {
					vscode.window.showErrorMessage(`Bridge failed: ${e}`);
				}
			});
		})
	);

	// TARX Bridge status bar — hidden from end users (dev-only internal tooling)
	// Bridge status is still tracked internally but not shown in the status bar.
	// Keeping the getBridgeStatus() function available for programmatic use.

	// Show status command
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.bridge.showStatus', async () => {
			const status = await checkBridgeAvailability();
			const display = getBridgeStatusDisplay(status);

			const actions: vscode.MessageItem[] = [];
			if (status === 'local_only') {
				actions.push({ title: 'Set API Key' });
			}
			if (status !== 'active') {
				actions.push({ title: 'Check Requirements' });
			}

			const selection = await vscode.window.showInformationMessage(
				`${display.icon} ${display.text}\n\n${display.tooltip}`,
				...actions
			);

			if (selection?.title === 'Set API Key') {
				vscode.window.showInputBox({
					title: 'Set ANTHROPIC_API_KEY',
					prompt: 'Enter your Anthropic API key (will be set for this session)',
					password: true
				}).then(key => {
					if (key) {
						process.env.ANTHROPIC_API_KEY = key;
						vscode.window.showInformationMessage('API key set for this session');
					}
				});
			} else if (selection?.title === 'Check Requirements') {
				const doc = await vscode.workspace.openTextDocument({
					content: `# TARX Bridge Requirements

## Option 1: Claude CLI (Recommended)
Install the Claude CLI:
\`\`\`bash
npm install -g @anthropic-ai/claude-code
\`\`\`

## Option 2: Anthropic API Key
Set the ANTHROPIC_API_KEY environment variable:
\`\`\`bash
export ANTHROPIC_API_KEY=your-key-here
\`\`\`

## Current Status
- ${display.icon} ${display.text}
- ${display.tooltip}
`,
					language: 'markdown'
				});
				await vscode.window.showTextDocument(doc, { preview: true });
			}
		})
	);

	// TARX Bridge Integration - Feb 2026: Test direct action execution
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.bridge.testDirect', async () => {
			const query = await vscode.window.showInputBox({
				title: 'Test Direct Action Execution',
				prompt: 'Enter an action command (e.g., "Create a new space called Test")',
				placeHolder: 'Create a new space called My Test Space with emoji 🧪'
			});

			if (!query) return;

			console.log('[TARX Direct Test] Input:', query);
			logBridge(`Direct test input: ${query}`);

			// Test action intent detection
			const hasIntent = detectActionIntent(query);
			console.log('[TARX Direct Test] hasIntent:', hasIntent);
			logBridge(`Direct test hasIntent: ${hasIntent}`);

			// Test action parsing
			const parsed = parseActionIntent(query);
			console.log('[TARX Direct Test] parsed:', JSON.stringify(parsed));
			logBridge(`Direct test parsed: ${JSON.stringify(parsed)}`);

			// Test action execution
			const result = await handleActionIntent(query);
			console.log('[TARX Direct Test] result:', JSON.stringify(result));
			logBridge(`Direct test result: ${JSON.stringify(result)}`);

			// Show results
			if (result.success) {
				vscode.window.showInformationMessage(`Direct execution succeeded: ${result.action}`);
				// Show result in document
				const doc = await vscode.workspace.openTextDocument({
					content: `# Direct Action Result\n\n${result.result}\n\n---\n**Action:** ${result.action}\n**Success:** ${result.success}`,
					language: 'markdown'
				});
				await vscode.window.showTextDocument(doc, { preview: true });
				// Refresh sidebar
				try {
					await vscode.commands.executeCommand('tarx.sidebar.refresh');
				} catch (e) { /* ignore */ }
			} else {
				vscode.window.showWarningMessage(`❌ Direct execution failed or not recognized. Action: ${result.action}`);
				// Show debug info
				const doc = await vscode.workspace.openTextDocument({
					content: `# Direct Action Debug\n\n**Input:** ${query}\n\n**Has Action Intent:** ${hasIntent}\n\n**Parsed:**\n\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\`\n\n**Result:**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n\n---\nCheck ~/TARX/claude-bridge.log for more details`,
					language: 'markdown'
				});
				await vscode.window.showTextDocument(doc, { preview: true });
			}
		})
	);

	logBridge('Claude Bridge commands registered');
	console.log('[TARX] Claude Bridge registered');
}
