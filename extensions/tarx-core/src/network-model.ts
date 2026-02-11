/**
 * TARX Network Model Adapter
 *
 * Streams responses from Claude API for action-oriented tasks.
 * Used when the router classifies intent as requiring network model.
 */

import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;

export interface NetworkContext {
  cwd?: string;
  files?: string[];
  projectInstructions?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

function buildSystemPrompt(context: NetworkContext): string {
  const parts: string[] = [
    'You are TARX, an AI assistant integrated into a VS Code fork called tarx-code-oss.',
    'You have direct access to the user\'s workspace and can perform actions.',
    '',
    'CAPABILITIES:',
    '- Write and edit files (output in fenced code blocks with file paths)',
    '- Suggest terminal commands (output in ```bash blocks)',
    '- Multi-step reasoning and task execution',
    '',
    'STYLE:',
    '- Be direct and efficient. No fluff.',
    '- Show code, not explanations of code.',
    '- When creating files, use: ```typescript:src/path/to/file.ts',
    '',
  ];

  if (context.cwd) {
    parts.push(`WORKSPACE: ${context.cwd}`);
  }

  if (context.files && context.files.length > 0) {
    parts.push(`OPEN FILES: ${context.files.join(', ')}`);
  }

  if (context.projectInstructions) {
    parts.push('', 'PROJECT INSTRUCTIONS:', context.projectInstructions);
  }

  return parts.join('\n');
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
  const systemPrompt = buildSystemPrompt(context);

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
  const systemPrompt = buildSystemPrompt(context);

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
