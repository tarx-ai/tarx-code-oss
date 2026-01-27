/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Agent Integration Module
 *
 * Exposes TARX conversational AI features to VS Code's native agent framework.
 * This module bridges the gap between TARX-specific features and the native agent.
 */

import {
	TARX_SYSTEM_PROMPT,
	buildTarxSystemPrompt,
	isVagueRequest,
	getClarificationForVagueRequest,
	normalizeTranscription
} from './systemPrompt';

import {
	analyzeCode,
	analyzeUserCode,
	formatIssuesForResponse,
	CodeIssue
} from './codeAnalysis';

import { DatabaseOperations, ConversationTurn } from './database';

/**
 * Get the TARX system prompt for native agent
 */
export function getTarxSystemPrompt(options?: {
	projectContext?: string;
	fileContext?: string;
	conversationSummary?: string;
}): string {
	return buildTarxSystemPrompt(options);
}

/**
 * Get the base TARX system prompt
 */
export function getBaseSystemPrompt(): string {
	return TARX_SYSTEM_PROMPT;
}

/**
 * Process a user message through TARX conversational AI features
 * Returns structured data for native agent to use
 */
export interface TarxProcessResult {
	normalizedMessage: string;
	isVague: boolean;
	clarificationPrompt?: string;
	codeIssues: CodeIssue[];
	issuesNote: string | null;
	history?: ConversationTurn[];
}

export async function processTarxMessage(
	userMessage: string,
	db?: DatabaseOperations,
	projectId?: string | null
): Promise<TarxProcessResult> {
	// Normalize transcription (handles voice input)
	const normalizedMessage = normalizeTranscription(userMessage);

	// Check for vague requests
	const isVague = isVagueRequest(normalizedMessage);
	const clarificationPrompt = isVague
		? getClarificationForVagueRequest(normalizedMessage)
		: undefined;

	// Analyze code in the message
	const codeIssues = analyzeUserCode(normalizedMessage);
	const issuesNote = formatIssuesForResponse(codeIssues);

	// Load conversation history if database is available
	let history: ConversationTurn[] | undefined;
	if (db && projectId !== undefined) {
		try {
			history = await db.getRecentTurns(projectId, 10);
		} catch (e) {
			console.warn('[TARX Agent] Failed to load conversation history:', e);
		}
	}

	return {
		normalizedMessage,
		isVague,
		clarificationPrompt,
		codeIssues,
		issuesNote,
		history
	};
}

/**
 * Analyze code for issues (exposed for direct use)
 */
export function analyzeCodeForIssues(code: string, language?: string): CodeIssue[] {
	return analyzeCode(code, language);
}

/**
 * Check if a message is too vague (exposed for direct use)
 */
export function checkVagueMessage(message: string): {
	isVague: boolean;
	clarification?: string;
} {
	const normalized = normalizeTranscription(message);
	const isVague = isVagueRequest(normalized);
	return {
		isVague,
		clarification: isVague ? getClarificationForVagueRequest(normalized) : undefined
	};
}

/**
 * Normalize voice input (exposed for direct use)
 */
export function normalizeVoiceInput(text: string): string {
	return normalizeTranscription(text);
}
