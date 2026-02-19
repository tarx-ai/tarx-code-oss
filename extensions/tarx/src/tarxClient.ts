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

/**
 * Structured stream chunk for chat completions.
 * Separates thinking tokens from content for proper UI rendering.
 */
export interface StreamChunk {
	type: 'thinking' | 'content';
	content: string;
}

export interface HealthResponse {
	status: string;
	model?: string;
}

/** Sanitize model path to a user-friendly display name (never expose raw file paths) */
function sanitizeModelName(raw?: string): string {
	if (!raw) { return 'Local AI'; }
	// If it's a file path (contains / or \), extract just the filename
	if (raw.includes('/') || raw.includes('\\')) {
		const basename = raw.split(/[/\\]/).pop() || raw;
		// Model blobs are like "sha256-2bada8a..." — show "Local Model"
		if (basename.startsWith('sha256-')) { return 'Local Model'; }
		// GGUF files: strip extension, e.g. "qwen2.5-coder-7b-q4.gguf" → "qwen2.5-coder-7b-q4"
		return basename.replace(/\.gguf$/i, '');
	}
	return raw;
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
		const healthUrl = `${this.serverUrl}/health`;
		console.log(`[TARX Client] Health check: ${healthUrl}`);

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 3000);

			const response = await fetch(healthUrl, {
				signal: controller.signal
			});

			clearTimeout(timeoutId);
			const latencyMs = Date.now() - start;

			console.log(`[TARX Client] Health response: ${response.status} (${latencyMs}ms)`);

			if (response.ok) {
				try {
					const data = await response.json() as HealthResponse;
					console.log(`[TARX Client] Health OK: ${JSON.stringify(data)}`);
					return { healthy: true, latencyMs, model: sanitizeModelName(data.model) };
				} catch {
					return { healthy: true, latencyMs, model: 'llama-server' };
				}
			}
			console.log(`[TARX Client] Health failed: status ${response.status}`);
			return { healthy: false, latencyMs };
		} catch (error) {
			const latencyMs = Date.now() - start;
			console.log(`[TARX Client] Health error: ${error instanceof Error ? error.message : 'unknown'}`);
			return { healthy: false, latencyMs };
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
		try {
			const response = await fetch(`${this.serverUrl}/v1/chat/completions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages,
					temperature: options.temperature ?? 0.7,
					max_tokens: options.maxTokens ?? 2048,
					stream: options.stream ?? false,
					repeat_penalty: 1.15,
					presence_penalty: 0.3,
					frequency_penalty: 0.1
				})
			});

			if (!response.ok) {
				if (response.status === 503) {
					throw new Error('TARX is busy processing another request. Please wait and try again.');
				}
				throw new Error(`TARX inference failed: ${response.status} ${response.statusText}`);
			}

			return response.json() as Promise<ChatCompletionResponse>;
		} catch (error: any) {
			// Provide user-friendly error messages
			if (error.cause?.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
				throw new Error('TARX Desktop is not running. Please start TARX Desktop first.');
			}
			if (error.name === 'AbortError' || error.message?.includes('timeout')) {
				throw new Error('TARX request timed out. The model may be overloaded.');
			}
			throw error;
		}
	}

	/**
	 * Send a chat completion request with streaming.
	 * Yields structured chunks that separate thinking from content.
	 *
	 * @param options.signal - Optional AbortSignal for cancellation (e.g., from VS Code CancellationToken)
	 * @param options.timeoutMs - Stream inactivity timeout in ms (default: 120000 = 2 minutes)
	 */
	async *chatCompletionStream(
		messages: ChatMessage[],
		options: {
			model?: string;
			temperature?: number;
			maxTokens?: number;
			signal?: AbortSignal;
			timeoutMs?: number;
		} = {}
	): AsyncGenerator<StreamChunk, void, unknown> {
		const streamTimeout = options.timeoutMs ?? 120_000; // 2 minute default
		const controller = new AbortController();

		// Wire external abort signal (e.g., VS Code cancellation token) to our controller
		if (options.signal) {
			if (options.signal.aborted) {
				controller.abort();
			} else {
				options.signal.addEventListener('abort', () => controller.abort(), { once: true });
			}
		}

		let response: Response;
		try {
			response = await fetch(`${this.serverUrl}/v1/chat/completions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages,
					temperature: options.temperature ?? 0.7,
					max_tokens: options.maxTokens ?? 2048,
					stream: true,
					repeat_penalty: 1.15,
					presence_penalty: 0.3,
					frequency_penalty: 0.1
				}),
				signal: controller.signal
			});
		} catch (error: any) {
			if (error.name === 'AbortError') {
				return; // Canceled — exit cleanly
			}
			if (error.cause?.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
				throw new Error('TARX Desktop is not running. Please start TARX Desktop first.');
			}
			throw error;
		}

		if (!response.ok) {
			if (response.status === 503) {
				throw new Error('TARX is busy processing another request. Please wait and try again.');
			}
			throw new Error(`TARX inference failed: ${response.status} ${response.statusText}`);
		}

		const reader = response.body?.getReader();
		if (!reader) {
			throw new Error('No response body');
		}

		const decoder = new TextDecoder();
		let buffer = '';
		let lastChunkTime = Date.now();

		try {
			while (true) {
				// Check for stream inactivity timeout (Bug #2 fix: prevents spinner from getting stuck)
				const timeSinceLastChunk = Date.now() - lastChunkTime;
				if (timeSinceLastChunk > streamTimeout) {
					console.warn(`[TARX] Stream inactivity timeout after ${streamTimeout}ms`);
					throw new Error(`Stream timed out — no data received for ${Math.round(streamTimeout / 1000)}s`);
				}

				// Race between reading and a short timeout to check periodically
				const readPromise = reader.read();
				const timeoutPromise = new Promise<{ done: true; value: undefined }>((resolve) =>
					setTimeout(() => resolve({ done: false as any, value: undefined }), 5000)
				);

				const { done, value } = await Promise.race([readPromise, timeoutPromise]);
				if (done) break;
				if (!value) continue; // Timeout tick — loop back to check inactivity

				lastChunkTime = Date.now();
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
							// Handle both standard content and reasoning_content (for QwQ/Qwen reasoning models)
							// TARX: Yield structured chunks to enable thinking token UI
							if (delta?.reasoning_content) {
								yield { type: 'thinking' as const, content: delta.reasoning_content };
							}
							if (delta?.content) {
								yield { type: 'content' as const, content: delta.content };
							}
						} catch {
							// Ignore parse errors
						}
					}
				}
			}
		} finally {
			// Always release the reader to prevent connection leaks
			try { reader.releaseLock(); } catch { /* ignore */ }
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
