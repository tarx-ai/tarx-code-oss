"use strict";
/**
 * TARX Thinking Tokens Mapper
 *
 * Maps Qwen 8.2B reasoning_content to VS Code 1.109 thinking blocks.
 * ~50 lines of wire-up as planned.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThinkingAccumulator = void 0;
exports.mapQwenToThinking = mapQwenToThinking;
/**
 * Map a single Qwen stream chunk to VS Code thinking/content blocks.
 *
 * Qwen emits `reasoning_content` during chain-of-thought,
 * then switches to `content` for the final answer.
 */
function mapQwenToThinking(chunk) {
    const choice = chunk.choices[0];
    if (!choice)
        return { done: true };
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
class ThinkingAccumulator {
    thinkingBuffer = '';
    contentBuffer = '';
    isThinking = true;
    feed(chunk) {
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
    getThinking() {
        return this.thinkingBuffer;
    }
    getContent() {
        return this.contentBuffer;
    }
    reset() {
        this.thinkingBuffer = '';
        this.contentBuffer = '';
        this.isThinking = true;
    }
}
exports.ThinkingAccumulator = ThinkingAccumulator;
//# sourceMappingURL=thinkingMapper.js.map