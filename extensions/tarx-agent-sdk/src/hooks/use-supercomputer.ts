import { useState, useEffect, useCallback } from 'react';

interface SuperComputerStatus {
  /** Whether any compute is available */
  active: boolean;
  /** Number of mesh peers contributing compute */
  peers: number;
  /** True if only local inference is available (no mesh) */
  localOnly: boolean;
  /** Model name running on local inference */
  modelName: string | null;
}

/**
 * Mesh-aware inference hook.
 *
 * Queries local inference by default. When mesh peers are available
 * and `preferMesh` is true, routes through mesh for distributed compute.
 *
 * This is the "SuperComputer" abstraction — local + mesh = one interface.
 */
export function useSuperComputer() {
  const [status, setStatus] = useState<SuperComputerStatus>({
    active: false,
    peers: 0,
    localOnly: true,
    modelName: null,
  });

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const [inferenceRes, meshRes] = await Promise.allSettled([
          fetch('http://localhost:11435/v1/models', { signal: AbortSignal.timeout(2000) }),
          fetch('http://localhost:11436/mesh/status', { signal: AbortSignal.timeout(2000) }),
        ]);

        if (cancelled) return;

        const inferenceUp = inferenceRes.status === 'fulfilled' && inferenceRes.value.ok;
        let modelName: string | null = null;
        if (inferenceUp) {
          try {
            const data = await (inferenceRes as PromiseFulfilledResult<Response>).value.json();
            modelName = data?.data?.[0]?.id ?? null;
          } catch { /* ignore */ }
        }

        let peers = 0;
        if (meshRes.status === 'fulfilled' && meshRes.value.ok) {
          try {
            const data = await meshRes.value.json();
            peers = data?.peers ?? 0;
          } catch { /* ignore */ }
        }

        setStatus({
          active: inferenceUp,
          peers,
          localOnly: peers === 0,
          modelName,
        });
      } catch {
        if (!cancelled) {
          setStatus({ active: false, peers: 0, localOnly: true, modelName: null });
        }
      }
    };

    check();
    const interval = setInterval(check, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const query = useCallback(
    async (
      prompt: string,
      options: { preferMesh?: boolean; maxTokens?: number; systemPrompt?: string } = {},
    ): Promise<{ text: string; source: 'local' | 'mesh'; durationMs: number }> => {
      const start = Date.now();
      const { preferMesh = false, maxTokens = 1024, systemPrompt } = options;

      const endpoint =
        preferMesh && status.peers > 0
          ? 'http://localhost:11436/mesh/query'
          : 'http://localhost:11435/v1/chat/completions';

      const messages: Array<{ role: string; content: string }> = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: prompt });

      try {
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: status.modelName ?? 'default',
            messages,
            max_tokens: maxTokens,
          }),
          signal: AbortSignal.timeout(60_000),
        });

        if (!r.ok) {
          return { text: '', source: 'local', durationMs: Date.now() - start };
        }

        const data = await r.json();
        const text = data?.choices?.[0]?.message?.content ?? '';
        const source = preferMesh && status.peers > 0 ? 'mesh' : 'local';

        return { text, source, durationMs: Date.now() - start };
      } catch {
        return { text: '', source: 'local', durationMs: Date.now() - start };
      }
    },
    [status.peers, status.modelName],
  );

  return { status, query };
}
