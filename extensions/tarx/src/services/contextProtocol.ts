/*---------------------------------------------------------------------------------------------
 *  TARX Context Protocol — Phase 1 Foundation
 *
 *  Three-tier context hierarchy: Identity → Knowledge → Conversation
 *  Adaptive budgeting across compute paths: Local → Mesh → Cloud
 *
 *  Implements: Tier 1 Identity, Adaptive Budget, Sliding Window Summarization,
 *  Retrieval Gating, Observation Storage, Graceful Degradation, Temperature Selection
 *--------------------------------------------------------------------------------------------*/

import { execSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { TarxClient, ChatMessage } from '../tarxClient';
import { RagClient } from '../ragClient';
import { searchMCPKnowledge, storeMCPEmbeddings } from '../mcpKnowledge';

// DB path — same as main TARX database
const DB_PATH = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');

const CHARS_PER_TOKEN = 4;

// ============================================================================
// Interfaces
// ============================================================================

export type ComputePath = 'local' | 'mesh' | 'cloud';
export type QueryType = 'factual' | 'precise' | 'balanced' | 'creative' | 'pushback';

export interface UserIdentity {
	userId: string;
	name?: string;
	role?: string;
	goals?: string[];
	preferences: {
		pushbackLevel: number;       // 1-5
		verbosity: 'concise' | 'balanced' | 'detailed';
		style: 'direct' | 'supportive' | 'socratic';
	};
	hardware?: {
		cpu: string;
		ram: number;
		gpu: string;
	};
	createdAt: number;
	updatedAt: number;
}

export interface ContextBudget {
	tier1: number;    // tokens for identity
	tier2: number;    // tokens for RAG
	tier3: number;    // tokens for conversation history
	response: number; // tokens for model response
	total: number;    // detected context window
}

export interface SamplingParams {
	temperature: number;
	top_p: number;
	top_k: number;
}

export interface Observation {
	type: 'preference' | 'correction' | 'goal' | 'fact' | 'pattern' | 'style';
	content: string;
	confidence: number;
}

export interface RetrievedChunk {
	content: string;
	filePath: string;
	similarity: number;
}

// ============================================================================
// Schema
// ============================================================================

const IDENTITY_SCHEMA = `
CREATE TABLE IF NOT EXISTS user_identity (
    user_id TEXT PRIMARY KEY,
    name TEXT,
    role TEXT,
    goals TEXT DEFAULT '[]',
    pushback_level INTEGER DEFAULT 3,
    verbosity TEXT DEFAULT 'balanced',
    style TEXT DEFAULT 'direct',
    hardware_cpu TEXT,
    hardware_ram INTEGER,
    hardware_gpu TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
`;

// ============================================================================
// Context Protocol
// ============================================================================

/** Row shape from sqlite3 -json for user_identity table */
interface IdentityRow {
	user_id: string;
	name: string | null;
	role: string | null;
	goals: string;
	pushback_level: number;
	verbosity: string;
	style: string;
	hardware_cpu: string | null;
	hardware_ram: number | null;
	hardware_gpu: string | null;
	created_at: number;
	updated_at: number;
}

export class ContextProtocol {
	private tarxClient: TarxClient;
	private ragClient: RagClient;
	private identity: UserIdentity | null = null;
	private contextWindow: number = 4096;
	private tier2Available: boolean = true;
	private tier2RetryTimer: ReturnType<typeof setTimeout> | null = null;
	private schemaReady: boolean = false;

	constructor(tarxClient: TarxClient, ragClient: RagClient) {
		this.tarxClient = tarxClient;
		this.ragClient = ragClient;
	}

	// ==============================
	// Initialization
	// ==============================

	async init(): Promise<void> {
		this.ensureSchema();
		await this.loadIdentity();
		await this.detectContextWindow();
		console.log('[TARX Context] Protocol initialized');
	}

	getIdentity(): UserIdentity | null {
		return this.identity;
	}

	getContextWindow(): number {
		return this.contextWindow;
	}

	// ==============================
	// Task 1: Tier 1 — Identity
	// ==============================

	async loadIdentity(): Promise<UserIdentity> {
		this.ensureSchema();

		const rows = this.queryJSON<IdentityRow>('SELECT * FROM user_identity LIMIT 1;');

		if (rows.length > 0) {
			const row = rows[0];
			this.identity = {
				userId: row.user_id,
				name: row.name || undefined,
				role: row.role || undefined,
				goals: this.safeParseJSON<string[]>(row.goals, []),
				preferences: {
					pushbackLevel: row.pushback_level,
					verbosity: (row.verbosity as UserIdentity['preferences']['verbosity']) || 'balanced',
					style: (row.style as UserIdentity['preferences']['style']) || 'direct',
				},
				hardware: row.hardware_cpu ? {
					cpu: row.hardware_cpu,
					ram: row.hardware_ram || 0,
					gpu: row.hardware_gpu || 'none',
				} : undefined,
				createdAt: row.created_at,
				updatedAt: row.updated_at,
			};
			console.log(`[TARX Context] Identity loaded: ${this.identity.userId}`);
			return this.identity;
		}

		// First run — create default identity with hardware detection
		const now = Date.now();
		const userId = this.generateId();
		const cpus = os.cpus();
		const cpu = cpus.length > 0 ? cpus[0].model : 'unknown';
		const ram = Math.round(os.totalmem() / (1024 * 1024 * 1024)); // GB

		let gpu = 'none';
		try {
			const gpuInfo = execSync(
				'system_profiler SPDisplaysDataType 2>/dev/null | head -20',
				{ encoding: 'utf8', timeout: 3000 }
			);
			const match = gpuInfo.match(/Chipset Model:\s*(.+)/);
			if (match) {
				gpu = match[1].trim();
			}
		} catch {
			// GPU detection failed — not critical
		}

		this.identity = {
			userId,
			preferences: {
				pushbackLevel: 3,
				verbosity: 'balanced',
				style: 'direct',
			},
			hardware: { cpu, ram, gpu },
			createdAt: now,
			updatedAt: now,
		};

		const escapedCpu = cpu.replace(/'/g, "''");
		const escapedGpu = gpu.replace(/'/g, "''");

		this.execSQL(`
			INSERT INTO user_identity (user_id, goals, pushback_level, verbosity, style, hardware_cpu, hardware_ram, hardware_gpu, created_at, updated_at)
			VALUES ('${userId}', '[]', 3, 'balanced', 'direct', '${escapedCpu}', ${ram}, '${escapedGpu}', ${now}, ${now});
		`);

		console.log(`[TARX Context] Default identity created: ${userId} (${cpu}, ${ram}GB RAM, ${gpu})`);
		return this.identity;
	}

	async updateIdentity(partial: Partial<UserIdentity>): Promise<void> {
		if (!this.identity) {
			await this.loadIdentity();
		}
		if (!this.identity) {
			return;
		}

		// Merge updates
		if (partial.name !== undefined) {
			this.identity.name = partial.name;
		}
		if (partial.role !== undefined) {
			this.identity.role = partial.role;
		}
		if (partial.goals !== undefined) {
			this.identity.goals = partial.goals;
		}
		if (partial.preferences) {
			Object.assign(this.identity.preferences, partial.preferences);
		}
		if (partial.hardware) {
			this.identity.hardware = { ...this.identity.hardware, ...partial.hardware } as UserIdentity['hardware'];
		}
		this.identity.updatedAt = Date.now();

		// Write back to SQLite
		const id = this.identity.userId.replace(/'/g, "''");
		const name = this.identity.name ? `'${this.identity.name.replace(/'/g, "''")}'` : 'NULL';
		const role = this.identity.role ? `'${this.identity.role.replace(/'/g, "''")}'` : 'NULL';
		const goals = JSON.stringify(this.identity.goals || []).replace(/'/g, "''");

		this.execSQL(`
			UPDATE user_identity SET
				name = ${name},
				role = ${role},
				goals = '${goals}',
				pushback_level = ${this.identity.preferences.pushbackLevel},
				verbosity = '${this.identity.preferences.verbosity}',
				style = '${this.identity.preferences.style}',
				updated_at = ${this.identity.updatedAt}
			WHERE user_id = '${id}';
		`);
	}

	compressIdentity(): string {
		if (!this.identity) {
			return 'User profile not loaded.';
		}
		const parts: string[] = [];
		if (this.identity.name) {
			parts.push(`User: ${this.identity.name}`);
		}
		if (this.identity.role) {
			parts.push(this.identity.role);
		}
		if (this.identity.goals?.length) {
			parts.push(`Goals: ${this.identity.goals.join(', ')}`);
		}
		parts.push(`Style: ${this.identity.preferences.style}, pushback ${this.identity.preferences.pushbackLevel}/5`);
		return parts.join('. ') + '.';
	}

	getIdentityTokenBudget(computePath: ComputePath): number {
		switch (computePath) {
			case 'local': return 1000;  // Rich — free compute
			case 'mesh': return 200;    // Compressed
			case 'cloud': return 200;   // Lean
		}
	}

	// ==============================
	// Task 2: Adaptive Budget
	// ==============================

	async detectContextWindow(): Promise<number> {
		// Try /v1/models endpoint (OpenAI-compatible)
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 3000);
			const response = await fetch('http://localhost:11435/v1/models', {
				signal: controller.signal
			});
			clearTimeout(timeoutId);

			if (response.ok) {
				const data = await response.json() as {
					data?: Array<{ context_length?: number; id?: string }>;
				};
				const ctxLen = data.data?.[0]?.context_length;
				if (ctxLen && ctxLen > 0) {
					this.contextWindow = ctxLen;
					console.log(`[TARX Context] Detected context window: ${ctxLen}`);
					return ctxLen;
				}
			}
		} catch {
			// Fall through
		}

		// Try /props endpoint (llama.cpp specific)
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 3000);
			const response = await fetch('http://localhost:11435/props', {
				signal: controller.signal
			});
			clearTimeout(timeoutId);

			if (response.ok) {
				const data = await response.json() as {
					default_generation_settings?: { n_ctx_train?: number };
				};
				const nCtx = data.default_generation_settings?.n_ctx_train;
				if (nCtx && nCtx > 0) {
					this.contextWindow = nCtx;
					console.log(`[TARX Context] Detected context window from /props: ${nCtx}`);
					return nCtx;
				}
			}
		} catch {
			// Fall through
		}

		console.log(`[TARX Context] Using default context window: ${this.contextWindow}`);
		return this.contextWindow;
	}

	calculateBudget(computePath: ComputePath, contextWindow?: number): ContextBudget {
		const total = contextWindow || this.contextWindow;

		switch (computePath) {
			case 'local': {
				// Generous splits — free compute
				if (total <= 4096) {
					return { tier1: 1000, tier2: 800, tier3: 1200, response: 1096, total };
				}
				// Larger context models — scale proportionally
				const tier1 = Math.min(1500, Math.round(total * 0.05));
				const response = Math.round(total * 0.33);
				const tier2 = Math.round(total * 0.12);
				const tier3 = total - tier1 - tier2 - response;
				return { tier1, tier2, tier3, response, total };
			}
			case 'mesh':
				return { tier1: 200, tier2: 400, tier3: 600, response: 800, total: 2000 };
			case 'cloud':
				return { tier1: 200, tier2: 400, tier3: 400, response: 1000, total: 2000 };
		}
	}

	// ==============================
	// Task 3: Sliding Window with Summarization
	// ==============================

	async buildConversationContext(
		messages: ChatMessage[],
		budget: number
	): Promise<{ messages: ChatMessage[]; summary?: string }> {
		// Filter to user/assistant messages only (no system)
		const history = messages.filter(m => m.role !== 'system');

		if (history.length === 0) {
			return { messages: [] };
		}

		const totalTokens = history.reduce(
			(sum, m) => sum + this.estimateTokens(m.content), 0
		);

		// Under budget — return all
		if (totalTokens <= budget) {
			return { messages: history };
		}

		// Over budget — summarize oldest, keep most recent 3 turns (6 messages max)
		const keepCount = Math.min(6, history.length);
		const recentMessages = history.slice(-keepCount);
		const olderMessages = history.slice(0, -keepCount);

		if (olderMessages.length === 0) {
			// All messages are "recent" — truncate to fit
			return this.truncateToFit(history, budget);
		}

		// Calculate how much budget is left after recent messages
		const recentTokens = recentMessages.reduce(
			(sum, m) => sum + this.estimateTokens(m.content), 0
		);
		const summaryBudget = budget - recentTokens;

		if (summaryBudget < 50) {
			// Not enough room for any summary — just return recent
			return this.truncateToFit(recentMessages, budget);
		}

		try {
			const summary = await this.summarizeOlderTurns(
				olderMessages,
				Math.min(summaryBudget, 100)
			);
			return { messages: recentMessages, summary };
		} catch (e) {
			console.warn('[TARX Context] Summarization failed, truncating:', e);
			return this.truncateToFit(recentMessages, budget);
		}
	}

	private async summarizeOlderTurns(
		messages: ChatMessage[],
		targetTokens: number
	): Promise<string> {
		const conversationText = messages
			.map(m => `${m.role === 'user' ? 'User' : 'TARX'}: ${m.content}`)
			.join('\n');

		const response = await this.tarxClient.chatCompletion([
			{
				role: 'system',
				content: `Compress the following conversation into a brief summary. Preserve: key decisions, user preferences, task state, unresolved questions. Drop: pleasantries, repeated information, exploratory tangents. Target: under ${targetTokens} tokens. Reply with ONLY the summary.`
			},
			{
				role: 'user',
				content: conversationText
			}
		], {
			temperature: 0.1,
			maxTokens: Math.max(64, targetTokens * 2)
		});

		return response.choices?.[0]?.message?.content?.trim() || '';
	}

	private truncateToFit(
		messages: ChatMessage[],
		budget: number
	): { messages: ChatMessage[] } {
		const result: ChatMessage[] = [];
		let usedTokens = 0;

		// Add from most recent backwards
		for (let i = messages.length - 1; i >= 0; i--) {
			const tokens = this.estimateTokens(messages[i].content);
			if (usedTokens + tokens > budget) {
				break;
			}
			result.unshift(messages[i]);
			usedTokens += tokens;
		}

		return { messages: result };
	}

	// ==============================
	// Task 4: Retrieval Gating
	// ==============================

	gateRetrievedChunks(chunks: RetrievedChunk[], budget: number): RetrievedChunk[] {
		if (chunks.length === 0) {
			return [];
		}

		// Sort by similarity descending
		const sorted = [...chunks].sort((a, b) => b.similarity - a.similarity);
		const bestScore = sorted[0].similarity;

		// RULE 1: Drop chunks below absolute threshold (0.5)
		let gated = sorted.filter(c => c.similarity >= 0.5);
		if (gated.length === 0) {
			return [];
		}

		// RULE 2: Drop chunks below 60% of best score (diminishing returns)
		const threshold = bestScore * 0.6;
		gated = gated.filter(c => c.similarity >= threshold);

		// RULE 4: Diversity — if top 3 are all from same file, swap slot 3
		if (gated.length >= 3) {
			const topFile = gated[0].filePath;
			if (gated[1].filePath === topFile && gated[2].filePath === topFile) {
				const differentFileIdx = gated.findIndex(
					(c, i) => i >= 3 && c.filePath !== topFile
				);
				if (differentFileIdx !== -1) {
					const swap = gated[differentFileIdx];
					gated.splice(differentFileIdx, 1);
					gated.splice(2, 0, swap);
				}
			}
		}

		// RULE 3: Enforce token budget — drop lowest-scoring if over
		const result: RetrievedChunk[] = [];
		let usedTokens = 0;

		for (const chunk of gated) {
			const tokens = this.estimateTokens(chunk.content);
			if (usedTokens + tokens > budget) {
				break;
			}
			result.push(chunk);
			usedTokens += tokens;
		}

		return result;
	}

	// ==============================
	// Task 6: Observation Storage
	// ==============================

	async extractObservations(messages: ChatMessage[]): Promise<Observation[]> {
		const observations: Observation[] = [];

		for (const msg of messages) {
			if (msg.role !== 'user') {
				continue;
			}

			// PREFERENCE patterns
			if (/\bi\s+prefer\b|\bi\s+like\b|\bdon'?t\s+(?:like|want)\b|\bplease\s+(?:always|never)\b/i.test(msg.content)) {
				observations.push({
					type: 'preference',
					content: msg.content.slice(0, 200),
					confidence: 0.7,
				});
			}

			// CORRECTION patterns
			if (/\bactually\s+it'?s\b|\bno,?\s+i\s+meant\b|\bthat'?s\s+(?:not|wrong)\b|\bi\s+meant\b/i.test(msg.content)) {
				observations.push({
					type: 'correction',
					content: msg.content.slice(0, 200),
					confidence: 0.9,
				});
			}

			// GOAL patterns
			if (/\bi'?m\s+(?:working|trying)\s+(?:on|to)\b|\bmy\s+goal\s+is\b|\bi\s+(?:want|need)\s+to\b/i.test(msg.content)) {
				observations.push({
					type: 'goal',
					content: msg.content.slice(0, 200),
					confidence: 0.6,
				});
			}

			// FACT patterns
			if (/\bi'?m\s+a\b|\bi\s+work\s+(?:at|for|in)\b|\bmy\s+(?:company|team|project)\b/i.test(msg.content)) {
				observations.push({
					type: 'fact',
					content: msg.content.slice(0, 200),
					confidence: 0.8,
				});
			}
		}

		return observations;
	}

	async storeObservation(observation: Observation): Promise<void> {
		try {
			// Embed the observation text
			const embedding = await this.ragClient.embed(
				`[${observation.type.toUpperCase()}] ${observation.content}`
			);

			// Check for duplicate/similar existing observations
			const existing = await searchMCPKnowledge(
				'__observations__',
				embedding,
				3
			);

			// If similarity > 0.85, this is a duplicate — skip
			const duplicate = existing.find(e => e.similarity > 0.85);
			if (duplicate) {
				console.log(`[TARX Context] Skipping duplicate observation (sim=${duplicate.similarity.toFixed(2)})`);
				return;
			}

			await storeMCPEmbeddings(
				'__observations__',
				`[${observation.type}] ${observation.content.slice(0, 50)}`,
				[{ content: observation.content, index: 0 }],
				[embedding]
			);

			console.log(`[TARX Context] Stored observation: ${observation.type}`);
		} catch (e) {
			console.warn('[TARX Context] Failed to store observation:', e);
		}
	}

	// ==============================
	// Task 7: Graceful Degradation
	// ==============================

	async safeTier2Load(queryText: string, spaceId?: string): Promise<RetrievedChunk[]> {
		if (!this.tier2Available) {
			return [];
		}

		try {
			const embedding = await this.ragClient.embed(queryText);
			const results = await searchMCPKnowledge(
				spaceId || null,
				embedding,
				10
			);

			return results.map(r => ({
				content: r.content,
				filePath: r.title,
				similarity: r.similarity,
			}));
		} catch (e) {
			console.warn('[TARX Context] Tier 2 load failed, disabling temporarily:', e);
			this.tier2Available = false;

			// Retry in 30 seconds
			if (this.tier2RetryTimer) {
				clearTimeout(this.tier2RetryTimer);
			}
			this.tier2RetryTimer = setTimeout(() => {
				this.tier2Available = true;
				console.log('[TARX Context] Tier 2 re-enabled for retry');
			}, 30_000);

			return [];
		}
	}

	async safeSummarize(
		messages: ChatMessage[],
		budget: number
	): Promise<{ messages: ChatMessage[]; summary?: string }> {
		try {
			return await this.buildConversationContext(messages, budget);
		} catch (e) {
			console.warn('[TARX Context] Summarization failed, hard-truncating:', e);
			return this.truncateToFit(
				messages.filter(m => m.role !== 'system'),
				budget
			);
		}
	}

	// ==============================
	// Task 8: Temperature Selection
	// ==============================

	selectSamplingParams(queryType: QueryType): SamplingParams {
		switch (queryType) {
			case 'factual':  return { temperature: 0.1, top_p: 0.9, top_k: 40 };
			case 'precise':  return { temperature: 0.2, top_p: 0.9, top_k: 40 };
			case 'balanced': return { temperature: 0.4, top_p: 0.95, top_k: 50 };
			case 'creative': return { temperature: 0.7, top_p: 0.95, top_k: 60 };
			case 'pushback': return { temperature: 0.3, top_p: 0.9, top_k: 40 };
		}
	}

	classifyQueryType(message: string, hasRagContext: boolean): QueryType {
		const lower = message.toLowerCase();

		// Factual: references uploaded content + RAG context exists
		if (hasRagContext && /\b(?:what|where|when|who|how much|how many|find|look up|search)\b/.test(lower)) {
			return 'factual';
		}

		// Precise: asks for code or structured output
		if (/\b(?:write|code|function|class|implement|create a|generate|json|sql|api|endpoint|regex|script)\b/.test(lower)) {
			return 'precise';
		}

		// Creative: open-ended exploration
		if (/\b(?:what if|brainstorm|ideas?|suggest|imagine|creative|explore|possibilities)\b/.test(lower)) {
			return 'creative';
		}

		return 'balanced';
	}

	// ==============================
	// Helpers
	// ==============================

	estimateTokens(text: string): number {
		return Math.ceil(text.length / CHARS_PER_TOKEN);
	}

	private ensureSchema(): void {
		if (this.schemaReady) {
			return;
		}
		try {
			this.execSQL(IDENTITY_SCHEMA);
			this.schemaReady = true;
		} catch (e) {
			console.error('[TARX Context] Schema creation failed:', e);
		}
	}

	private execSQL(sql: string): void {
		execSync(`sqlite3 "${DB_PATH}"`, { encoding: 'utf8', input: sql });
	}

	private queryJSON<T>(sql: string): T[] {
		try {
			const result = execSync(`sqlite3 "${DB_PATH}" -json`, {
				encoding: 'utf8',
				input: sql
			});
			return result.trim() ? JSON.parse(result) : [];
		} catch {
			return [];
		}
	}

	private safeParseJSON<T>(json: string | null | undefined, fallback: T): T {
		if (!json) {
			return fallback;
		}
		try {
			return JSON.parse(json) as T;
		} catch {
			return fallback;
		}
	}

	private generateId(): string {
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
			const r = Math.random() * 16 | 0;
			const v = c === 'x' ? r : (r & 0x3 | 0x8);
			return v.toString(16);
		});
	}

	dispose(): void {
		if (this.tier2RetryTimer) {
			clearTimeout(this.tier2RetryTimer);
			this.tier2RetryTimer = null;
		}
	}
}
