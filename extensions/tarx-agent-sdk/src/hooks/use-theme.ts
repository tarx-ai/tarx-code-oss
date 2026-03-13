import { useState, useEffect } from 'react';
import type { AgentTheme, HostToAgentMessage } from '../types';

/**
 * Get the current TARX Workbench theme.
 *
 * Reads initial theme from DOM class (VS Code sets 'vscode-dark' / 'vscode-light').
 * Listens for host-pushed theme changes via postMessage.
 *
 * Adapted from MCP App Studio's `useTheme` — same concept,
 * different transport (VS Code webview postMessage vs OpenAI globals).
 */
export function useAgentTheme(): AgentTheme {
  const [theme, setTheme] = useState<AgentTheme>(() => detectTheme());

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as HostToAgentMessage;
      if (msg?.type === 'tarx:theme') {
        setTheme(msg.theme);
      }
      if (msg?.type === 'tarx:setGlobals') {
        setTheme(msg.globals.theme);
      }
    };

    window.addEventListener('message', handler);

    // Also watch for VS Code body class changes (theme switch)
    const observer = new MutationObserver(() => {
      setTheme(detectTheme());
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      window.removeEventListener('message', handler);
      observer.disconnect();
    };
  }, []);

  return theme;
}

function detectTheme(): AgentTheme {
  if (typeof document === 'undefined') return 'dark';

  // VS Code applies these classes to body
  const bodyClass = document.body.className;
  if (bodyClass.includes('vscode-light')) return 'light';
  if (bodyClass.includes('vscode-dark')) return 'dark';

  // Fallback: check prefers-color-scheme
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light';
  }

  return 'dark';
}
