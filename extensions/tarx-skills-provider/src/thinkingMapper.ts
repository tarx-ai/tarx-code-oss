/**
 * TARX Thinking Tokens Mapper
 *
 * Maps Qwen 8.2B reasoning_content to VS Code 1.109 thinking blocks.
 * ~50 lines of wire-up as planned.
 */

/** Qwen streaming chunk format (OpenAI-compatible) */
export interface QwenStreamChunk {
	choices: [{
		delta: {
			reasoning_content?: string;
			content?: string;
		};
		finish_reason?: string | null;
	}];
}

/** VS Code thinking block format */
export interface ThinkingBlock {
	kind: 'thinking';
	content: string;
	signature?: string;
}

/** Mapped result from a stream chunk */
export interface MappedChunk {
	thinking?: ThinkingBlock;
	content?: string;
	done: boolean;
}

/**
 * Map a single Qwen stream chunk to VS Code thinking/content blocks.
 *
 * Qwen emits `reasoning_content` during chain-of-thought,
 * then switches to `content` for the final answer.
 */
export function mapQwenToThinking(chunk: QwenStreamChunk): MappedChunk {
	const choice = chunk.choices[0];
	if (!choice) return { done: true };

	const delta = choice.delta;
	const done = choice.finish_reason === 'stop';

	if (delta.reasoning_content) {
		return {
			thinking: {
				kind: 'thinking',
				content: delta.reasoning_content,
			},
			done,
		};
	}

	if (delta.content) {
		return {
			content: delta.content,
			done,
		};
	}

	return { done };
}

/**
 * Accumulate thinking tokens across chunks into complete blocks.
 * Useful for non-streaming display where you want the full thought.
 */
export class ThinkingAccumulator {
	private thinkingBuffer = '';
	private contentBuffer = '';
	private isThinking = true;

	feed(chunk: QwenStreamChunk): MappedChunk {
		const mapped = mapQwenToThinking(chunk);

		if (mapped.thinking) {
			this.thinkingBuffer += mapped.thinking.content;
		}

		if (mapped.content) {
			if (this.isThinking) {
				this.isThinking = false; // Transition from thinking to answering
			}
			this.contentBuffer += mapped.content;
		}

		return mapped;
	}

	getThinking(): string {
		return this.thinkingBuffer;
	}

	getContent(): string {
		return this.contentBuffer;
	}

	reset(): void {
		this.thinkingBuffer = '';
		this.contentBuffer = '';
		this.isThinking = true;
	}
}
