/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ChatMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
}

export interface ChatCompletionResponse {
	id: string;
	choices: {
		message: ChatMessage;
		finish_reason: string;
	}[];
}

export interface CompletionResponse {
	choices: {
		text: string;
		finish_reason: string;
	}[];
}

export interface HealthResponse {
	status: string;
	model?: string;
}

/**
 * HTTP client for communicating with TARX llama-server
 * Default port: 11435
 */
export class TarxClient {
	private serverUrl: string;

	constructor(serverUrl: string = 'http://localhost:11435') {
		this.serverUrl = serverUrl;
	}

	setServerUrl(url: string): void {
		this.serverUrl = url;
	}

	/**
	 * Check if llama-server is healthy
	 */
	async checkHealth(): Promise<{ healthy: boolean; latencyMs: number; model?: string }> {
		const start = Date.now();
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 3000);

			const response = await fetch(`${this.serverUrl}/health`, {
				signal: controller.signal
			});

			clearTimeout(timeoutId);
			const latencyMs = Date.now() - start;

			if (response.ok) {
				try {
					const data = await response.json() as HealthResponse;
					return { healthy: true, latencyMs, model: data.model || 'llama-server' };
				} catch {
					return { healthy: true, latencyMs, model: 'llama-server' };
				}
			}
			return { healthy: false, latencyMs };
		} catch {
			return { healthy: false, latencyMs: Date.now() - start };
		}
	}

	/**
	 * Send a chat completion request
	 */
	async chatCompletion(
		messages: ChatMessage[],
		options: {
			model?: string;
			temperature?: number;
			maxTokens?: number;
			stream?: boolean;
		} = {}
	): Promise<ChatCompletionResponse> {
		const response = await fetch(`${this.serverUrl}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: options.model || 'local',
				messages,
				temperature: options.temperature ?? 0.7,
				max_tokens: options.maxTokens ?? 2048,
				stream: options.stream ?? false
			})
		});

		if (!response.ok) {
			throw new Error(`Chat completion failed: ${response.status} ${response.statusText}`);
		}

		return response.json() as Promise<ChatCompletionResponse>;
	}

	/**
	 * Send a chat completion request with streaming
	 */
	async *chatCompletionStream(
		messages: ChatMessage[],
		options: {
			model?: string;
			temperature?: number;
			maxTokens?: number;
		} = {}
	): AsyncGenerator<string, void, unknown> {
		const response = await fetch(`${this.serverUrl}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: options.model || 'local',
				messages,
				temperature: options.temperature ?? 0.7,
				max_tokens: options.maxTokens ?? 2048,
				stream: true
			})
		});

		if (!response.ok) {
			throw new Error(`Chat completion failed: ${response.status} ${response.statusText}`);
		}

		const reader = response.body?.getReader();
		if (!reader) {
			throw new Error('No response body');
		}

		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
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
						// Handle both standard content and reasoning_content (for QwQ/reasoning models)
						const content = delta?.content || delta?.reasoning_content;
						if (content) {
							yield content;
						}
					} catch {
						// Ignore parse errors
					}
				}
			}
		}
	}

	/**
	 * Send a completion request (for code completions)
	 */
	async completion(
		prompt: string,
		options: {
			suffix?: string;
			maxTokens?: number;
			temperature?: number;
			stop?: string[];
		} = {}
	): Promise<string> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 5000);

		try {
			const response = await fetch(`${this.serverUrl}/v1/completions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					prompt,
					suffix: options.suffix,
					max_tokens: options.maxTokens ?? 128,
					temperature: options.temperature ?? 0.2,
					stop: options.stop ?? ['\n\n', '```']
				}),
				signal: controller.signal
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				throw new Error(`Completion failed: ${response.status}`);
			}

			const data = await response.json() as CompletionResponse;
			return data.choices?.[0]?.text || '';
		} catch (error) {
			clearTimeout(timeoutId);
			throw error;
		}
	}
}
