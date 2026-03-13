import { useState, useEffect } from 'react';
import type { TARXHostContext, HostToAgentMessage } from '../types';
import { useAgentCapabilities } from './use-capabilities';
import { useAgentTheme } from './use-theme';

/**
 * Full host context — combines theme, capabilities, and space info.
 *
 * Adapted from MCP App Studio's `useHostContext` which returns
 * platform, locale, device info, and container dimensions.
 * TARX simplifies: always desktop, always the current space.
 */
export function useHostContext(): TARXHostContext {
  const theme = useAgentTheme();
  const capabilities = useAgentCapabilities();
  const [spaceId, setSpaceId] = useState<string | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as HostToAgentMessage;
      if (msg?.type === 'tarx:setGlobals' && msg.globals) {
        setSpaceId(msg.globals.spaceId);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return {
    platform: 'desktop',
    theme,
    spaceId,
    capabilities,
  };
}
