/**
 * TARX Icon System
 * Uses VS Code ThemeIcon (codicons) for native integration
 * Reference: https://code.visualstudio.com/api/references/icons-in-labels
 */

import * as vscode from 'vscode';

// ============================================================================
// CODICON IDS (VS Code built-in icons)
// Use in status bar: `$(icon-id)` syntax
// Use in TreeItem: new vscode.ThemeIcon('icon-id')
// ============================================================================

export const IconIds = {
  // Status
  check: 'check',
  checkAll: 'check-all',
  close: 'close',
  error: 'error',
  warning: 'warning',
  info: 'info',
  question: 'question',
  loading: 'loading~spin',
  pass: 'pass',

  // Actions
  play: 'play',
  debug: 'debug',
  run: 'run',
  stop: 'stop',
  refresh: 'refresh',
  sync: 'sync~spin',
  settings: 'settings-gear',
  settingsGear: 'settings-gear',

  // AI/Robot
  robot: 'robot',
  sparkle: 'sparkle',
  lightbulb: 'lightbulb',

  // Connection
  plug: 'plug',
  debugDisconnect: 'debug-disconnect',
  broadcast: 'broadcast',
  radio: 'radio-tower',
  globe: 'globe',

  // Files
  file: 'file',
  fileCode: 'file-code',
  folder: 'folder',
  folderOpened: 'folder-opened',

  // Chat
  comment: 'comment',
  commentDiscussion: 'comment-discussion',
  mention: 'mention',

  // Tools
  tools: 'tools',
  wrench: 'wrench',
  gear: 'gear',

  // Data
  database: 'database',
  server: 'server',
  pulse: 'pulse',
  graph: 'graph',

  // Misc
  zap: 'zap',
  rocket: 'rocket',
  heart: 'heart',
  star: 'star',
  flame: 'flame',
};

// ============================================================================
// UNICODE SYMBOLS (for status bar text without $(icon) syntax)
// ============================================================================

export const Symbols = {
  // Status
  checkmark: '\u2713',      // ✓
  crossmark: '\u2717',      // ✗
  warning: '\u26A0',        // ⚠
  info: '\u2139',           // ℹ

  // Circles
  circleFilled: '\u25CF',   // ●
  circleEmpty: '\u25CB',    // ○
  circleDot: '\u25C9',      // ◉
  circleRing: '\u25CE',     // ◎

  // Mesh/Network
  meshOn: '\u2299',         // ⊙
  meshOff: '\u2298',        // ⊘

  // Arrows
  arrowRight: '\u2192',     // →
  arrowLeft: '\u2190',      // ←
  arrowUp: '\u2191',        // ↑
  arrowDown: '\u2193',      // ↓

  // Misc
  bullet: '\u2022',         // •
  diamond: '\u25C7',        // ◇
  diamondFilled: '\u25C6',  // ◆
  lightning: '\u26A1',      // ⚡
  gear: '\u2699',           // ⚙
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a ThemeIcon for use in TreeView, QuickPick, etc.
 */
export function icon(id: keyof typeof IconIds): vscode.ThemeIcon {
  return new vscode.ThemeIcon(IconIds[id]);
}

/**
 * Create a ThemeIcon with a specific color
 */
export function coloredIcon(id: keyof typeof IconIds, color: vscode.ThemeColor): vscode.ThemeIcon {
  return new vscode.ThemeIcon(IconIds[id], color);
}

/**
 * Get codicon string for use in status bar text
 * Example: statusIcon('check') returns '$(check)'
 */
export function statusIcon(id: keyof typeof IconIds): string {
  return `$(${IconIds[id]})`;
}

/**
 * Get a unicode symbol
 */
export function symbol(id: keyof typeof Symbols): string {
  return Symbols[id];
}

// ============================================================================
// TARX-SPECIFIC ICON PRESETS
// ============================================================================

export const TarxIcons = {
  // Main TARX icon
  tarx: () => icon('robot'),
  tarxStatus: () => statusIcon('robot'),

  // Connection states
  connected: () => icon('pass'),
  connectedStatus: () => `${Symbols.checkmark}`,
  disconnected: () => icon('debugDisconnect'),
  disconnectedStatus: () => `${Symbols.crossmark}`,
  connecting: () => icon('loading'),
  connectingStatus: () => statusIcon('loading'),

  // Mesh states
  meshOn: () => `${Symbols.meshOn}`,
  meshOff: () => `${Symbols.meshOff}`,

  // AI actions
  thinking: () => icon('loading'),
  sparkle: () => icon('sparkle'),

  // Server
  serverOnline: () => icon('server'),
  serverOffline: () => coloredIcon('server', new vscode.ThemeColor('errorForeground')),
};

export default { IconIds, Symbols, icon, coloredIcon, statusIcon, symbol, TarxIcons };
