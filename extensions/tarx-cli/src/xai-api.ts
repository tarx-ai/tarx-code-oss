/**
 * TARX xAI Inference Module
 *
 * Calls xAI (Grok) chat completions endpoint.
 * Keeps X/Twitter API functions from x-api.ts intact — this is additive.
 *
 * Required env vars (in .env at repo root):
 *   XAI_API_KEY — xAI API key (from https://console.x.ai/)
 *
 * Usage:
 *   import { callXAI } from './xai-api';
 *   const response = await callXAI('Explain TARX in one sentence');
 */

const XAI_BASE = 'https://api.x.ai/v1';

export interface XAIMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface XAIOptions {
	model?: string;
	temperature?: number;
	maxTokens?: number;
	systemPrompt?: string;
}

/**
 * Call xAI chat completions endpoint.
 * @param prompt - User message
 * @param opts - Model, temperature, maxTokens, optional system prompt
 * @returns The assistant's response text
 */
export async function callXAI(
	prompt: string,
	opts: XAIOptions = {}
): Promise<string> {
	const apiKey = process.env.XAI_API_KEY;
	if (!apiKey) {
		throw new Error('xAI: XAI_API_KEY not set. Add it to .env');
	}

	const model = opts.model || 'grok-3';
	const temperature = opts.temperature ?? 0.7;
	const maxTokens = opts.maxTokens ?? 1024;

	const messages: XAIMessage[] = [];
	if (opts.systemPrompt) {
		messages.push({ role: 'system', content: opts.systemPrompt });
	}
	messages.push({ role: 'user', content: prompt });

	const res = await fetch(`${XAI_BASE}/chat/completions`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model,
			messages,
			temperature,
			max_tokens: maxTokens,
		}),
	});

	if (!res.ok) {
		const status = res.status;
		let detail = res.statusText;
		try {
			const err = await res.json() as Record<string, unknown>;
			detail = (err.error as any)?.message || err.detail as string || detail;
		} catch { /* use statusText */ }

		if (status === 401) {
			throw new Error('xAI: Invalid API key. Check XAI_API_KEY in .env');
		}
		if (status === 429) {
			throw new Error('xAI: Rate limited. Wait and retry.');
		}
		throw new Error(`xAI ${status}: ${detail}`);
	}

	const data = await res.json() as any;
	const content = data?.choices?.[0]?.message?.content;
	if (!content) {
		throw new Error('xAI: No content in response');
	}

	return content;
}

/**
 * Multi-turn conversation with xAI.
 * @param messages - Full message array (system + user + assistant turns)
 * @param opts - Model, temperature, maxTokens
 * @returns The assistant's response text
 */
export async function chatXAI(
	messages: XAIMessage[],
	opts: Omit<XAIOptions, 'systemPrompt'> = {}
): Promise<string> {
	const apiKey = process.env.XAI_API_KEY;
	if (!apiKey) {
		throw new Error('xAI: XAI_API_KEY not set. Add it to .env');
	}

	const model = opts.model || 'grok-3';
	const temperature = opts.temperature ?? 0.7;
	const maxTokens = opts.maxTokens ?? 1024;

	const res = await fetch(`${XAI_BASE}/chat/completions`, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model,
			messages,
			temperature,
			max_tokens: maxTokens,
		}),
	});

	if (!res.ok) {
		const status = res.status;
		let detail = res.statusText;
		try {
			const err = await res.json() as Record<string, unknown>;
			detail = (err.error as any)?.message || err.detail as string || detail;
		} catch { /* use statusText */ }
		throw new Error(`xAI ${status}: ${detail}`);
	}

	const data = await res.json() as any;
	const content = data?.choices?.[0]?.message?.content;
	if (!content) {
		throw new Error('xAI: No content in response');
	}

	return content;
}

/**
 * Verify xAI API key is valid.
 */
export async function verifyXAI(): Promise<boolean> {
	const apiKey = process.env.XAI_API_KEY;
	if (!apiKey) return false;

	try {
		// Minimal request to verify auth
		const res = await fetch(`${XAI_BASE}/models`, {
			headers: { 'Authorization': `Bearer ${apiKey}` },
		});
		return res.ok;
	} catch {
		return false;
	}
}
