import { useState, useEffect } from 'react';
import type { TARXCapabilities, HostToAgentMessage } from '../types';

const PORTS = {
  inference: 11435,
  mesh: 11436,
  embeddings: 11437,
} as const;

const DEFAULT_CAPS: TARXCapabilities = {
  localInference: false,
  mesh: false,
  embeddings: false,
  spaces: false,
  memory: false,
  meshPeers: 0,
  modelName: null,
};

/**
 * Detect TARX runtime capabilities.
 *
 * Probes local service ports on mount and every 30s.
 * Also listens for host-pushed capability updates via postMessage.
 *
 * Adapted from MCP App Studio's `useCapabilities` — but checks
 * hardware services instead of host features.
 */
export function useAgentCapabilities(): TARXCapabilities {
  const [caps, setCaps] = useState<TARXCapabilities>(DEFAULT_CAPS);

  useEffect(() => {
    let cancelled = false;

    const probe = async () => {
      const results = await Promise.allSettled([
        checkHealth(PORTS.inference),
        checkHealth(PORTS.mesh),
        checkHealth(PORTS.embeddings),
        getMeshStatus(),
        getModelName(),
      ]);

      if (cancelled) return;

      const inference = results[0].status === 'fulfilled' && results[0].value;
      const mesh = results[1].status === 'fulfilled' && results[1].value;
      const embeddings = results[2].status === 'fulfilled' && results[2].value;
      const meshStatus = results[3].status === 'fulfilled' ? results[3].value : { peers: 0 };
      const modelName = results[4].status === 'fulfilled' ? results[4].value : null;

      setCaps({
        localInference: inference,
        mesh,
        embeddings,
        spaces: inference,   // daemon manages both
        memory: inference,
        meshPeers: meshStatus.peers,
        modelName,
      });
    };

    probe();
    const interval = setInterval(probe, 30_000);

    // Also listen for host-pushed updates
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data as HostToAgentMessage;
      if (msg?.type === 'tarx:capabilities') {
        setCaps(msg.capabilities);
      }
    };
    window.addEventListener('message', handleMessage);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  return caps;
}

async function checkHealth(port: number): Promise<boolean> {
  try {
    const r = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function getMeshStatus(): Promise<{ peers: number }> {
  try {
    const r = await fetch('http://localhost:11436/mesh/status', {
      signal: AbortSignal.timeout(2000),
    });
    if (!r.ok) return { peers: 0 };
    const data = await r.json();
    return { peers: data.peers ?? 0 };
  } catch {
    return { peers: 0 };
  }
}

async function getModelName(): Promise<string | null> {
  try {
    const r = await fetch('http://localhost:11435/v1/models', {
      signal: AbortSignal.timeout(2000),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data?.data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}
