/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TarxClient } from './tarxClient';

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

	constructor(serverUrl: string = 'http://localhost:11435') {
		this.serverUrl = serverUrl;
		this.client = new TarxClient(serverUrl);
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
		// Convert VS Code messages to our format
		const chatMessages = messages.map(msg => ({
			role: msg.role === vscode.LanguageModelChatMessageRole.User ? 'user' as const :
				msg.role === vscode.LanguageModelChatMessageRole.Assistant ? 'assistant' as const : 'system' as const,
			content: this.extractTextContent(msg.content as ReadonlyArray<vscode.LanguageModelInputPart>)
		}));

		try {
			const response = await fetch(`${model.serverUrl}/v1/chat/completions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'local',
					messages: chatMessages,
					temperature: 0.7,
					max_tokens: 2048,
					stream: true
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
						if (data === '[DONE]') return;

						try {
							const parsed = JSON.parse(data);
							const delta = parsed.choices?.[0]?.delta;
							const content = delta?.content || delta?.reasoning_content;
							if (content) {
								progress.report(new vscode.LanguageModelTextPart(content));
							}
						} catch {
							// Ignore parse errors
						}
					}
				}
			}
		} catch (error) {
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
