/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TarxClient } from './tarxClient';
// TARX System Prompt v2 — Three-Layer Persona
import { TARX_SYSTEM_PROMPT_V2 } from './systemPrompt';
// Context window management for history injection
import { fitToContextWindow, type Message } from './contextWindow';
// Database access for conversation history
import type { DatabaseOperations, ConversationTurn } from './database';
// Thinking Tokens Integration - Feb 2026
import { mapQwenToThinking, ThinkingAccumulator, type QwenStreamChunk } from './thinkingMapper';
// Telemetry — report every inference to tarx.com/api/telemetry
import { reportInference } from './services/telemetryReporter';

interface TarxLanguageModelInfo extends vscode.LanguageModelChatInformation {
	readonly serverUrl: string;
}

/**
 * Language Model Provider for TARX local llama-server
 */
export class TarxLanguageModelProvider implements vscode.LanguageModelChatProvider<TarxLanguageModelInfo> {

	private readonly _onDidChange = new vscode.EventEmitter<void>();
	readonly onDidChangeLanguageModelChatInformation = this._onDidChange.event;

	private readonly client: TarxClient;
	private serverUrl: string;

	// Conversation history injection — v2
	private db?: DatabaseOperations;
	private activeConversationId?: string;
	private static readonly MAX_HISTORY_TURNS = 10;

	constructor(serverUrl: string = 'http://localhost:11435') {
		this.serverUrl = serverUrl;
		this.client = new TarxClient(serverUrl);
	}

	/** Wire the database for conversation history persistence */
	setDatabase(db: DatabaseOperations): void {
		this.db = db;
	}

	/** Set the active conversation ID for history loading/saving */
	setActiveConversation(conversationId: string | undefined): void {
		this.activeConversationId = conversationId;
	}

	async provideLanguageModelChatInformation(
		_options: vscode.PrepareLanguageModelChatModelOptions,
		_token: vscode.CancellationToken
	): Promise<TarxLanguageModelInfo[]> {
		// Check if server is available
		const health = await this.client.checkHealth();
		if (!health.healthy) {
			console.log('[TARX LM] Server not available, returning empty model list');
			return [];
		}

		const config = vscode.workspace.getConfiguration('tarx');
		this.serverUrl = config.get<string>('serverUrl', 'http://localhost:11435');

		return [{
			name: 'TARX Local',
			id: 'tarx-local',
			family: 'llama',
			version: '1.0',
			maxInputTokens: 8192,
			maxOutputTokens: 4096,
			capabilities: {
				imageInput: false,
				toolCalling: false
			},
			serverUrl: this.serverUrl
		}];
	}

	async provideLanguageModelChatResponse(
		model: TarxLanguageModelInfo,
		messages: readonly vscode.LanguageModelChatRequestMessage[],
		_options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken
	): Promise<void> {
		// QA Timing: Track response timing
		const requestStart = Date.now();
		let firstTokenTime: number | null = null;
		let totalTokens = 0;

		// Convert VS Code messages to our format
		const chatMessages = messages.map(msg => ({
			role: msg.role === vscode.LanguageModelChatMessageRole.User ? 'user' as const :
				msg.role === vscode.LanguageModelChatMessageRole.Assistant ? 'assistant' as const : 'system' as const,
			content: this.extractTextContent(msg.content as ReadonlyArray<vscode.LanguageModelInputPart>)
		}));

		// System Prompt v2: Ensure three-layer persona prompt is present
		const hasSystemMessage = chatMessages.some(m => m.role === 'system');
		if (!hasSystemMessage) {
			chatMessages.unshift({ role: 'system', content: TARX_SYSTEM_PROMPT_V2 });
		}

		// Conversation history injection — load from DB if VS Code didn't provide history
		const hasExistingHistory = chatMessages.some(m => m.role === 'assistant');
		if (!hasExistingHistory && this.db && this.activeConversationId) {
			try {
				const turns = await this.db.getConversationTurns(this.activeConversationId);
				const recentTurns = turns.slice(-TarxLanguageModelProvider.MAX_HISTORY_TURNS);
				if (recentTurns.length > 0) {
					// Insert history after system prompt, before current user message
					const userMessage = chatMessages.pop()!;
					for (const turn of recentTurns) {
						if (turn.role !== 'system') {
							chatMessages.push({ role: turn.role as 'user' | 'assistant', content: turn.content });
						}
					}
					chatMessages.push(userMessage);
					console.log(`[TARX LM] Injected ${recentTurns.length} history turns from DB`);
				}
			} catch (e) {
				console.warn('[TARX LM] Failed to load conversation history:', e);
			}
		}

		try {
			// Detect if this is a conversational query vs a code generation request
			const lastUserMsg = chatMessages.filter(m => m.role === 'user').pop()?.content || '';
			const isCodeRequest = /\b(write|code|implement|fix this|show me how|function|class|component|refactor|create a)\b/i.test(lastUserMsg)
				|| /```/.test(lastUserMsg);
			const maxTokens = isCodeRequest ? 2048 : 512;

			// Context window management — fit messages within 4096 token limit
			const fitted = fitToContextWindow(chatMessages as Message[], 4096, maxTokens);
			if (fitted.length < chatMessages.length) {
				console.log(`[TARX LM] Context window: truncated ${chatMessages.length} → ${fitted.length} messages`);
			}
			// Use fitted messages for the API call
			const apiMessages = fitted.map(m => ({ role: m.role, content: m.content }));

			const response = await fetch(`${model.serverUrl}/v1/chat/completions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: apiMessages,
					temperature: 0.7,
					max_tokens: maxTokens,
					stream: true,
					repeat_penalty: 1.15,
					presence_penalty: 0.3,
					frequency_penalty: 0.1,
					// Block code fences for conversational queries — force plain text
					stop: isCodeRequest ? undefined : ['```javascript', '```typescript', '```python', '```js', '```ts', '```\n']
				})
			});

			if (!response.ok) {
				throw new Error(`Request failed: ${response.status} ${response.statusText}`);
			}

			const reader = response.body?.getReader();
			if (!reader) {
				throw new Error('No response body');
			}

			const decoder = new TextDecoder();
			let buffer = '';
			let fullResponse = ''; // Accumulate for DB persistence
			const thinkingAcc = new ThinkingAccumulator();
			let thinkingEmitted = false;

			while (true) {
				if (token.isCancellationRequested) {
					reader.cancel();
					break;
				}

				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = line.slice(6);
						if (data === '[DONE]') {
							// Emit accumulated thinking at the end if we have it
							const thinking = thinkingAcc.getThinking();
							if (thinking && !thinkingEmitted) {
								console.log(`[TARX Thinking] Final: ${thinking.substring(0, 100)}...`);
								// Emit thinking as metadata in a comment-style text part
								progress.report(new vscode.LanguageModelTextPart(
									`\n<!-- Thinking Process:\n${thinking}\n-->\n\n`
								));
							}
							return;
						}

						try {
							const parsed = JSON.parse(data) as QwenStreamChunk;
							const mapped = thinkingAcc.feed(parsed);

							// QA Timing: Track first token
							if (firstTokenTime === null && (mapped.thinking || mapped.content)) {
								firstTokenTime = Date.now();
								console.log(`[TARX QA] TTFT: ${firstTokenTime - requestStart}ms`);
							}

							// Log thinking tokens for debugging
							if (mapped.thinking) {
								totalTokens++;
								console.log(`[TARX Thinking] ${mapped.thinking.content.substring(0, 50)}...`);

								// Emit thinking inline if enabled
								const config = vscode.workspace.getConfiguration('tarx');
								if (config.get<boolean>('thinking.enabled', true)) {
									if (!thinkingEmitted) {
										// First thinking token - emit header
										progress.report(new vscode.LanguageModelTextPart('\n**Thinking:**\n```\n'));
										thinkingEmitted = true;
									}
									progress.report(new vscode.LanguageModelTextPart(mapped.thinking.content));
								}
							}

							// Emit regular content after thinking
							if (mapped.content) {
								// Close thinking block if we were emitting it
								if (thinkingEmitted) {
									progress.report(new vscode.LanguageModelTextPart('\n```\n\n**Answer:**\n'));
									thinkingEmitted = false; // Only close once
								}
								totalTokens++;
								fullResponse += mapped.content;
								progress.report(new vscode.LanguageModelTextPart(mapped.content));
							}
						} catch (error) {
							// Ignore parse errors
							console.log(`[TARX] Parse error: ${error}`);
						}
					}
				}
			}
			// QA Timing: Log response completion
			const totalTime = Date.now() - requestStart;
			const ttft = firstTokenTime ? firstTokenTime - requestStart : null;
			console.log(`[TARX QA] Response complete: ${totalTime}ms total, ${ttft ?? 'N/A'}ms TTFT, ${totalTokens} tokens`);

			// Telemetry: report inference metrics to tarx.com/api/telemetry
			const promptTokens = Math.ceil(apiMessages.reduce((a, m) => a + m.content.length, 0) / 4);
			reportInference({
				inference_mode: 'local',
				tokens_in: promptTokens,
				tokens_out: totalTokens,
				ttft_ms: ttft ?? 0,
				duration_ms: totalTime,
				model: 'tarx-local',
			});

			// Save conversation turns to DB for history persistence
			if (this.db && this.activeConversationId && fullResponse.length > 0) {
				try {
					await this.db.addConversationTurn({
						conversationId: this.activeConversationId,
						role: 'user',
						content: lastUserMsg,
						fileRefs: [],
						artifacts: null
					});
					await this.db.addConversationTurn({
						conversationId: this.activeConversationId,
						role: 'assistant',
						content: fullResponse,
						fileRefs: [],
						artifacts: null
					});
					console.log(`[TARX LM] Saved exchange to conversation ${this.activeConversationId}`);
				} catch (e) {
					console.warn('[TARX LM] Failed to save conversation turns:', e);
				}
			}
		} catch (error) {
			// QA Timing: Log error timing
			const errorTime = Date.now() - requestStart;
			console.log(`[TARX QA] Response error after ${errorTime}ms`);
			if (token.isCancellationRequested) {
				return;
			}
			throw error;
		}
	}

	async provideTokenCount(
		_model: TarxLanguageModelInfo,
		text: string | vscode.LanguageModelChatRequestMessage,
		_token: vscode.CancellationToken
	): Promise<number> {
		// Simple approximation: ~4 chars per token
		const content = typeof text === 'string'
			? text
			: this.extractTextContent(text.content as ReadonlyArray<vscode.LanguageModelInputPart>);
		return Math.ceil(content.length / 4);
	}

	private extractTextContent(content: ReadonlyArray<vscode.LanguageModelInputPart>): string {
		return content
			.filter((part): part is vscode.LanguageModelTextPart => part instanceof vscode.LanguageModelTextPart)
			.map(part => part.value)
			.join('');
	}

	notifyModelChange(): void {
		this._onDidChange.fire();
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}
