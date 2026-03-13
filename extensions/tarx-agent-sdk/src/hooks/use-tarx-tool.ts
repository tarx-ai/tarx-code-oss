import { useCallback, useRef, useState } from 'react';
import type {
  ToolCallResult,
  ToolMockConfig,
  AgentToHostMessage,
  HostToAgentMessage,
} from '../types';

interface UseTARXToolOptions<TOutput = unknown> {
  /** Called on successful tool response */
  onSuccess?: (data: TOutput) => void;
  /** Called on error */
  onError?: (error: string) => void;
  /** Mock config for TDD — bypasses real call */
  mock?: ToolMockConfig;
}

/**
 * Call any TARX MCP tool from an agent widget.
 *
 * Adapted from MCP App Studio's `useCallTool`. Key differences:
 * - Routes through VS Code postMessage (not HTTP proxy)
 * - Supports mock configs for TDD (from MCP App Studio's mock system)
 * - Extension host resolves the call to the correct MCP server
 *
 * Usage:
 * ```tsx
 * const { call, loading, result } = useTARXTool<Input, Output>('tarx_list_spaces');
 * const r = await call({ limit: 10 });
 * ```
 */
export function useTARXTool<
  TInput = Record<string, unknown>,
  TOutput = unknown,
>(toolName: string, options: UseTARXToolOptions<TOutput> = {}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ToolCallResult<TOutput> | null>(null);
  const pendingRef = useRef<Map<string, {
    resolve: (r: ToolCallResult<TOutput>) => void;
    startTime: number;
  }>>(new Map());

  // Listen for responses from extension host
  const listenerAttachedRef = useRef(false);
  if (!listenerAttachedRef.current && typeof window !== 'undefined') {
    listenerAttachedRef.current = true;
    window.addEventListener('message', (event: MessageEvent) => {
      const msg = event.data as HostToAgentMessage;
      if (msg?.type === 'tarx:toolResult') {
        const pending = pendingRef.current.get(msg.id);
        if (pending) {
          pendingRef.current.delete(msg.id);
          pending.resolve(msg.result as ToolCallResult<TOutput>);
        }
      }
    });
  }

  const call = useCallback(
    async (input: TInput): Promise<ToolCallResult<TOutput>> => {
      setLoading(true);
      const start = Date.now();

      try {
        // ── Mock path (TDD) ──────────────────────────────────────────────
        if (options.mock) {
          const variant = options.mock.activeVariantId
            ? options.mock.variants.find(v => v.id === options.mock!.activeVariantId)
            : options.mock.variants[0];

          if (variant) {
            await new Promise(r => setTimeout(r, variant.delay));
            const mockResult: ToolCallResult<TOutput> = variant.response.isError
              ? { success: false, error: variant.response.error ?? 'Mock error', durationMs: Date.now() - start }
              : { success: true, data: variant.response.data as TOutput, durationMs: Date.now() - start };
            setResult(mockResult);
            if (mockResult.success) options.onSuccess?.(mockResult.data!);
            else options.onError?.(mockResult.error!);
            return mockResult;
          }
        }

        // ── Real path (via extension host postMessage) ───────────────────
        const callId = `${toolName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        const resultPromise = new Promise<ToolCallResult<TOutput>>((resolve) => {
          pendingRef.current.set(callId, { resolve, startTime: start });

          // Timeout after 30s
          setTimeout(() => {
            if (pendingRef.current.has(callId)) {
              pendingRef.current.delete(callId);
              resolve({
                success: false,
                error: 'Tool call timed out after 30s',
                durationMs: Date.now() - start,
              });
            }
          }, 30_000);
        });

        // Send to extension host via VS Code webview API
        const message: AgentToHostMessage = {
          type: 'tarx:callTool',
          id: callId,
          tool: toolName,
          args: input as Record<string, unknown>,
        };

        if (typeof acquireVsCodeApi !== 'undefined') {
          // Inside VS Code webview
          const vscode = acquireVsCodeApi();
          vscode.postMessage(message);
        } else {
          // Fallback: direct HTTP call (for standalone testing)
          return await callToolDirect(toolName, input as Record<string, unknown>, start);
        }

        const r = await resultPromise;
        setResult(r);
        if (r.success) options.onSuccess?.(r.data as TOutput);
        else options.onError?.(r.error!);
        return r;
      } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        const failure: ToolCallResult<TOutput> = {
          success: false,
          error,
          durationMs: Date.now() - start,
        };
        setResult(failure);
        options.onError?.(error);
        return failure;
      } finally {
        setLoading(false);
      }
    },
    [toolName, options],
  );

  return { call, loading, result };
}

// VS Code webview API type
declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

/**
 * Direct HTTP fallback for when not running inside VS Code webview.
 * Useful for standalone agent testing.
 */
async function callToolDirect<T>(
  tool: string,
  args: Record<string, unknown>,
  startTime: number,
): Promise<ToolCallResult<T>> {
  try {
    const r = await fetch('http://localhost:11435/v1/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, input: args }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!r.ok) {
      return {
        success: false,
        error: `Tool call failed: ${r.status} ${r.statusText}`,
        durationMs: Date.now() - startTime,
      };
    }

    const data = await r.json() as T;
    return { success: true, data, durationMs: Date.now() - startTime };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Direct tool call failed',
      durationMs: Date.now() - startTime,
    };
  }
}
