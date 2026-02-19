/*---------------------------------------------------------------------------------------------
 *  ChatGPT → TARX Import Pipeline
 *
 *  Orchestrates the full import: parse ZIP → create space → store sessions/messages →
 *  chunk and embed into RAG → return summary.
 *
 *  "Bring your brain with you" — imports a user's entire ChatGPT history into TARX's
 *  local knowledge base so it's immediately searchable and referenceable.
 *--------------------------------------------------------------------------------------------*/

import { parseChatGPTExport, ChatGPTConversation, ChatGPTMessage } from './chatgpt-importer.js';
import {
	createMCPSpace,
	createMCPSession,
	addMCPMessage,
	generateMCPEmbedding,
	storeMCPKnowledgeChunk,
	flushMCPDatabase
} from '../mcpKnowledge.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ImportOptions {
	/** Embed conversation content into RAG (default: true) */
	embedContent?: boolean;
	/** Preserve original ChatGPT timestamps (default: true) */
	preserveTimestamps?: boolean;
	/** Limit number of conversations for testing (default: all) */
	maxConversations?: number;
	/** Progress callback: (percent 0-100, status message) */
	onProgress?: (pct: number, status: string) => void;
}

export interface ImportResult {
	totalConversations: number;
	totalMessages: number;
	totalChunks: number;
	skippedConversations: number;
	spaceId: string;
	spaceName: string;
	topTopics: string[];
	importTimeMs: number;
	userEmail?: string;
}

// ============================================================================
// CHUNKING (mirrors tarx-core/database.ts parameters)
// ============================================================================

const CHUNK_SIZE = 512;
const CHUNK_OVERLAP = 128;

interface TextChunk {
	content: string;
	index: number;
}

function chunkText(text: string): TextChunk[] {
	const chunks: TextChunk[] = [];
	const lines = text.split('\n');
	let currentChunk = '';
	let chunkIndex = 0;

	for (const line of lines) {
		const lineWithNewline = line + '\n';

		if (currentChunk.length + lineWithNewline.length > CHUNK_SIZE && currentChunk.length > 0) {
			chunks.push({ content: currentChunk.trim(), index: chunkIndex++ });
			const overlapStart = Math.max(0, currentChunk.length - CHUNK_OVERLAP);
			currentChunk = currentChunk.slice(overlapStart) + lineWithNewline;
		} else {
			currentChunk += lineWithNewline;
		}
	}

	if (currentChunk.trim().length > 0) {
		chunks.push({ content: currentChunk.trim(), index: chunkIndex });
	}

	return chunks;
}

// ============================================================================
// IMPORT PIPELINE
// ============================================================================

/**
 * Import a ChatGPT export ZIP into TARX.
 *
 * Pipeline:
 *   1. Parse ZIP → extract conversations
 *   2. Create a "ChatGPT Import" space
 *   3. For each conversation: create session, store messages
 *   4. Chunk all content and embed into RAG (knowledge_embeddings)
 *   5. Flush database and return summary
 */
export async function importChatGPTToTARX(
	zipPath: string,
	options: ImportOptions = {}
): Promise<ImportResult> {
	const startTime = Date.now();
	const {
		embedContent = true,
		preserveTimestamps = true,
		maxConversations,
		onProgress
	} = options;

	// Phase 1: Parse
	onProgress?.(2, 'Parsing ChatGPT export...');
	const exportResult = parseChatGPTExport(zipPath);
	let { conversations } = exportResult;
	const skippedConversations = exportResult.totalRawConversations - conversations.length;

	if (conversations.length === 0) {
		throw new Error('No conversations found in export. The ZIP may be empty or in an unexpected format.');
	}

	onProgress?.(8, `Found ${conversations.length} conversations`);

	if (maxConversations && maxConversations < conversations.length) {
		conversations = conversations.slice(0, maxConversations);
	}

	// Sort by creation date (oldest first — preserves chronological order)
	conversations.sort((a, b) => a.created.getTime() - b.created.getTime());

	// Phase 2: Create import space
	onProgress?.(10, 'Creating import space...');
	const spaceName = 'ChatGPT Import';
	const space = await createMCPSpace(spaceName, 'Imported from ChatGPT export — your conversation history, searchable in TARX', '📥');
	if (!space) {
		throw new Error('Failed to create import space — database may be unavailable');
	}

	// Phase 3: Import conversations as sessions with messages
	let totalMessages = 0;
	let totalChunks = 0;

	for (let i = 0; i < conversations.length; i++) {
		const conv = conversations[i];
		const pct = 10 + (75 * (i / conversations.length));
		const shortTitle = conv.title.length > 50 ? conv.title.slice(0, 47) + '...' : conv.title;
		onProgress?.(pct, `Importing: "${shortTitle}" (${i + 1}/${conversations.length})`);

		// Create session for this conversation
		const session = await createMCPSession(space.id, conv.title);
		if (!session) {
			console.error(`[TARX Import] Failed to create session for: ${conv.title}`);
			continue;
		}

		// Store messages
		for (const msg of conv.messages) {
			// Map 'tool' role to 'system' since our schema only supports user/assistant/system
			const role = msg.role === 'tool' ? 'system' : msg.role;
			const timestamp = preserveTimestamps && msg.timestamp > 0
				? Math.floor(msg.timestamp * 1000) // ChatGPT uses Unix seconds
				: Date.now();

			await addMCPMessage(session.id, role, msg.content, timestamp, msg.model);
			totalMessages++;
		}

		// Embed conversation content into RAG
		if (embedContent) {
			const chunks = await embedConversation(space.id, conv);
			totalChunks += chunks;
		}
	}

	// Phase 4: Flush all writes and generate summary
	onProgress?.(90, 'Saving to database...');
	flushMCPDatabase();

	onProgress?.(95, 'Generating summary...');
	const topTopics = extractTopTopics(conversations);

	const result: ImportResult = {
		totalConversations: conversations.length,
		totalMessages,
		totalChunks,
		skippedConversations,
		spaceId: space.id,
		spaceName,
		topTopics,
		importTimeMs: Date.now() - startTime,
		userEmail: exportResult.user?.email
	};

	onProgress?.(100, 'Import complete!');

	console.log(`[TARX Import] Complete: ${result.totalConversations} conversations, ${result.totalMessages} messages, ${result.totalChunks} RAG chunks in ${(result.importTimeMs / 1000).toFixed(1)}s`);

	return result;
}

// ============================================================================
// EMBEDDING
// ============================================================================

/**
 * Chunk and embed a single conversation into RAG.
 * Combines all messages into a document with role labels,
 * chunks it, and stores each chunk as a knowledge embedding.
 */
async function embedConversation(spaceId: string, conv: ChatGPTConversation): Promise<number> {
	// Build document text with role labels for context
	const fullText = conv.messages
		.filter(m => m.role === 'user' || m.role === 'assistant')
		.map(m => `[${m.role}]: ${m.content}`)
		.join('\n\n');

	if (fullText.length < 50) {
		return 0; // Skip very short conversations
	}

	const chunks = chunkText(fullText);
	let embedded = 0;

	for (const chunk of chunks) {
		const embedding = await generateMCPEmbedding(`search_document: ${chunk.content}`);
		if (embedding) {
			const title = `ChatGPT: "${conv.title}" [${chunk.index + 1}/${chunks.length}]`;
			const sourceId = `chatgpt-${conv.id}`;

			const stored = await storeMCPKnowledgeChunk(
				spaceId,
				sourceId,
				title,
				chunk.content,
				embedding,
				'file' // Use 'file' source_type for compatibility with existing RAG search
			);

			if (stored) {
				embedded++;
			}
		}
	}

	return embedded;
}

// ============================================================================
// TOPIC EXTRACTION
// ============================================================================

/** Common words to skip in topic extraction */
const STOP_WORDS = new Set([
	'about', 'after', 'again', 'being', 'between', 'could', 'does', 'doing',
	'during', 'every', 'first', 'from', 'going', 'have', 'help', 'here',
	'ideas', 'into', 'just', 'know', 'like', 'make', 'more', 'much',
	'need', 'only', 'other', 'over', 'should', 'some', 'than', 'that',
	'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those',
	'through', 'under', 'very', 'want', 'what', 'when', 'where', 'which',
	'while', 'will', 'with', 'would', 'your', 'best', 'good', 'list',
	'many', 'most', 'part', 'some', 'text', 'time', 'used', 'using',
	'ways', 'work', 'based', 'create', 'different', 'write', 'question',
	'answer', 'conversation', 'untitled', 'chatgpt', 'chat'
]);

/**
 * Extract top topics from conversation titles.
 * Simple frequency analysis — good enough for a summary card.
 */
function extractTopTopics(conversations: ChatGPTConversation[]): string[] {
	const freq: Record<string, number> = {};

	for (const conv of conversations) {
		const words = conv.title
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, '')
			.split(/\s+/)
			.filter(w => w.length > 3 && !STOP_WORDS.has(w));

		// Deduplicate within a single title
		const unique = new Set(words);
		for (const word of unique) {
			freq[word] = (freq[word] || 0) + 1;
		}
	}

	return Object.entries(freq)
		.filter(([, count]) => count >= 2) // Appear in at least 2 conversations
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10)
		.map(([word]) => word);
}
