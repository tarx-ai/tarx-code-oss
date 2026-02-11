/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const INFERENCE_PORT = 11435;
const SUGGESTION_TIMEOUT_MS = 3000;

const SUGGESTION_SYSTEM_PROMPT = `You generate follow-up suggestions for a conversation.
Given the last exchange, suggest 2-3 SHORT follow-up prompts the user might want to ask next.
Rules:
- Each suggestion is max 8 words
- Be specific to the conversation context, not generic
- First: dig deeper into the topic
- Second: pivot to a related action
- Third (optional): meta/improve the response
- Return ONLY a JSON array of strings like ["suggestion 1", "suggestion 2"]
- NO markdown, NO explanation, ONLY the JSON array`;

export class TarxSuggestionService {

	async generateSuggestions(userMessage: string, assistantResponse: string): Promise<string[]> {
		const truncated = assistantResponse.substring(0, 500);

		try {
			const result = await Promise.race([
				this._infer(userMessage, truncated),
				new Promise<null>(resolve => setTimeout(() => resolve(null), SUGGESTION_TIMEOUT_MS))
			]);

			if (result && result.length > 0) {
				return result.slice(0, 3);
			}
		} catch {
			// Fall through to fallback
		}

		return this._fallback(assistantResponse);
	}

	private async _infer(userMsg: string, response: string): Promise<string[]> {
		const body = {
			messages: [
				{ role: 'system', content: SUGGESTION_SYSTEM_PROMPT },
				{ role: 'user', content: `User: ${userMsg}\nAssistant: ${response}` }
			],
			temperature: 0.3,
			max_tokens: 100,
			stream: false,
			repeat_penalty: 1.1
		};

		const res = await fetch(`http://localhost:${INFERENCE_PORT}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(SUGGESTION_TIMEOUT_MS)
		});

		if (!res.ok) {
			return [];
		}

		const data = await res.json() as { choices?: { message?: { content?: string } }[] };
		const text = data.choices?.[0]?.message?.content?.trim() ?? '';

		// Strip markdown wrapping if present
		const jsonStr = text.replace(/^```json?\s*/, '').replace(/\s*```$/, '').trim();

		try {
			const parsed = JSON.parse(jsonStr);
			if (Array.isArray(parsed)) {
				return parsed
					.filter((s: unknown): s is string => typeof s === 'string' && s.length > 0 && s.length <= 60)
					.slice(0, 3);
			}
		} catch {
			// JSON parse failed — try to extract array from text
			const match = jsonStr.match(/\[.*\]/s);
			if (match) {
				try {
					const arr = JSON.parse(match[0]);
					if (Array.isArray(arr)) {
						return arr
							.filter((s: unknown): s is string => typeof s === 'string' && s.length > 0 && s.length <= 60)
							.slice(0, 3);
					}
				} catch {
					// Give up on inference
				}
			}
		}

		return [];
	}

	private _fallback(response: string): string[] {
		const hasCode = /```[\s\S]*?```/.test(response);
		const isError = /error|exception|failed|bug|fix/i.test(response);
		const isExplanation = response.length > 300 && !hasCode;

		if (hasCode) {
			return ['Explain this code', 'Modify this further', 'What could go wrong?'];
		}

		if (isError) {
			return ['What caused this?', 'How do I prevent this?', 'Show me the fix'];
		}

		if (isExplanation) {
			return ['Give me an example', 'What are alternatives?', 'Simplify this'];
		}

		return ['Tell me more', 'What should I do next?'];
	}
}
