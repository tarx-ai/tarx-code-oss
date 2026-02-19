/*---------------------------------------------------------------------------------------------
 *  ChatGPT Export Parser
 *
 *  Parses a ChatGPT data export ZIP file (from Settings > Data Controls > Export Data).
 *  Extracts conversations.json and walks the mapping tree to produce linear message history.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import AdmZip from 'adm-zip';

// ============================================================================
// TYPES
// ============================================================================

export interface ChatGPTMessage {
	role: 'user' | 'assistant' | 'system' | 'tool';
	content: string;
	timestamp: number;
	model?: string;
}

export interface ChatGPTConversation {
	title: string;
	messages: ChatGPTMessage[];
	created: Date;
	updated: Date;
	id: string;
}

export interface ChatGPTUserInfo {
	email?: string;
	name?: string;
}

export interface ChatGPTExportResult {
	conversations: ChatGPTConversation[];
	user?: ChatGPTUserInfo;
	totalRawConversations: number;
}

// ============================================================================
// RAW CHATGPT EXPORT TYPES (internal)
// ============================================================================

interface RawMapping {
	[nodeId: string]: {
		id: string;
		message: {
			id: string;
			author: {
				role: 'user' | 'assistant' | 'system' | 'tool';
				name: string | null;
				metadata: Record<string, unknown>;
			};
			create_time: number | null;
			content: {
				content_type: string;
				parts: unknown[];
			};
			metadata?: {
				model_slug?: string;
				finish_details?: { type: string };
			};
		} | null;
		parent: string | null;
		children: string[];
	};
}

interface RawConversation {
	title: string;
	create_time: number | null;
	update_time: number | null;
	mapping: RawMapping;
	conversation_id: string;
}

// ============================================================================
// PARSER
// ============================================================================

/**
 * Parse a ChatGPT export ZIP file into structured conversations.
 *
 * The export contains conversations.json with a tree-structured mapping
 * (ChatGPT supports branching conversations). We follow the first child
 * at each node to produce a linear message sequence.
 */
export function parseChatGPTExport(zipPath: string): ChatGPTExportResult {
	if (!fs.existsSync(zipPath)) {
		throw new Error(`Export file not found: ${zipPath}`);
	}

	const zip = new AdmZip(zipPath);

	// Extract conversations.json
	const conversationsEntry = zip.getEntry('conversations.json');
	if (!conversationsEntry) {
		throw new Error('No conversations.json found in export ZIP. Is this a ChatGPT export?');
	}

	const rawData = conversationsEntry.getData().toString('utf-8');
	let raw: RawConversation[];
	try {
		raw = JSON.parse(rawData);
	} catch {
		throw new Error('Failed to parse conversations.json — file may be corrupted');
	}

	if (!Array.isArray(raw)) {
		throw new Error('conversations.json is not an array — unexpected format');
	}

	// Extract user info if available
	let user: ChatGPTUserInfo | undefined;
	const userEntry = zip.getEntry('user.json');
	if (userEntry) {
		try {
			const userData = JSON.parse(userEntry.getData().toString('utf-8'));
			user = {
				email: userData.email,
				name: userData.name || userData.chatgpt_plus_user
			};
		} catch {
			// user.json is optional, ignore parse errors
		}
	}

	const totalRawConversations = raw.length;
	const conversations: ChatGPTConversation[] = [];

	for (const conv of raw) {
		const parsed = parseConversation(conv);
		if (parsed) {
			conversations.push(parsed);
		}
	}

	return { conversations, user, totalRawConversations };
}

/**
 * Parse a single conversation from the raw export format.
 * Returns null if the conversation has no usable messages.
 */
function parseConversation(conv: RawConversation): ChatGPTConversation | null {
	if (!conv.mapping || typeof conv.mapping !== 'object') {
		return null;
	}

	const messages: ChatGPTMessage[] = [];
	const visited = new Set<string>();

	function walkTree(nodeId: string): void {
		if (visited.has(nodeId)) {
			return;
		}
		visited.add(nodeId);

		const node = conv.mapping[nodeId];
		if (!node) {
			return;
		}

		// Extract message content if present
		if (node.message?.content?.parts) {
			const text = node.message.content.parts
				.filter((p): p is string => typeof p === 'string')
				.join('\n');

			if (text.trim()) {
				messages.push({
					role: node.message.author.role,
					content: text,
					timestamp: node.message.create_time || 0,
					model: node.message.metadata?.model_slug
				});
			}
		}

		// Follow children — take first branch for linear history
		if (node.children && node.children.length > 0) {
			walkTree(node.children[0]);
		}
	}

	// Find root node (no parent)
	const rootId = Object.keys(conv.mapping).find(id => !conv.mapping[id].parent);
	if (rootId) {
		walkTree(rootId);
	}

	if (messages.length === 0) {
		return null;
	}

	return {
		title: conv.title || 'Untitled',
		messages,
		created: new Date((conv.create_time || 0) * 1000),
		updated: new Date((conv.update_time || 0) * 1000),
		id: conv.conversation_id
	};
}
