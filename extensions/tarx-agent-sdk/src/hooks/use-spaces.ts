import { useState, useEffect, useCallback } from 'react';

interface Space {
  id: string;
  name: string;
  emoji?: string;
  created_at: string;
  updated_at?: string;
}

/**
 * Access TARX spaces (projects) from an agent widget.
 *
 * Loads spaces on mount via direct HTTP to the local daemon.
 */
export function useSpaces() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('http://localhost:11435/v1/tools/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'tarx_list_spaces',
          input: {},
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!r.ok) {
        setError(`Failed to load spaces: ${r.status}`);
        setSpaces([]);
        return;
      }

      const data = await r.json();
      const list = Array.isArray(data) ? data : (data?.spaces ?? []);
      setSpaces(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load spaces');
      setSpaces([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { spaces, loading, error, refresh };
}
