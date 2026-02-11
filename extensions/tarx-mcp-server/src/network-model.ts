/**
 * TARX Network Model Adapter
 *
 * Streams responses from Claude API for action-oriented tasks.
 * Used when the router classifies intent as requiring network model.
 */

import Anthropic from '@anthropic-ai/sdk';
import { buildNetworkSystemPrompt } from './systemPrompt.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;

export interface NetworkContext {
  cwd?: string;
  files?: string[];
  projectInstructions?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

function formatHistory(history: NetworkContext['history']): Anthropic.MessageParam[] {
  if (!history || history.length === 0) {
    return [];
  }
  return history.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));
}

/**
 * Get API key from environment
 */
export function getApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY;
}

/**
 * Check if API key is available
 */
export function hasApiKey(): boolean {
  const key = getApiKey();
  return Boolean(key && key.length > 0);
}

/**
 * Stream response from Claude API
 */
export async function* streamNetworkResponse(
  message: string,
  context: NetworkContext = {}
): AsyncGenerator<string, void, unknown> {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const client = new Anthropic({ apiKey });
  const systemPrompt = buildNetworkSystemPrompt(context);

  const messages: Anthropic.MessageParam[] = [
    ...formatHistory(context.history),
    { role: 'user', content: message },
  ];

  const stream = await client.messages.stream({
    model: DEFAULT_MODEL,
    max_tokens: DEFAULT_MAX_TOKENS,
    system: systemPrompt,
    messages,
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      const delta = event.delta as { type: string; text?: string };
      if (delta.type === 'text_delta' && delta.text) {
        yield delta.text;
      }
    }
  }
}

/**
 * Get non-streaming response from Claude API
 */
export async function getNetworkResponse(
  message: string,
  context: NetworkContext = {}
): Promise<string> {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const client = new Anthropic({ apiKey });
  const systemPrompt = buildNetworkSystemPrompt(context);

  const messages: Anthropic.MessageParam[] = [
    ...formatHistory(context.history),
    { role: 'user', content: message },
  ];

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: DEFAULT_MAX_TOKENS,
    system: systemPrompt,
    messages,
  });

  // Extract text content
  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  );

  return textBlocks.map(b => b.text).join('');
}
