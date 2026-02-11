/*---------------------------------------------------------------------------------------------
 *  Context Window Management
 *
 *  Ensures requests fit within llama-server's context window (4096 tokens default).
 *  Uses character-based estimation (~4 chars per token for English).
 *--------------------------------------------------------------------------------------------*/

export interface Message {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

// llama-server default context window
const DEFAULT_CONTEXT_SIZE = 4096;
const RESPONSE_RESERVE = 512; // Reserve tokens for model response
const CHARS_PER_TOKEN = 4; // Approximate for English text

/**
 * Estimate token count from text
 * Uses ~4 chars per token approximation (conservative for English)
 */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate total tokens in message array
 */
export function estimateMessageTokens(messages: Message[]): number {
	return messages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
}

/**
 * Truncate messages to fit within context window
 * Preserves: system prompt (first), user query (last)
 * Removes: oldest conversation history first
 *
 * @param messages Full message array
 * @param contextSize Max context tokens (default 4096)
 * @param responseReserve Tokens to reserve for response (default 512)
 * @returns Truncated messages that fit within context
 */
export function fitToContextWindow(
	messages: Message[],
	contextSize: number = DEFAULT_CONTEXT_SIZE,
	responseReserve: number = RESPONSE_RESERVE
): Message[] {
	const maxTokens = contextSize - responseReserve;

	// Quick check - if already fits, return as-is
	const totalTokens = estimateMessageTokens(messages);
	if (totalTokens <= maxTokens) {
		return messages;
	}

	console.log(`[Context] Truncating: ${totalTokens} tokens > ${maxTokens} max`);

	// Find system message and final user message (must preserve)
	const systemIdx = messages.findIndex(m => m.role === 'system');
	const lastUserIdx = messages.length - 1; // Assume last message is user

	// Calculate tokens for preserved messages
	let preservedTokens = 0;
	if (systemIdx >= 0) {
		preservedTokens += estimateTokens(messages[systemIdx].content);
	}
	if (lastUserIdx >= 0 && lastUserIdx !== systemIdx) {
		preservedTokens += estimateTokens(messages[lastUserIdx].content);
	}

	// If preserved messages alone exceed limit, truncate system prompt
	if (preservedTokens > maxTokens) {
		console.warn(`[Context] System prompt + user query exceeds limit!`);
		const result: Message[] = [];

		// Truncate system prompt to fit
		if (systemIdx >= 0) {
			const systemTokens = maxTokens - estimateTokens(messages[lastUserIdx].content) - 100;
			const maxSystemChars = systemTokens * CHARS_PER_TOKEN;
			result.push({
				role: 'system',
				content: messages[systemIdx].content.slice(0, maxSystemChars) + '\n\n[System prompt truncated]'
			});
		}

		// Always include user query
		if (lastUserIdx >= 0) {
			result.push(messages[lastUserIdx]);
		}

		return result;
	}

	// Build result keeping system prompt and user query
	const result: Message[] = [];
	let usedTokens = preservedTokens;

	// Add system prompt first
	if (systemIdx >= 0) {
		result.push(messages[systemIdx]);
	}

	// Collect conversation history (between system and user)
	const historyStart = systemIdx >= 0 ? systemIdx + 1 : 0;
	const historyEnd = lastUserIdx;
	const historyMessages = messages.slice(historyStart, historyEnd);

	// Add history from most recent to oldest until we run out of space
	const historyToAdd: Message[] = [];
	for (let i = historyMessages.length - 1; i >= 0; i--) {
		const msg = historyMessages[i];
		const msgTokens = estimateTokens(msg.content);

		if (usedTokens + msgTokens <= maxTokens) {
			historyToAdd.unshift(msg); // Prepend to maintain order
			usedTokens += msgTokens;
		} else {
			console.log(`[Context] Dropping ${historyMessages.length - i - historyToAdd.length} old messages`);
			break;
		}
	}

	// Add retained history
	result.push(...historyToAdd);

	// Add user query last
	if (lastUserIdx >= 0 && lastUserIdx !== systemIdx) {
		result.push(messages[lastUserIdx]);
	}

	console.log(`[Context] After truncation: ${estimateMessageTokens(result)} tokens, ${result.length} messages`);
	return result;
}

/**
 * Truncate a single text to fit within token limit
 */
export function truncateToTokens(text: string, maxTokens: number): string {
	const estimatedTokens = estimateTokens(text);
	if (estimatedTokens <= maxTokens) {
		return text;
	}

	const maxChars = maxTokens * CHARS_PER_TOKEN;
	return text.slice(0, maxChars) + '\n\n[Truncated]';
}

/**
 * Create a summary of context usage
 */
export function getContextUsage(messages: Message[], contextSize: number = DEFAULT_CONTEXT_SIZE): {
	totalTokens: number;
	contextSize: number;
	responseReserve: number;
	available: number;
	utilization: number;
	willFit: boolean;
} {
	const totalTokens = estimateMessageTokens(messages);
	const available = contextSize - RESPONSE_RESERVE;

	return {
		totalTokens,
		contextSize,
		responseReserve: RESPONSE_RESERVE,
		available,
		utilization: Math.round((totalTokens / available) * 100),
		willFit: totalTokens <= available
	};
}
