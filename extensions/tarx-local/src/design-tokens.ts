/**
 * TARX Design Tokens
 * Central source of truth for colors, typography, spacing
 * Uses VS Code theme engine for proper theming integration
 */

import * as vscode from 'vscode';

// ============================================================================
// VS CODE THEME COLORS (use with new vscode.ThemeColor())
// ============================================================================

export const ThemeColors = {
  // Status bar backgrounds
  statusBarWarning: 'statusBarItem.warningBackground',
  statusBarError: 'statusBarItem.errorBackground',
  statusBarProminentBg: 'statusBarItem.prominentBackground',

  // Editor colors
  editorForeground: 'editor.foreground',
  editorBackground: 'editor.background',

  // Activity bar
  activityBarForeground: 'activityBar.foreground',
  activityBarBackground: 'activityBar.background',

  // Notifications
  notificationError: 'notificationsErrorIcon.foreground',
  notificationWarning: 'notificationsWarningIcon.foreground',
  notificationInfo: 'notificationsInfoIcon.foreground',

  // Charts/Graphs
  chartGreen: 'charts.green',
  chartRed: 'charts.red',
  chartYellow: 'charts.yellow',
  chartBlue: 'charts.blue',
  chartOrange: 'charts.orange',
};

/**
 * Create a VS Code ThemeColor object
 */
export function themeColor(colorId: string): vscode.ThemeColor {
  return new vscode.ThemeColor(colorId);
}

// ============================================================================
// RAW COLORS (fallback/custom use only)
// ============================================================================

export const Colors = {
  // Primary (TARX Brand)
  primary: '#ff6b2b',
  primaryHover: '#ff8552',
  primaryActive: '#e55a1a',
  primaryLight: 'rgba(255, 107, 43, 0.1)',
  primaryDisabled: 'rgba(255, 107, 43, 0.5)',

  // Status Colors
  success: '#22c55e',
  successLight: 'rgba(34, 197, 94, 0.1)',
  warning: '#f59e0b',
  warningLight: 'rgba(245, 158, 11, 0.1)',
  error: '#ef4444',
  errorLight: 'rgba(239, 68, 68, 0.1)',
  info: '#3b82f6',
  infoLight: 'rgba(59, 130, 246, 0.1)',

  // Backgrounds
  bg: {
    primary: '#0a0a0a',      // Near-black
    secondary: '#121212',    // Dark gray
    tertiary: '#1a1a1a',     // Slightly lighter
    hover: '#232323',        // Hover state
    selected: '#2a2a2a',     // Selected state
    overlay: 'rgba(0, 0, 0, 0.5)',
  },

  // Text
  text: {
    primary: '#ffffff',      // White
    secondary: '#b4b4b4',    // Gray
    muted: '#6b6b6b',        // Muted gray
    disabled: '#4b4b4b',     // Disabled gray
  },

  // Borders
  border: {
    default: '#2a2a2a',      // Dark border
    focus: '#ff6b2b',        // Focus border (primary)
    light: '#404040',        // Light border
    subtle: '#1a1a1a',       // Subtle border
  },
};

// ============================================================================
// TYPOGRAPHY
// ============================================================================

export const Typography = {
  // Font families
  fontFamily: {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    mono: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
  },

  // Font sizes
  fontSize: {
    xs: '12px',
    sm: '13px',
    base: '14px',
    lg: '16px',
    xl: '18px',
    '2xl': '20px',
    '3xl': '24px',
  },

  // Font weights
  fontWeight: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  // Line heights
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
};

// ============================================================================
// SPACING
// ============================================================================

export const Spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  '2xl': '32px',
};

// ============================================================================
// BORDER RADIUS
// ============================================================================

export const BorderRadius = {
  none: '0',
  sm: '2px',
  base: '4px',
  md: '6px',
  lg: '8px',
};

// ============================================================================
// TRANSITIONS
// ============================================================================

export const Transitions = {
  fast: '150ms ease-in-out',
  normal: '250ms ease-in-out',
  slow: '350ms ease-in-out',
};

// ============================================================================
// STATUS ICONS (Unicode for status bar)
// ============================================================================

export const StatusIcons = {
  success: '\u2713',    // ✓
  error: '\u2717',      // ✗
  warning: '\u26A0',    // ⚠
  info: '\u2139',       // ℹ
  loading: '\u25CB',    // ○
  connected: '\u25C9',  // ◉
  disconnected: '\u25CB', // ○
  meshOn: '\u2299',     // ⊙
  meshOff: '\u2298',    // ⊘
};

export default { Colors, ThemeColors, themeColor, Typography, Spacing, BorderRadius, Transitions, StatusIcons };
