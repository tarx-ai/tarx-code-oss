/*---------------------------------------------------------------------------------------------
 *  TARX Prompt Builder — Context Protocol Phase 1
 *
 *  Assembles the final prompt from all three tiers:
 *  [System + Tier 1 Identity] [Tier 2 RAG] [Tier 3 Conversation] [Current Message]
 *--------------------------------------------------------------------------------------------*/

import { UserIdentity, RetrievedChunk } from './contextProtocol';
import { ChatMessage } from '../tarxClient';
import { TARX_SYSTEM_PROMPT_V2 } from '../systemPrompt';

export interface PromptOptions {
	identity: UserIdentity;
	ragChunks: RetrievedChunk[];
	conversationContext: { messages: ChatMessage[]; summary?: string };
	currentMessage: string;
	projectContext?: string;
}

/**
 * Build a complete prompt from all three context tiers.
 *
 * Returns a ChatMessage[] array ready for llama-server:
 *   [system] → Persona + Identity + Project + RAG + Summary
 *   [...history] → Conversation turns from Tier 3
 *   [user] → Current user message
 */
export function buildProtocolPrompt(options: PromptOptions): ChatMessage[] {
	const messages: ChatMessage[] = [];

	// ===============================
	// System Message: Persona + Tier 1 Identity
	// ===============================
	let systemContent = TARX_SYSTEM_PROMPT_V2;

	// Inject user identity (Tier 1)
	const { identity } = options;
	const identityParts: string[] = [];

	if (identity.name) {
		identityParts.push(`Name: ${identity.name}`);
	}
	if (identity.role) {
		identityParts.push(`Role: ${identity.role}`);
	}
	if (identity.goals?.length) {
		identityParts.push(`Goals: ${identity.goals.join(', ')}`);
	}
	identityParts.push(
		`Communication: ${identity.preferences.style}, ${identity.preferences.verbosity}`
	);
	identityParts.push(
		`Pushback level: ${identity.preferences.pushbackLevel}/5`
	);
	if (identity.hardware) {
		identityParts.push(
			`Hardware: ${identity.hardware.cpu}, ${identity.hardware.ram}GB RAM, ${identity.hardware.gpu}`
		);
	}

	if (identityParts.length > 0) {
		systemContent += `\n\n## USER PROFILE\n${identityParts.join('\n')}`;
	}

	// Inject project context
	if (options.projectContext) {
		systemContent += `\n\n## PROJECT CONTEXT\n${options.projectContext}`;
	}

	// Inject Tier 2: RAG chunks
	if (options.ragChunks.length > 0) {
		systemContent += '\n\n<relevant_context>';
		for (const chunk of options.ragChunks) {
			systemContent += `\n[File: ${chunk.filePath}]\n${chunk.content}\n`;
		}
		systemContent += '</relevant_context>';
	}

	// Inject conversation summary (from Tier 3 summarization)
	if (options.conversationContext.summary) {
		systemContent += `\n\n## CONVERSATION SUMMARY\n${options.conversationContext.summary}`;
	}

	messages.push({ role: 'system', content: systemContent });

	// ===============================
	// Tier 3: Conversation History
	// ===============================
	for (const msg of options.conversationContext.messages) {
		if (msg.role !== 'system') {
			messages.push(msg);
		}
	}

	// ===============================
	// Current User Message
	// ===============================
	messages.push({ role: 'user', content: options.currentMessage });

	return messages;
}
