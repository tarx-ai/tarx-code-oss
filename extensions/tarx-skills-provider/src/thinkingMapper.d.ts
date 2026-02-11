/**
 * TARX Thinking Tokens Mapper
 *
 * Maps Qwen 8.2B reasoning_content to VS Code 1.109 thinking blocks.
 * ~50 lines of wire-up as planned.
 */
/** Qwen streaming chunk format (OpenAI-compatible) */
export interface QwenStreamChunk {
    choices: [
        {
            delta: {
                reasoning_content?: string;
                content?: string;
            };
            finish_reason?: string | null;
        }
    ];
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
export declare function mapQwenToThinking(chunk: QwenStreamChunk): MappedChunk;
/**
 * Accumulate thinking tokens across chunks into complete blocks.
 * Useful for non-streaming display where you want the full thought.
 */
export declare class ThinkingAccumulator {
    private thinkingBuffer;
    private contentBuffer;
    private isThinking;
    feed(chunk: QwenStreamChunk): MappedChunk;
    getThinking(): string;
    getContent(): string;
    reset(): void;
}
//# sourceMappingURL=thinkingMapper.d.ts.map