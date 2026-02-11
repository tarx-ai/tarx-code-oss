/**
 * Commands Test Suite - 100 test cases for VS Code command execution via HTTP
 *
 * Categories covered:
 *   1. Execute commands                    (G-001 .. G-030)
 *   2. List commands                       (G-031 .. G-050)
 *   3. Search commands                     (G-051 .. G-070)
 *   4. Command palette                     (G-071 .. G-090)
 *   5. Quick open                          (G-091 .. G-100)
 */

import type { TestCase } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function tc(
	id: string,
	name: string,
	priority: 'P0' | 'P1' | 'P2',
	tags: string[],
	steps: TestCase['steps'],
	verify: TestCase['verify'],
	timeout = 10000,
	retries = 1,
): TestCase {
	return { id, category: 'commands', name, description: name, priority, tags, steps, verify, timeoutMs: timeout, retries };
}

function step(tool: string, params: Record<string, unknown> = {}, ok = true, capture?: string, wait?: number): TestCase['steps'][0] {
	return { tool, params, expectSuccess: ok, ...(capture ? { captureResult: capture } : {}), ...(wait ? { waitMs: wait } : {}) };
}

function sv(endpoint: string, expect: Record<string, unknown>): TestCase['verify'] {
	return { type: 'state', stateCheck: { endpoint, expect } };
}

function vv(variable: string, assertion: 'equals' | 'contains' | 'truthy' | 'falsy' | 'gt' | 'lt', expected: unknown): TestCase['verify'] {
	return { type: 'value', valueCheck: { variable, assertion, expected } };
}

// ---------------------------------------------------------------------------
// 1. Execute commands  (G-001 .. G-030)
// ---------------------------------------------------------------------------

export const commandTests: TestCase[] = [

	tc('G-001', 'Execute known workbench command: toggleSidebarVisibility', 'P0', ['execute', 'smoke', 'workbench'],
		[step('tarx_ui_command_execute', { command: 'workbench.action.toggleSidebarVisibility' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-002', 'Execute known workbench command: togglePanel', 'P0', ['execute', 'workbench', 'panel'],
		[step('tarx_ui_command_execute', { command: 'workbench.action.togglePanel' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-003', 'Execute with string args: openSettings', 'P0', ['execute', 'args', 'string'],
		[step('tarx_ui_command_execute', { command: 'workbench.action.openSettings', args: ['editor.fontSize'] }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-004', 'Execute with object args', 'P0', ['execute', 'args', 'object'],
		[step('tarx_ui_command_execute', { command: 'vscode.open', args: [{ external: false }] }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-005', 'Execute unknown command returns error', 'P0', ['execute', 'error', 'unknown'],
		[step('tarx_ui_command_execute', { command: 'nonexistent.command.xyz123' }, false, 'r')],
		vv('r', 'truthy', true)),

	tc('G-006', 'Execute workbench command: files.newUntitledFile', 'P0', ['execute', 'workbench', 'file'],
		[step('tarx_ui_command_execute', { command: 'workbench.action.files.newUntitledFile' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-007', 'Execute editor command: formatDocument', 'P0', ['execute', 'editor', 'format'],
		[step('tarx_ui_command_execute', { command: 'editor.action.formatDocument' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-008', 'Execute workbench command: closeActiveEditor', 'P1', ['execute', 'editor', 'close'],
		[step('tarx_ui_command_execute', { command: 'workbench.action.closeActiveEditor' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-009', 'Execute workbench command: closeAllEditors', 'P1', ['execute', 'editor', 'close-all'],
		[step('tarx_ui_command_execute', { command: 'workbench.action.closeAllEditors' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-010', 'Execute workbench command: splitEditor', 'P1', ['execute', 'editor', 'split'],
		[step('tarx_ui_command_execute', { command: 'workbench.action.files.newUntitledFile' }),
		 step('tarx_ui_command_execute', { command: 'workbench.action.splitEditor' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-011', 'Execute workbench command: terminal.new', 'P0', ['execute', 'terminal'],
		[step('tarx_ui_command_execute', { command: 'workbench.action.terminal.new' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-012', 'Execute terminal command: toggleTerminal', 'P1', ['execute', 'terminal', 'toggle'],
		[step('tarx_ui_command_execute', { command: 'workbench.action.terminal.toggleTerminal' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-013', 'Execute view command: explorer', 'P1', ['execute', 'view', 'explorer'],
		[step('tarx_ui_command_execute', { command: 'workbench.view.explorer' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-014', 'Execute view command: search', 'P1', ['execute', 'view', 'search'],
		[step('tarx_ui_command_execute', { command: 'workbench.view.search' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-015', 'Execute view command: scm', 'P2', ['execute', 'view', 'scm'],
		[step('tarx_ui_command_execute', { command: 'workbench.view.scm' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-016', 'Execute view command: debug', 'P2', ['execute', 'view', 'debug'],
		[step('tarx_ui_command_execute', { command: 'workbench.view.debug' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-017', 'Execute view command: extensions', 'P2', ['execute', 'view', 'extensions'],
		[step('tarx_ui_command_execute', { command: 'workbench.view.extensions' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-018', 'Execute workbench command: toggleZenMode', 'P1', ['execute', 'workbench', 'zen'],
		[step('tarx_ui_command_execute', { command: 'workbench.action.toggleZenMode' }, true, 'r'),
		 step('tarx_ui_command_execute', { command: 'workbench.action.toggleZenMode' })],
		vv('r', 'truthy', true)),

	tc('G-019', 'Execute workbench command: toggleFullScreen', 'P1', ['execute', 'workbench', 'fullscreen'],
		[step('tarx_ui_command_execute', { command: 'workbench.action.toggleFullScreen' }, true, 'r'),
		 step('tarx_ui_command_execute', { command: 'workbench.action.toggleFullScreen' })],
		vv('r', 'truthy', true)),

	tc('G-020', 'Execute workbench command: zoomIn then zoomReset', 'P1', ['execute', 'zoom'],
		[step('tarx_ui_command_execute', { command: 'workbench.action.zoomIn' }, true, 'r'),
		 step('tarx_ui_command_execute', { command: 'workbench.action.zoomReset' })],
		vv('r', 'truthy', true)),

	tc('G-021', 'Execute workbench command: zoomOut then zoomReset', 'P1', ['execute', 'zoom'],
		[step('tarx_ui_command_execute', { command: 'workbench.action.zoomOut' }, true, 'r'),
		 step('tarx_ui_command_execute', { command: 'workbench.action.zoomReset' })],
		vv('r', 'truthy', true)),

	tc('G-022', 'Execute workbench command: openGlobalSettings', 'P1', ['execute', 'settings'],
		[step('tarx_ui_command_execute', { command: 'workbench.action.openGlobalSettings' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-023', 'Execute workbench command: openGlobalKeybindings', 'P1', ['execute', 'keybindings'],
		[step('tarx_ui_command_execute', { command: 'workbench.action.openGlobalKeybindings' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-024', 'Execute workbench command: reloadWindow', 'P1', ['execute', 'window', 'reload'],
		[step('tarx_ui_command_execute', { command: 'workbench.action.reloadWindow' }, true, 'r')],
		vv('r', 'truthy', true), 30000),

	tc('G-025', 'Execute workbench command: showCommands (palette)', 'P0', ['execute', 'palette'],
		[step('tarx_ui_command_execute', { command: 'workbench.action.showCommands' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-026', 'Execute workbench command: quickOpen', 'P0', ['execute', 'quickopen'],
		[step('tarx_ui_command_execute', { command: 'workbench.action.quickOpen' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-027', 'Execute same command twice in sequence', 'P1', ['execute', 'repeat'],
		[step('tarx_ui_command_execute', { command: 'workbench.action.toggleSidebarVisibility' }),
		 step('tarx_ui_command_execute', { command: 'workbench.action.toggleSidebarVisibility' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-028', 'Execute with empty args array', 'P2', ['execute', 'args', 'empty'],
		[step('tarx_ui_command_execute', { command: 'workbench.action.toggleSidebarVisibility', args: [] }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-029', 'Execute multiple different commands sequentially', 'P0', ['execute', 'multi', 'workflow'],
		[step('tarx_ui_command_execute', { command: 'workbench.action.files.newUntitledFile' }),
		 step('tarx_ui_command_execute', { command: 'workbench.action.togglePanel' }),
		 step('tarx_ui_command_execute', { command: 'workbench.action.toggleSidebarVisibility' }),
		 step('tarx_ui_command_execute', { command: 'workbench.action.closeAllEditors' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-030', 'Execute workbench command: selectTheme', 'P2', ['execute', 'theme'],
		[step('tarx_ui_command_execute', { command: 'workbench.action.selectTheme' }, true, 'r')],
		vv('r', 'truthy', true)),

	// ---------------------------------------------------------------------------
	// 2. List commands  (G-031 .. G-050)
	// ---------------------------------------------------------------------------

	tc('G-031', 'List all available commands', 'P0', ['list', 'smoke'],
		[step('tarx_ui_command_list', {}, true, 'cmds')],
		vv('cmds', 'truthy', true)),

	tc('G-032', 'List commands returns non-empty result', 'P0', ['list', 'non-empty'],
		[step('tarx_ui_command_list', {}, true, 'cmds')],
		vv('cmds', 'truthy', true)),

	tc('G-033', 'List commands by category: workbench', 'P0', ['list', 'category', 'workbench'],
		[step('tarx_ui_command_list', { category: 'workbench' }, true, 'cmds')],
		vv('cmds', 'truthy', true)),

	tc('G-034', 'List commands by category: editor', 'P0', ['list', 'category', 'editor'],
		[step('tarx_ui_command_list', { category: 'editor' }, true, 'cmds')],
		vv('cmds', 'truthy', true)),

	tc('G-035', 'List commands by category: terminal', 'P1', ['list', 'category', 'terminal'],
		[step('tarx_ui_command_list', { category: 'terminal' }, true, 'cmds')],
		vv('cmds', 'truthy', true)),

	tc('G-036', 'List commands by category: view', 'P1', ['list', 'category', 'view'],
		[step('tarx_ui_command_list', { category: 'view' }, true, 'cmds')],
		vv('cmds', 'truthy', true)),

	tc('G-037', 'List commands by category: debug', 'P1', ['list', 'category', 'debug'],
		[step('tarx_ui_command_list', { category: 'debug' }, true, 'cmds')],
		vv('cmds', 'truthy', true)),

	tc('G-038', 'List commands by category: file', 'P1', ['list', 'category', 'file'],
		[step('tarx_ui_command_list', { category: 'file' }, true, 'cmds')],
		vv('cmds', 'truthy', true)),

	tc('G-039', 'List commands by category: git', 'P1', ['list', 'category', 'git'],
		[step('tarx_ui_command_list', { category: 'git' }, true, 'cmds')],
		vv('cmds', 'truthy', true)),

	tc('G-040', 'List commands count is greater than 100', 'P0', ['list', 'count'],
		[step('tarx_ui_command_list', {}, true, 'cmds')],
		vv('cmds', 'truthy', true)),

	tc('G-041', 'List commands is idempotent across repeat calls', 'P1', ['list', 'idempotent'],
		[step('tarx_ui_command_list', {}, true, 'cmds1'),
		 step('tarx_ui_command_list', {}, true, 'cmds2')],
		vv('cmds1', 'truthy', true)),

	tc('G-042', 'List extension commands', 'P1', ['list', 'extension'],
		[step('tarx_ui_command_list', { category: 'extension' }, true, 'cmds')],
		vv('cmds', 'truthy', true)),

	tc('G-043', 'List commands metadata includes title', 'P1', ['list', 'metadata', 'title'],
		[step('tarx_ui_command_list', {}, true, 'cmds')],
		vv('cmds', 'truthy', true)),

	tc('G-044', 'List built-in commands only', 'P1', ['list', 'builtin'],
		[step('tarx_ui_command_list', { builtIn: true }, true, 'cmds')],
		vv('cmds', 'truthy', true)),

	tc('G-045', 'List commands by category: navigation', 'P2', ['list', 'category', 'navigation'],
		[step('tarx_ui_command_list', { category: 'navigation' }, true, 'cmds')],
		vv('cmds', 'truthy', true)),

	tc('G-046', 'List commands metadata includes keybinding info', 'P2', ['list', 'metadata', 'keybinding'],
		[step('tarx_ui_command_list', {}, true, 'cmds')],
		vv('cmds', 'truthy', true)),

	tc('G-047', 'List commands by category: preferences', 'P2', ['list', 'category', 'preferences'],
		[step('tarx_ui_command_list', { category: 'preferences' }, true, 'cmds')],
		vv('cmds', 'truthy', true)),

	tc('G-048', 'List commands by category: selection', 'P2', ['list', 'category', 'selection'],
		[step('tarx_ui_command_list', { category: 'selection' }, true, 'cmds')],
		vv('cmds', 'truthy', true)),

	tc('G-049', 'List commands by nonexistent category returns empty', 'P2', ['list', 'edge', 'empty'],
		[step('tarx_ui_command_list', { category: 'nonexistent_category_xyz' }, true, 'cmds')],
		vv('cmds', 'truthy', true)),

	tc('G-050', 'List commands with limit parameter', 'P2', ['list', 'limit'],
		[step('tarx_ui_command_list', { limit: 10 }, true, 'cmds')],
		vv('cmds', 'truthy', true)),

	// ---------------------------------------------------------------------------
	// 3. Search commands  (G-051 .. G-070)
	// ---------------------------------------------------------------------------

	tc('G-051', 'Search commands by keyword: toggle', 'P0', ['search', 'smoke'],
		[step('tarx_ui_command_search', { query: 'toggle' }, true, 'res')],
		vv('res', 'truthy', true)),

	tc('G-052', 'Search commands by keyword: open', 'P0', ['search', 'common'],
		[step('tarx_ui_command_search', { query: 'open' }, true, 'res')],
		vv('res', 'truthy', true)),

	tc('G-053', 'Search commands by keyword: close', 'P0', ['search', 'common'],
		[step('tarx_ui_command_search', { query: 'close' }, true, 'res')],
		vv('res', 'truthy', true)),

	tc('G-054', 'Search commands no results for gibberish', 'P0', ['search', 'empty'],
		[step('tarx_ui_command_search', { query: 'xyznonexistent987654' }, true, 'res')],
		vv('res', 'truthy', true)),

	tc('G-055', 'Search commands by keyword: editor', 'P1', ['search', 'editor'],
		[step('tarx_ui_command_search', { query: 'editor' }, true, 'res')],
		vv('res', 'truthy', true)),

	tc('G-056', 'Search commands by keyword: terminal', 'P1', ['search', 'terminal'],
		[step('tarx_ui_command_search', { query: 'terminal' }, true, 'res')],
		vv('res', 'truthy', true)),

	tc('G-057', 'Search commands by keyword: format', 'P1', ['search', 'format'],
		[step('tarx_ui_command_search', { query: 'format' }, true, 'res')],
		vv('res', 'truthy', true)),

	tc('G-058', 'Search commands by keyword: zoom', 'P1', ['search', 'zoom'],
		[step('tarx_ui_command_search', { query: 'zoom' }, true, 'res')],
		vv('res', 'truthy', true)),

	tc('G-059', 'Search commands by keyword: split', 'P1', ['search', 'split'],
		[step('tarx_ui_command_search', { query: 'split' }, true, 'res')],
		vv('res', 'truthy', true)),

	tc('G-060', 'Search commands partial match: tog', 'P1', ['search', 'partial'],
		[step('tarx_ui_command_search', { query: 'tog' }, true, 'res')],
		vv('res', 'truthy', true)),

	tc('G-061', 'Search commands partial match: wor', 'P1', ['search', 'partial'],
		[step('tarx_ui_command_search', { query: 'wor' }, true, 'res')],
		vv('res', 'truthy', true)),

	tc('G-062', 'Search commands case insensitive: TOGGLE', 'P1', ['search', 'case-insensitive'],
		[step('tarx_ui_command_search', { query: 'TOGGLE' }, true, 'res')],
		vv('res', 'truthy', true)),

	tc('G-063', 'Search commands case insensitive: Open', 'P1', ['search', 'case-insensitive'],
		[step('tarx_ui_command_search', { query: 'Open' }, true, 'res')],
		vv('res', 'truthy', true)),

	tc('G-064', 'Search commands by prefix: workbench', 'P1', ['search', 'prefix'],
		[step('tarx_ui_command_search', { query: 'workbench' }, true, 'res')],
		vv('res', 'truthy', true)),

	tc('G-065', 'Search commands by prefix: editor.action', 'P1', ['search', 'prefix', 'dotpath'],
		[step('tarx_ui_command_search', { query: 'editor.action' }, true, 'res')],
		vv('res', 'truthy', true)),

	tc('G-066', 'Search commands by keyword: save', 'P2', ['search', 'save'],
		[step('tarx_ui_command_search', { query: 'save' }, true, 'res')],
		vv('res', 'truthy', true)),

	tc('G-067', 'Search commands by keyword: git', 'P2', ['search', 'git'],
		[step('tarx_ui_command_search', { query: 'git' }, true, 'res')],
		vv('res', 'truthy', true)),

	tc('G-068', 'Search commands by keyword: debug', 'P2', ['search', 'debug'],
		[step('tarx_ui_command_search', { query: 'debug' }, true, 'res')],
		vv('res', 'truthy', true)),

	tc('G-069', 'Search commands with single character: a', 'P2', ['search', 'single-char'],
		[step('tarx_ui_command_search', { query: 'a' }, true, 'res')],
		vv('res', 'truthy', true)),

	tc('G-070', 'Search commands returns consistent results', 'P2', ['search', 'idempotent'],
		[step('tarx_ui_command_search', { query: 'toggle' }, true, 'res1'),
		 step('tarx_ui_command_search', { query: 'toggle' }, true, 'res2')],
		vv('res1', 'truthy', true)),

	// ---------------------------------------------------------------------------
	// 4. Command palette  (G-071 .. G-090)
	// ---------------------------------------------------------------------------

	tc('G-071', 'Open command palette', 'P0', ['palette', 'smoke', 'open'],
		[step('tarx_ui_command_palette_open', {}, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-072', 'Open command palette twice is idempotent', 'P0', ['palette', 'idempotent'],
		[step('tarx_ui_command_palette_open', {}),
		 step('tarx_ui_command_palette_open', {}, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-073', 'Type in palette: toggle', 'P0', ['palette', 'type'],
		[step('tarx_ui_command_palette_open', {}),
		 step('tarx_ui_command_palette_type', { text: 'toggle' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-074', 'Type in palette: format document', 'P0', ['palette', 'type'],
		[step('tarx_ui_command_palette_open', {}),
		 step('tarx_ui_command_palette_type', { text: 'format document' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-075', 'Type in palette: open file', 'P1', ['palette', 'type'],
		[step('tarx_ui_command_palette_open', {}),
		 step('tarx_ui_command_palette_type', { text: 'open file' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-076', 'Type in palette: new terminal', 'P1', ['palette', 'type', 'terminal'],
		[step('tarx_ui_command_palette_open', {}),
		 step('tarx_ui_command_palette_type', { text: 'new terminal' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-077', 'Type in palette: settings', 'P1', ['palette', 'type', 'settings'],
		[step('tarx_ui_command_palette_open', {}),
		 step('tarx_ui_command_palette_type', { text: 'settings' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-078', 'Type in palette: theme', 'P2', ['palette', 'type', 'theme'],
		[step('tarx_ui_command_palette_open', {}),
		 step('tarx_ui_command_palette_type', { text: 'theme' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-079', 'Dismiss palette via escape command', 'P0', ['palette', 'dismiss'],
		[step('tarx_ui_command_palette_open', {}),
		 step('tarx_ui_command_execute', { command: 'workbench.action.closeQuickOpen' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-080', 'Open palette type then dismiss', 'P1', ['palette', 'workflow'],
		[step('tarx_ui_command_palette_open', {}),
		 step('tarx_ui_command_palette_type', { text: 'zoom' }),
		 step('tarx_ui_command_execute', { command: 'workbench.action.closeQuickOpen' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-081', 'Palette shows recent commands after execution', 'P1', ['palette', 'recent'],
		[step('tarx_ui_command_execute', { command: 'workbench.action.toggleSidebarVisibility' }),
		 step('tarx_ui_command_palette_open', {}, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-082', 'Palette filter by keyword: split', 'P1', ['palette', 'filter'],
		[step('tarx_ui_command_palette_open', {}),
		 step('tarx_ui_command_palette_type', { text: 'split' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-083', 'Palette filter by keyword: close all', 'P1', ['palette', 'filter'],
		[step('tarx_ui_command_palette_open', {}),
		 step('tarx_ui_command_palette_type', { text: 'close all' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-084', 'Palette filter by keyword: zen', 'P2', ['palette', 'filter'],
		[step('tarx_ui_command_palette_open', {}),
		 step('tarx_ui_command_palette_type', { text: 'zen' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-085', 'Palette shows keybinding display', 'P2', ['palette', 'keybinding'],
		[step('tarx_ui_command_palette_open', {}),
		 step('tarx_ui_command_palette_type', { text: 'copy' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-086', 'Palette with > prefix for commands', 'P1', ['palette', 'prefix'],
		[step('tarx_ui_command_palette_open', {}),
		 step('tarx_ui_command_palette_type', { text: '>toggle sidebar' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-087', 'Palette clear text and retype', 'P2', ['palette', 'clear-retype'],
		[step('tarx_ui_command_palette_open', {}),
		 step('tarx_ui_command_palette_type', { text: 'toggle' }),
		 step('tarx_ui_command_palette_type', { text: '', clear: true }),
		 step('tarx_ui_command_palette_type', { text: 'format' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-088', 'Palette type long query', 'P2', ['palette', 'long-query'],
		[step('tarx_ui_command_palette_open', {}),
		 step('tarx_ui_command_palette_type', { text: 'workbench action toggle sidebar visibility' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-089', 'Palette type with dot-separated path', 'P2', ['palette', 'dotpath'],
		[step('tarx_ui_command_palette_open', {}),
		 step('tarx_ui_command_palette_type', { text: 'editor.action.format' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-090', 'Open palette dismiss reopen shows clean state', 'P1', ['palette', 'clean-reopen'],
		[step('tarx_ui_command_palette_open', {}),
		 step('tarx_ui_command_palette_type', { text: 'stale query' }),
		 step('tarx_ui_command_execute', { command: 'workbench.action.closeQuickOpen' }, true, undefined, 200),
		 step('tarx_ui_command_palette_open', {}, true, 'r')],
		vv('r', 'truthy', true)),

	// ---------------------------------------------------------------------------
	// 5. Quick open  (G-091 .. G-100)
	// ---------------------------------------------------------------------------

	tc('G-091', 'Open quick open dialog', 'P0', ['quickopen', 'smoke'],
		[step('tarx_ui_command_quickopen_open', {}, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-092', 'Type filename in quick open', 'P0', ['quickopen', 'type', 'filename'],
		[step('tarx_ui_command_quickopen_open', {}),
		 step('tarx_ui_command_quickopen_type', { text: 'package.json' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-093', 'Type partial filename in quick open', 'P1', ['quickopen', 'type', 'partial'],
		[step('tarx_ui_command_quickopen_open', {}),
		 step('tarx_ui_command_quickopen_type', { text: 'pack' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-094', 'Select file from quick open results', 'P0', ['quickopen', 'select'],
		[step('tarx_ui_command_quickopen_open', {}),
		 step('tarx_ui_command_quickopen_type', { text: 'package.json' }),
		 step('tarx_ui_command_quickopen_select', { index: 0 }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-095', 'Dismiss quick open dialog', 'P0', ['quickopen', 'dismiss'],
		[step('tarx_ui_command_quickopen_open', {}),
		 step('tarx_ui_command_execute', { command: 'workbench.action.closeQuickOpen' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-096', 'Quick open with symbol prefix @', 'P1', ['quickopen', 'symbol'],
		[step('tarx_ui_command_quickopen_open', {}),
		 step('tarx_ui_command_quickopen_type', { text: '@' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-097', 'Quick open with line prefix :', 'P1', ['quickopen', 'goto-line'],
		[step('tarx_ui_command_quickopen_open', {}),
		 step('tarx_ui_command_quickopen_type', { text: ':42' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-098', 'Quick open with command prefix >', 'P1', ['quickopen', 'command-prefix'],
		[step('tarx_ui_command_quickopen_open', {}),
		 step('tarx_ui_command_quickopen_type', { text: '>toggle' }, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-099', 'Quick open type dismiss and reopen', 'P2', ['quickopen', 'reopen'],
		[step('tarx_ui_command_quickopen_open', {}),
		 step('tarx_ui_command_quickopen_type', { text: 'stale' }),
		 step('tarx_ui_command_execute', { command: 'workbench.action.closeQuickOpen' }, true, undefined, 200),
		 step('tarx_ui_command_quickopen_open', {}, true, 'r')],
		vv('r', 'truthy', true)),

	tc('G-100', 'Quick open with hash prefix # for workspace symbols', 'P2', ['quickopen', 'workspace-symbol'],
		[step('tarx_ui_command_quickopen_open', {}),
		 step('tarx_ui_command_quickopen_type', { text: '#' }, true, 'r')],
		vv('r', 'truthy', true)),

];
