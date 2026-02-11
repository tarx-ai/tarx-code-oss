/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { withRetry, showTarxError } from './errorHandler.js';

/**
 * Extended model information for TARX models
 * Adds server URL, model type, and health status to the base LanguageModelChatInformation
 */
interface TarxModelInfo extends vscode.LanguageModelChatInformation {
	readonly serverUrl: string;
	readonly modelType: 'local' | 'mesh';
	readonly isHealthy: boolean;
}

/**
 * Health status for a TARX model endpoint
 */
interface ModelHealth {
	healthy: boolean;
	latency?: number;
	error?: string;
}

/**
 * Language Model Provider for TARX Local and Mesh inference
 *
 * Registers two model providers:
 * 1. tarx-local: Qwen 8.2B on localhost:11435
 * 2. tarx-mesh: Distributed inference on localhost:11436
 */
export class TarxModelProvider implements vscode.LanguageModelChatProvider<TarxModelInfo> {

	private readonly _onDidChange = new vscode.EventEmitter<void>();
	readonly onDidChangeLanguageModelChatInformation = this._onDidChange.event;

	private localServerUrl: string;
	private meshServerUrl: string;
	private localHealth: ModelHealth = { healthy: false };
	private meshHealth: ModelHealth = { healthy: false };
	private healthCheckInterval?: NodeJS.Timeout;

	constructor(
		localServerUrl: string = 'http://localhost:11435',
		meshServerUrl: string = 'http://localhost:11436'
	) {
		this.localServerUrl = localServerUrl;
		this.meshServerUrl = meshServerUrl;
	}

	/**
	 * Start background health checks every 30 seconds
	 */
	startHealthChecks(): void {
		// Initial check
		this.checkAllHealth();

		// Schedule periodic checks
		this.healthCheckInterval = setInterval(() => {
			this.checkAllHealth();
		}, 30000);
	}

	/**
	 * Stop health checks
	 */
	stopHealthChecks(): void {
		if (this.healthCheckInterval) {
			clearInterval(this.healthCheckInterval);
			this.healthCheckInterval = undefined;
		}
	}

	/**
	 * Check health of all model endpoints
	 */
	private async checkAllHealth(): Promise<void> {
		// Use withRetry for health checks to handle transient failures
		const [localHealth, meshHealth] = await Promise.all([
			withRetry(() => this.checkHealth(this.localServerUrl), 1, 1000),
			withRetry(() => this.checkHealth(this.meshServerUrl), 1, 1000)
		]);

		const previousLocalHealth = this.localHealth.healthy;
		const previousMeshHealth = this.meshHealth.healthy;

		this.localHealth = localHealth;
		this.meshHealth = meshHealth;

		// If health status changed, notify VS Code to refresh model list
		if (previousLocalHealth !== localHealth.healthy || previousMeshHealth !== meshHealth.healthy) {
			console.log('[TARX Models] Health status changed - Local:', localHealth.healthy, 'Mesh:', meshHealth.healthy);
			this._onDidChange.fire();
		}
	}

	/**
	 * Check health of a single endpoint
	 */
	private async checkHealth(serverUrl: string): Promise<ModelHealth> {
		const startTime = Date.now();
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 5000);

			const response = await fetch(`${serverUrl}/health`, {
				signal: controller.signal
			});

			clearTimeout(timeout);
			const latency = Date.now() - startTime;

			if (response.ok) {
				return { healthy: true, latency };
			} else {
				return { healthy: false, error: `HTTP ${response.status}` };
			}
		} catch (error) {
			return {
				healthy: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	async provideLanguageModelChatInformation(
		_options: vscode.PrepareLanguageModelChatModelOptions,
		_token: vscode.CancellationToken
	): Promise<TarxModelInfo[]> {
		const models: TarxModelInfo[] = [];

		// Always register both models, but mark availability
		// Local model
		models.push({
			id: 'qwen-8.2b',
			name: 'TARX Local (Qwen 8.2B)',
			family: 'qwen',
			version: '8.2',
			detail: this.localHealth.healthy
				? `${this.localHealth.latency}ms`
				: '⚠️ Offline',
			tooltip: this.localHealth.healthy
				? `Local Qwen 8.2B inference on ${this.localServerUrl}\nLatency: ${this.localHealth.latency}ms`
				: `Local inference server unavailable\n${this.localHealth.error || 'Check that llama-server is running on port 11435'}`,
			maxInputTokens: 8192,
			maxOutputTokens: 4096,
			capabilities: {
				imageInput: false,
				toolCalling: false
			},
			serverUrl: this.localServerUrl,
			modelType: 'local',
			isHealthy: this.localHealth.healthy
		} as TarxModelInfo);

		// Mesh model
		models.push({
			id: 'mesh-network',
			name: 'TARX Mesh Network',
			family: 'distributed',
			version: '1.0',
			detail: this.meshHealth.healthy
				? `${this.meshHealth.latency}ms`
				: '⚠️ Offline',
			tooltip: this.meshHealth.healthy
				? `Distributed mesh inference on ${this.meshServerUrl}\nLatency: ${this.meshHealth.latency}ms`
				: `Mesh network unavailable\n${this.meshHealth.error || 'Check that mesh server is running on port 11436'}`,
			maxInputTokens: 16384,
			maxOutputTokens: 8192,
			capabilities: {
				imageInput: false,
				toolCalling: false
			},
			serverUrl: this.meshServerUrl,
			modelType: 'mesh',
			isHealthy: this.meshHealth.healthy
		} as TarxModelInfo);

		return models;
	}

	async provideLanguageModelChatResponse(
		model: TarxModelInfo,
		messages: readonly vscode.LanguageModelChatRequestMessage[],
		options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken
	): Promise<void> {
		// Check if model is healthy before making request
		if (!model.isHealthy) {
			throw new Error(`${model.name} is currently unavailable. Please check that the server is running.`);
		}

		const requestStart = Date.now();
		let firstTokenTime: number | null = null;
		let totalTokens = 0;

		// Convert VS Code messages to OpenAI format
		const chatMessages = messages.map(msg => ({
			role: msg.role === vscode.LanguageModelChatMessageRole.User ? 'user' as const :
				msg.role === vscode.LanguageModelChatMessageRole.Assistant ? 'assistant' as const : 'system' as const,
			content: this.extractTextContent(msg.content as ReadonlyArray<vscode.LanguageModelInputPart>)
		}));

		try {
			// Choose endpoint based on model type
			const endpoint = model.modelType === 'local'
				? `${model.serverUrl}/v1/chat/completions`
				: `${model.serverUrl}/mesh/query`;

			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: chatMessages,
					temperature: options.modelOptions?.temperature ?? 0.7,
					max_tokens: options.modelOptions?.maxTokens ?? 2048,
					stream: true
				}),
				signal: token.isCancellationRequested ? AbortSignal.abort() : undefined
			});

			if (!response.ok) {
				throw new Error(`${model.name} request failed: ${response.status} ${response.statusText}`);
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

							// Support both reasoning_content and content
							const reasoningContent = delta?.reasoning_content;
							const regularContent = delta?.content;

							if (reasoningContent) {
								// Track first token
								if (firstTokenTime === null) {
									firstTokenTime = Date.now();
									console.log(`[TARX ${model.modelType}] TTFT: ${firstTokenTime - requestStart}ms`);
								}
								totalTokens++;

								// Report thinking/reasoning tokens
								progress.report(new vscode.LanguageModelTextPart(reasoningContent));
							}

							if (regularContent) {
								// Track first token
								if (firstTokenTime === null) {
									firstTokenTime = Date.now();
									console.log(`[TARX ${model.modelType}] TTFT: ${firstTokenTime - requestStart}ms`);
								}
								totalTokens++;

								// Report regular content tokens
								progress.report(new vscode.LanguageModelTextPart(regularContent));
							}
						} catch (parseError) {
							// Ignore parse errors for malformed SSE events
						}
					}
				}
			}

			// Log completion metrics
			const totalTime = Date.now() - requestStart;
			const ttft = firstTokenTime ? firstTokenTime - requestStart : null;
			console.log(`[TARX ${model.modelType}] Response complete: ${totalTime}ms total, ${ttft ?? 'N/A'}ms TTFT, ${totalTokens} tokens`);

		} catch (error) {
			const errorTime = Date.now() - requestStart;
			console.log(`[TARX ${model.modelType}] Response error after ${errorTime}ms:`, error);

			if (token.isCancellationRequested) {
				return;
			}

			// Mark model as unhealthy if request fails
			if (model.modelType === 'local') {
				this.localHealth = { healthy: false, error: error instanceof Error ? error.message : 'Request failed' };
			} else {
				this.meshHealth = { healthy: false, error: error instanceof Error ? error.message : 'Request failed' };
			}
			this._onDidChange.fire();

			// Show user-friendly error message
			await showTarxError(error);

			throw error;
		}
	}

	async provideTokenCount(
		_model: TarxModelInfo,
		text: string | vscode.LanguageModelChatRequestMessage,
		_token: vscode.CancellationToken
	): Promise<number> {
		// Simple approximation: ~4 chars per token (standard for most LLMs)
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

	/**
	 * Get current health status for status bar display
	 */
	getHealthStatus(): { local: ModelHealth; mesh: ModelHealth } {
		return {
			local: this.localHealth,
			mesh: this.meshHealth
		};
	}

	dispose(): void {
		this.stopHealthChecks();
		this._onDidChange.dispose();
	}
}
