import { useCallback } from 'react';
import type { ToolCallResult } from '../types';

interface MemoryEntry {
  id: string;
  key: string;
  value: unknown;
  space_id?: string;
  created_at: string;
}

/**
 * Read/write TARX persistent memory from an agent widget.
 *
 * Wraps tarx_memory_store and tarx_memory_search MCP tools.
 * Uses direct HTTP as a convenience — memory operations don't
 * need the full postMessage round-trip.
 */
export function useLocalMemory() {
  const store = useCallback(
    async (
      key: string,
      value: unknown,
      spaceId?: string,
    ): Promise<ToolCallResult<{ id: string }>> => {
      const start = Date.now();
      try {
        const r = await fetch('http://localhost:11435/v1/tools/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'tarx_memory_store',
            input: { key, value: JSON.stringify(value), space_id: spaceId },
          }),
          signal: AbortSignal.timeout(10_000),
        });

        if (!r.ok) {
          return { success: false, error: `Store failed: ${r.status}`, durationMs: Date.now() - start };
        }

        const data = await r.json();
        return { success: true, data, durationMs: Date.now() - start };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : 'Memory store failed',
          durationMs: Date.now() - start,
        };
      }
    },
    [],
  );

  const search = useCallback(
    async (
      query: string,
      limit = 5,
      spaceId?: string,
    ): Promise<ToolCallResult<MemoryEntry[]>> => {
      const start = Date.now();
      try {
        const r = await fetch('http://localhost:11435/v1/tools/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'tarx_memory_search',
            input: { query, limit, space_id: spaceId },
          }),
          signal: AbortSignal.timeout(10_000),
        });

        if (!r.ok) {
          return { success: false, error: `Search failed: ${r.status}`, durationMs: Date.now() - start };
        }

        const data = await r.json();
        return { success: true, data: data as MemoryEntry[], durationMs: Date.now() - start };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : 'Memory search failed',
          durationMs: Date.now() - start,
        };
      }
    },
    [],
  );

  const recall = useCallback(
    async (key: string): Promise<ToolCallResult<MemoryEntry | null>> => {
      const start = Date.now();
      try {
        const r = await fetch('http://localhost:11435/v1/tools/call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'tarx_memory_recall',
            input: { key },
          }),
          signal: AbortSignal.timeout(10_000),
        });

        if (!r.ok) {
          return { success: false, error: `Recall failed: ${r.status}`, durationMs: Date.now() - start };
        }

        const data = await r.json();
        return { success: true, data: data as MemoryEntry | null, durationMs: Date.now() - start };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : 'Memory recall failed',
          durationMs: Date.now() - start,
        };
      }
    },
    [],
  );

  return { store, search, recall };
}
