/**
 * TARX Context Injector - Enriches system prompts with relevant context
 *
 * This module takes the base TARX system prompt and enriches it with:
 * - Recent memory context
 * - Current project/space information
 * - User preferences and custom instructions
 *
 * Created: Feb 2026
 */

import { TARX_SYSTEM_PROMPT } from './systemPrompt.js';
import { getSpace, getMessages } from './database.js';

/**
 * Memory context interface
 */
export interface MemoryContext {
  content: string;
  importance?: number;
  timestamp?: number;
}

/**
 * Project context interface
 */
export interface ProjectContext {
  spaceId: string;
  spaceName?: string;
  description?: string;
  sessionCount?: number;
  recentMessages?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
}

/**
 * User configuration for custom prompts
 */
export interface PromptConfig {
  customInstructions?: string;
  overridePrompt?: string;
}

/**
 * Build a context-enriched system prompt
 *
 * @param basePrompt - The base system prompt to enrich (defaults to TARX_SYSTEM_PROMPT)
 * @param options - Context options
 * @returns Enriched system prompt with context
 */
export async function buildContextualPrompt(
  basePrompt: string = TARX_SYSTEM_PROMPT,
  options: {
    memories?: MemoryContext[];
    topic?: string;
    spaceId?: string;
    config?: PromptConfig;
  } = {}
): Promise<string> {
  const { memories, topic, spaceId, config } = options;

  // If user has overridden the prompt completely, use that
  if (config?.overridePrompt) {
    return config.overridePrompt;
  }

  let enriched = basePrompt;

  // Add memory context if available
  if (memories && memories.length > 0) {
    enriched += '\n\n## Relevant Context from Memory\n';
    for (const memory of memories.slice(0, 5)) {
      // Limit to top 5 memories
      enriched += `- ${memory.content}\n`;
    }
  }

  // Add project/space context if provided
  if (spaceId) {
    try {
      const space = getSpace(spaceId);
      if (space) {
        enriched += '\n\n## Current Project Context\n';
        enriched += `Project: ${space.name}\n`;
        if (space.description) {
          enriched += `Description: ${space.description}\n`;
        }

        // Get recent messages from this space for additional context
        // Note: This would require a function to get recent messages by spaceId
        // For now, we'll just add the space info
      }
    } catch (error) {
      // Silently fail if space not found - don't break the prompt
      console.error('Failed to load space context:', error);
    }
  }

  // Add topic context if provided
  if (topic) {
    enriched += `\n\n## Current Topic\n${topic}\n`;
  }

  // Add custom user instructions at the end (highest priority)
  if (config?.customInstructions) {
    enriched += '\n\n## User Instructions\n';
    enriched += config.customInstructions + '\n';
  }

  return enriched;
}

/**
 * Build a lightweight contextual prompt for streaming/fast responses
 * Only includes essential context to minimize token usage
 */
export async function buildLightweightPrompt(
  basePrompt: string = TARX_SYSTEM_PROMPT,
  options: {
    spaceId?: string;
    config?: PromptConfig;
  } = {}
): Promise<string> {
  const { spaceId, config } = options;

  if (config?.overridePrompt) {
    return config.overridePrompt;
  }

  let enriched = basePrompt;

  // Only add space name if provided
  if (spaceId) {
    try {
      const space = getSpace(spaceId);
      if (space) {
        enriched += `\n\nCurrent Project: ${space.name}`;
      }
    } catch (error) {
      // Silently fail
    }
  }

  // Add custom instructions
  if (config?.customInstructions) {
    enriched += '\n\n## User Instructions\n' + config.customInstructions;
  }

  return enriched;
}

/**
 * Extract memory-relevant keywords from a query
 * Used to search memory store for relevant context
 */
export function extractMemoryKeywords(query: string): string[] {
  // Simple keyword extraction - can be enhanced with NLP later
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'can']);

  const words = query.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  return [...new Set(words)]; // Remove duplicates
}

/**
 * Configuration store for user preferences
 * In a real implementation, this would persist to disk or database
 */
class PromptConfigStore {
  private config: PromptConfig = {};

  setCustomInstructions(instructions: string): void {
    this.config.customInstructions = instructions;
  }

  setOverridePrompt(prompt: string | null): void {
    this.config.overridePrompt = prompt || undefined;
  }

  getConfig(): PromptConfig {
    return { ...this.config };
  }

  clearConfig(): void {
    this.config = {};
  }
}

export const promptConfigStore = new PromptConfigStore();
