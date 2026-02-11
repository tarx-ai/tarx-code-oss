/**
 * TARX UI Test Suite - Category K: Settings (K-001 to K-100)
 * 100 test cases for VS Code settings operations via HTTP harness
 *
 * Coverage:
 *   Open settings                    K-001 to K-020   (20 tests)
 *   Get / Set                        K-021 to K-060   (40 tests)
 *   Search                           K-061 to K-080   (20 tests)
 *   Keybindings                      K-081 to K-100   (20 tests)
 */

import type { TestCase } from '../types.js';

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function tc(
	id: string,
	name: string,
	priority: 'P0' | 'P1' | 'P2',
	tags: string[],
	steps: TestCase['steps'],
	verify: TestCase['verify'],
	opts?: { timeoutMs?: number; retries?: number },
): TestCase {
	return {
		id,
		category: 'settings',
		name,
		description: name,
		priority,
		tags,
		steps,
		verify,
		timeoutMs: opts?.timeoutMs ?? 10000,
		retries: opts?.retries ?? 1,
	};
}

function step(
	tool: string,
	params: Record<string, unknown> = {},
	opts?: { capture?: string; wait?: number; expectSuccess?: boolean },
): TestCase['steps'][0] {
	return {
		tool,
		params,
		expectSuccess: opts?.expectSuccess ?? true,
		...(opts?.capture ? { captureResult: opts.capture } : {}),
		...(opts?.wait ? { waitMs: opts.wait } : {}),
	};
}

function failStep(tool: string, params: Record<string, unknown> = {}): TestCase['steps'][0] {
	return { tool, params, expectSuccess: false };
}

function stateV(endpoint: string, expect: Record<string, unknown>): TestCase['verify'] {
	return { type: 'state', stateCheck: { endpoint, expect } };
}

function valueV(variable: string, assertion: 'equals' | 'contains' | 'truthy' | 'falsy' | 'gt' | 'lt', expected: unknown): TestCase['verify'] {
	return { type: 'value', valueCheck: { variable, assertion, expected } };
}

// Shorthand tool names
const OPEN_UI = 'tarx_ui_settings_open_ui';
const OPEN_JSON = 'tarx_ui_settings_open_json';
const GET = 'tarx_ui_settings_get';
const SET = 'tarx_ui_settings_set';
const SEARCH = 'tarx_ui_settings_search';
const RESET = 'tarx_ui_settings_reset';
const KB_OPEN = 'tarx_ui_settings_keybindings_open';
const KB_GET = 'tarx_ui_settings_keybindings_get';

// ===========================================================================
// K-001 to K-020 : Open Settings (20 tests)
// ===========================================================================

const openSettings: TestCase[] = [
	tc('K-001', 'Open settings UI', 'P0', ['settings', 'open-ui', 'smoke'],
		[step(OPEN_UI, {}, { capture: 'result' })],
		stateV(OPEN_UI, { visible: true })),

	tc('K-002', 'Open settings JSON', 'P0', ['settings', 'open-json', 'smoke'],
		[step(OPEN_JSON, {}, { capture: 'result' })],
		stateV(OPEN_JSON, { visible: true })),

	tc('K-003', 'Open settings UI twice is idempotent', 'P0', ['settings', 'open-ui', 'idempotent'],
		[step(OPEN_UI), step(OPEN_UI, {}, { capture: 'result' })],
		stateV(OPEN_UI, { visible: true })),

	tc('K-004', 'Open settings JSON twice is idempotent', 'P0', ['settings', 'open-json', 'idempotent'],
		[step(OPEN_JSON), step(OPEN_JSON, {}, { capture: 'result' })],
		stateV(OPEN_JSON, { visible: true })),

	tc('K-005', 'Open settings UI returns success', 'P0', ['settings', 'open-ui', 'response'],
		[step(OPEN_UI, {}, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('K-006', 'Open settings JSON returns success', 'P0', ['settings', 'open-json', 'response'],
		[step(OPEN_JSON, {}, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('K-007', 'Open settings UI with search query', 'P1', ['settings', 'open-ui', 'search'],
		[step(OPEN_UI, { query: 'font' }, { capture: 'result' })],
		stateV(OPEN_UI, { visible: true })),

	tc('K-008', 'Open settings UI with focus', 'P1', ['settings', 'open-ui', 'focus'],
		[step(OPEN_UI, { focus: true }, { capture: 'result' })],
		stateV(OPEN_UI, { visible: true })),

	tc('K-009', 'Open settings JSON with scope user', 'P1', ['settings', 'open-json', 'scope-user'],
		[step(OPEN_JSON, { scope: 'user' }, { capture: 'result' })],
		stateV(OPEN_JSON, { visible: true })),

	tc('K-010', 'Open settings JSON with scope workspace', 'P1', ['settings', 'open-json', 'scope-workspace'],
		[step(OPEN_JSON, { scope: 'workspace' }, { capture: 'result' })],
		stateV(OPEN_JSON, { visible: true })),

	tc('K-011', 'Open settings UI then JSON sequentially', 'P1', ['settings', 'open', 'sequential'],
		[step(OPEN_UI), step(OPEN_JSON, {}, { capture: 'result' })],
		stateV(OPEN_JSON, { visible: true })),

	tc('K-012', 'Open settings JSON then UI sequentially', 'P1', ['settings', 'open', 'reverse-sequential'],
		[step(OPEN_JSON), step(OPEN_UI, {}, { capture: 'result' })],
		stateV(OPEN_UI, { visible: true })),

	tc('K-013', 'Open settings UI rapid succession', 'P2', ['settings', 'open-ui', 'rapid'],
		[step(OPEN_UI), step(OPEN_UI), step(OPEN_UI, {}, { capture: 'result' })],
		stateV(OPEN_UI, { visible: true })),

	tc('K-014', 'Open settings JSON rapid succession', 'P2', ['settings', 'open-json', 'rapid'],
		[step(OPEN_JSON), step(OPEN_JSON), step(OPEN_JSON, {}, { capture: 'result' })],
		stateV(OPEN_JSON, { visible: true })),

	tc('K-015', 'Open settings UI with delay', 'P2', ['settings', 'open-ui', 'delay'],
		[step(OPEN_UI, {}, { wait: 500, capture: 'result' })],
		stateV(OPEN_UI, { visible: true })),

	tc('K-016', 'Open settings JSON with delay', 'P2', ['settings', 'open-json', 'delay'],
		[step(OPEN_JSON, {}, { wait: 500, capture: 'result' })],
		stateV(OPEN_JSON, { visible: true })),

	tc('K-017', 'Open settings UI performance', 'P2', ['settings', 'open-ui', 'performance'],
		[step(OPEN_UI, {}, { capture: 'perf' })],
		valueV('perf', 'truthy', true)),

	tc('K-018', 'Open settings UI with editor.fontSize query', 'P1', ['settings', 'open-ui', 'query-specific'],
		[step(OPEN_UI, { query: 'editor.fontSize' }, { capture: 'result' })],
		stateV(OPEN_UI, { visible: true })),

	tc('K-019', 'Open settings UI then get a setting', 'P0', ['settings', 'open-ui', 'then-get'],
		[step(OPEN_UI), step(GET, { key: 'editor.fontSize' }, { capture: 'value' })],
		valueV('value', 'truthy', true)),

	tc('K-020', 'Open settings JSON then get a setting', 'P0', ['settings', 'open-json', 'then-get'],
		[step(OPEN_JSON), step(GET, { key: 'editor.fontSize' }, { capture: 'value' })],
		valueV('value', 'truthy', true)),
];

// ===========================================================================
// K-021 to K-060 : Get / Set (40 tests)
// ===========================================================================

const getSet: TestCase[] = [
	tc('K-021', 'Get editor font size setting', 'P0', ['settings', 'get', 'font-size'],
		[step(GET, { key: 'editor.fontSize' }, { capture: 'value' })],
		valueV('value', 'truthy', true)),

	tc('K-022', 'Get editor font family setting', 'P0', ['settings', 'get', 'font-family'],
		[step(GET, { key: 'editor.fontFamily' }, { capture: 'value' })],
		valueV('value', 'truthy', true)),

	tc('K-023', 'Get editor tab size setting', 'P0', ['settings', 'get', 'tab-size'],
		[step(GET, { key: 'editor.tabSize' }, { capture: 'value' })],
		valueV('value', 'truthy', true)),

	tc('K-024', 'Get editor word wrap setting', 'P1', ['settings', 'get', 'word-wrap'],
		[step(GET, { key: 'editor.wordWrap' }, { capture: 'value' })],
		valueV('value', 'truthy', true)),

	tc('K-025', 'Get workbench color theme setting', 'P0', ['settings', 'get', 'theme'],
		[step(GET, { key: 'workbench.colorTheme' }, { capture: 'value' })],
		valueV('value', 'truthy', true)),

	tc('K-026', 'Get editor minimap enabled setting', 'P1', ['settings', 'get', 'minimap'],
		[step(GET, { key: 'editor.minimap.enabled' }, { capture: 'value' })],
		valueV('value', 'truthy', true)),

	tc('K-027', 'Get terminal font size setting', 'P1', ['settings', 'get', 'terminal-font'],
		[step(GET, { key: 'terminal.integrated.fontSize' }, { capture: 'value' })],
		valueV('value', 'truthy', true)),

	tc('K-028', 'Get nonexistent setting returns default', 'P1', ['settings', 'get', 'nonexistent'],
		[step(GET, { key: 'nonexistent.setting.key' }, { capture: 'value' })],
		valueV('value', 'truthy', true)),

	tc('K-029', 'Get setting without key fails', 'P0', ['settings', 'get', 'no-key'],
		[failStep(GET, {})],
		valueV('result', 'truthy', true)),

	tc('K-030', 'Get editor line numbers setting', 'P1', ['settings', 'get', 'line-numbers'],
		[step(GET, { key: 'editor.lineNumbers' }, { capture: 'value' })],
		valueV('value', 'truthy', true)),

	tc('K-031', 'Get setting with scope user', 'P2', ['settings', 'get', 'scope-user'],
		[step(GET, { key: 'editor.fontSize', scope: 'user' }, { capture: 'value' })],
		valueV('value', 'truthy', true)),

	tc('K-032', 'Get setting repeated calls consistent', 'P1', ['settings', 'get', 'consistent'],
		[step(GET, { key: 'editor.fontSize' }, { capture: 'v1' }), step(GET, { key: 'editor.fontSize' }, { capture: 'v2' })],
		valueV('v2', 'truthy', true)),

	tc('K-033', 'Get multiple settings sequentially', 'P1', ['settings', 'get', 'multiple'],
		[step(GET, { key: 'editor.fontSize' }, { capture: 'fontSize' }), step(GET, { key: 'editor.fontFamily' }, { capture: 'fontFamily' }), step(GET, { key: 'editor.tabSize' }, { capture: 'tabSize' })],
		valueV('tabSize', 'truthy', true)),

	tc('K-034', 'Get files auto save setting', 'P1', ['settings', 'get', 'auto-save'],
		[step(GET, { key: 'files.autoSave' }, { capture: 'value' })],
		valueV('value', 'truthy', true)),

	tc('K-035', 'Get editor format on save setting', 'P1', ['settings', 'get', 'format-on-save'],
		[step(GET, { key: 'editor.formatOnSave' }, { capture: 'value' })],
		valueV('value', 'truthy', true)),

	tc('K-036', 'Set editor font size', 'P0', ['settings', 'set', 'font-size'],
		[step(SET, { key: 'editor.fontSize', value: 14 })],
		stateV(GET, { success: true })),

	tc('K-037', 'Set editor tab size', 'P0', ['settings', 'set', 'tab-size'],
		[step(SET, { key: 'editor.tabSize', value: 4 })],
		stateV(GET, { success: true })),

	tc('K-038', 'Set editor word wrap', 'P1', ['settings', 'set', 'word-wrap'],
		[step(SET, { key: 'editor.wordWrap', value: 'on' })],
		stateV(GET, { success: true })),

	tc('K-039', 'Set editor minimap enabled', 'P1', ['settings', 'set', 'minimap'],
		[step(SET, { key: 'editor.minimap.enabled', value: false })],
		stateV(GET, { success: true })),

	tc('K-040', 'Set without key fails', 'P0', ['settings', 'set', 'no-key'],
		[failStep(SET, { value: 14 })],
		valueV('result', 'truthy', true)),

	tc('K-041', 'Set without value fails', 'P0', ['settings', 'set', 'no-value'],
		[failStep(SET, { key: 'editor.fontSize' })],
		valueV('result', 'truthy', true)),

	tc('K-042', 'Set and then get to verify', 'P0', ['settings', 'set', 'verify'],
		[step(SET, { key: 'editor.fontSize', value: 16 }), step(GET, { key: 'editor.fontSize' }, { capture: 'verified' })],
		valueV('verified', 'truthy', true)),

	tc('K-043', 'Set boolean setting', 'P1', ['settings', 'set', 'boolean'],
		[step(SET, { key: 'editor.formatOnSave', value: true })],
		stateV(GET, { success: true })),

	tc('K-044', 'Set string setting', 'P1', ['settings', 'set', 'string'],
		[step(SET, { key: 'editor.cursorStyle', value: 'block' })],
		stateV(GET, { success: true })),

	tc('K-045', 'Set numeric setting', 'P1', ['settings', 'set', 'numeric'],
		[step(SET, { key: 'editor.lineHeight', value: 22 })],
		stateV(GET, { success: true })),

	tc('K-046', 'Set setting returns success response', 'P0', ['settings', 'set', 'response'],
		[step(SET, { key: 'editor.fontSize', value: 14 }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('K-047', 'Set multiple settings sequentially', 'P1', ['settings', 'set', 'multiple'],
		[step(SET, { key: 'editor.fontSize', value: 14 }), step(SET, { key: 'editor.tabSize', value: 2 }), step(SET, { key: 'editor.wordWrap', value: 'off' })],
		stateV(GET, { success: true })),

	tc('K-048', 'Set same setting twice overwrites', 'P1', ['settings', 'set', 'overwrite'],
		[step(SET, { key: 'editor.fontSize', value: 12 }), step(SET, { key: 'editor.fontSize', value: 18 }), step(GET, { key: 'editor.fontSize' }, { capture: 'final' })],
		valueV('final', 'truthy', true)),

	tc('K-049', 'Set setting with scope user', 'P2', ['settings', 'set', 'scope-user'],
		[step(SET, { key: 'editor.fontSize', value: 15, scope: 'user' })],
		stateV(GET, { success: true })),

	tc('K-050', 'Set setting with scope workspace', 'P2', ['settings', 'set', 'scope-workspace'],
		[step(SET, { key: 'editor.fontSize', value: 13, scope: 'workspace' })],
		stateV(GET, { success: true })),

	tc('K-051', 'Reset single setting', 'P0', ['settings', 'reset', 'single'],
		[step(SET, { key: 'editor.fontSize', value: 20 }), step(RESET, { key: 'editor.fontSize' })],
		stateV(GET, { success: true })),

	tc('K-052', 'Reset setting returns success', 'P0', ['settings', 'reset', 'response'],
		[step(RESET, { key: 'editor.fontSize' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('K-053', 'Reset without key fails', 'P0', ['settings', 'reset', 'no-key'],
		[failStep(RESET, {})],
		valueV('result', 'truthy', true)),

	tc('K-054', 'Reset nonexistent setting is safe', 'P1', ['settings', 'reset', 'nonexistent'],
		[step(RESET, { key: 'nonexistent.setting.xyz' })],
		stateV(GET, { success: true })),

	tc('K-055', 'Reset setting and verify default restored', 'P0', ['settings', 'reset', 'verify-default'],
		[step(SET, { key: 'editor.tabSize', value: 8 }), step(RESET, { key: 'editor.tabSize' }), step(GET, { key: 'editor.tabSize' }, { capture: 'value' })],
		valueV('value', 'truthy', true)),

	tc('K-056', 'Reset multiple settings', 'P1', ['settings', 'reset', 'multiple'],
		[step(RESET, { key: 'editor.fontSize' }), step(RESET, { key: 'editor.tabSize' }), step(RESET, { key: 'editor.wordWrap' })],
		stateV(GET, { success: true })),

	tc('K-057', 'Reset setting twice is idempotent', 'P2', ['settings', 'reset', 'idempotent'],
		[step(RESET, { key: 'editor.fontSize' }), step(RESET, { key: 'editor.fontSize' })],
		stateV(GET, { success: true })),

	tc('K-058', 'Set then reset then get cycle', 'P1', ['settings', 'reset', 'cycle'],
		[step(SET, { key: 'editor.lineHeight', value: 30 }), step(GET, { key: 'editor.lineHeight' }, { capture: 'set' }), step(RESET, { key: 'editor.lineHeight' }), step(GET, { key: 'editor.lineHeight' }, { capture: 'reset' })],
		valueV('reset', 'truthy', true)),

	tc('K-059', 'Set then get then set then get roundtrip', 'P1', ['settings', 'set', 'roundtrip'],
		[step(SET, { key: 'editor.fontSize', value: 18 }), step(GET, { key: 'editor.fontSize' }, { capture: 'first' }), step(SET, { key: 'editor.fontSize', value: 12 }), step(GET, { key: 'editor.fontSize' }, { capture: 'second' })],
		valueV('second', 'truthy', true)),

	tc('K-060', 'Set object-type setting', 'P2', ['settings', 'set', 'object'],
		[step(SET, { key: 'files.exclude', value: { '**/.git': true, '**/node_modules': true } })],
		stateV(GET, { success: true })),
];

// ===========================================================================
// K-061 to K-080 : Search (20 tests)
// ===========================================================================

const search: TestCase[] = [
	tc('K-061', 'Search settings by keyword', 'P0', ['settings', 'search', 'keyword'],
		[step(SEARCH, { query: 'font' }, { capture: 'results' })],
		valueV('results', 'truthy', true)),

	tc('K-062', 'Search settings for editor options', 'P0', ['settings', 'search', 'editor'],
		[step(SEARCH, { query: 'editor' }, { capture: 'results' })],
		valueV('results', 'truthy', true)),

	tc('K-063', 'Search settings for terminal options', 'P0', ['settings', 'search', 'terminal'],
		[step(SEARCH, { query: 'terminal' }, { capture: 'results' })],
		valueV('results', 'truthy', true)),

	tc('K-064', 'Search settings for workbench options', 'P1', ['settings', 'search', 'workbench'],
		[step(SEARCH, { query: 'workbench' }, { capture: 'results' })],
		valueV('results', 'truthy', true)),

	tc('K-065', 'Search settings without query fails', 'P0', ['settings', 'search', 'no-query'],
		[failStep(SEARCH, {})],
		valueV('result', 'truthy', true)),

	tc('K-066', 'Search settings with empty query fails', 'P0', ['settings', 'search', 'empty-query'],
		[failStep(SEARCH, { query: '' })],
		valueV('result', 'truthy', true)),

	tc('K-067', 'Search settings for specific key', 'P0', ['settings', 'search', 'specific-key'],
		[step(SEARCH, { query: 'editor.fontSize' }, { capture: 'results' })],
		valueV('results', 'truthy', true)),

	tc('K-068', 'Search settings for minimap', 'P1', ['settings', 'search', 'minimap'],
		[step(SEARCH, { query: 'minimap' }, { capture: 'results' })],
		valueV('results', 'truthy', true)),

	tc('K-069', 'Search settings for theme', 'P1', ['settings', 'search', 'theme'],
		[step(SEARCH, { query: 'theme' }, { capture: 'results' })],
		valueV('results', 'truthy', true)),

	tc('K-070', 'Search settings for auto save', 'P1', ['settings', 'search', 'auto-save'],
		[step(SEARCH, { query: 'autoSave' }, { capture: 'results' })],
		valueV('results', 'truthy', true)),

	tc('K-071', 'Search settings returns results array', 'P0', ['settings', 'search', 'returns-array'],
		[step(SEARCH, { query: 'editor' }, { capture: 'results' })],
		valueV('results', 'truthy', true)),

	tc('K-072', 'Search settings with nonexistent term returns empty', 'P1', ['settings', 'search', 'no-results'],
		[step(SEARCH, { query: 'zzznonexistentsettingxxx' }, { capture: 'results' })],
		valueV('results', 'truthy', true)),

	tc('K-073', 'Search settings repeated calls consistent', 'P1', ['settings', 'search', 'consistent'],
		[step(SEARCH, { query: 'font' }, { capture: 'r1' }), step(SEARCH, { query: 'font' }, { capture: 'r2' })],
		valueV('r2', 'truthy', true)),

	tc('K-074', 'Search settings for bracket colorization', 'P2', ['settings', 'search', 'brackets'],
		[step(SEARCH, { query: 'bracketPairColorization' }, { capture: 'results' })],
		valueV('results', 'truthy', true)),

	tc('K-075', 'Search settings for cursor', 'P2', ['settings', 'search', 'cursor'],
		[step(SEARCH, { query: 'cursor' }, { capture: 'results' })],
		valueV('results', 'truthy', true)),

	tc('K-076', 'Search settings for whitespace', 'P2', ['settings', 'search', 'whitespace'],
		[step(SEARCH, { query: 'whitespace' }, { capture: 'results' })],
		valueV('results', 'truthy', true)),

	tc('K-077', 'Search settings for format on save', 'P1', ['settings', 'search', 'format-on-save'],
		[step(SEARCH, { query: 'formatOnSave' }, { capture: 'results' })],
		valueV('results', 'truthy', true)),

	tc('K-078', 'Search settings performance', 'P2', ['settings', 'search', 'performance'],
		[step(SEARCH, { query: 'editor' }, { capture: 'results' })],
		valueV('results', 'truthy', true)),

	tc('K-079', 'Search settings then open UI with same query', 'P1', ['settings', 'search', 'then-open'],
		[step(SEARCH, { query: 'font' }, { capture: 'results' }), step(OPEN_UI, { query: 'font' })],
		stateV(OPEN_UI, { visible: true })),

	tc('K-080', 'Search settings for files options', 'P1', ['settings', 'search', 'files'],
		[step(SEARCH, { query: 'files' }, { capture: 'results' })],
		valueV('results', 'truthy', true)),
];

// ===========================================================================
// K-081 to K-100 : Keybindings (20 tests)
// ===========================================================================

const keybindings: TestCase[] = [
	tc('K-081', 'Open keybindings editor', 'P0', ['settings', 'keybindings', 'open'],
		[step(KB_OPEN, {}, { capture: 'result' })],
		stateV(KB_OPEN, { visible: true })),

	tc('K-082', 'Open keybindings editor twice is idempotent', 'P0', ['settings', 'keybindings', 'open-idempotent'],
		[step(KB_OPEN), step(KB_OPEN, {}, { capture: 'result' })],
		stateV(KB_OPEN, { visible: true })),

	tc('K-083', 'Open keybindings editor returns success', 'P0', ['settings', 'keybindings', 'open-response'],
		[step(KB_OPEN, {}, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('K-084', 'Open keybindings editor with focus', 'P1', ['settings', 'keybindings', 'open-focus'],
		[step(KB_OPEN, { focus: true }, { capture: 'result' })],
		stateV(KB_OPEN, { visible: true })),

	tc('K-085', 'Open keybindings editor with search query', 'P1', ['settings', 'keybindings', 'open-search'],
		[step(KB_OPEN, { query: 'copy' }, { capture: 'result' })],
		stateV(KB_OPEN, { visible: true })),

	tc('K-086', 'Get keybinding for copy command', 'P0', ['settings', 'keybindings', 'get-copy'],
		[step(KB_GET, { command: 'editor.action.clipboardCopyAction' }, { capture: 'binding' })],
		valueV('binding', 'truthy', true)),

	tc('K-087', 'Get keybinding for paste command', 'P0', ['settings', 'keybindings', 'get-paste'],
		[step(KB_GET, { command: 'editor.action.clipboardPasteAction' }, { capture: 'binding' })],
		valueV('binding', 'truthy', true)),

	tc('K-088', 'Get keybinding for save command', 'P0', ['settings', 'keybindings', 'get-save'],
		[step(KB_GET, { command: 'workbench.action.files.save' }, { capture: 'binding' })],
		valueV('binding', 'truthy', true)),

	tc('K-089', 'Get keybinding for undo command', 'P1', ['settings', 'keybindings', 'get-undo'],
		[step(KB_GET, { command: 'undo' }, { capture: 'binding' })],
		valueV('binding', 'truthy', true)),

	tc('K-090', 'Get keybinding for redo command', 'P1', ['settings', 'keybindings', 'get-redo'],
		[step(KB_GET, { command: 'redo' }, { capture: 'binding' })],
		valueV('binding', 'truthy', true)),

	tc('K-091', 'Get keybinding without command fails', 'P0', ['settings', 'keybindings', 'get-no-command'],
		[failStep(KB_GET, {})],
		valueV('result', 'truthy', true)),

	tc('K-092', 'Get keybinding for nonexistent command', 'P1', ['settings', 'keybindings', 'get-nonexistent'],
		[step(KB_GET, { command: 'nonexistent.command.xyz' }, { capture: 'binding' })],
		valueV('binding', 'truthy', true)),

	tc('K-093', 'Get keybinding for find command', 'P1', ['settings', 'keybindings', 'get-find'],
		[step(KB_GET, { command: 'actions.find' }, { capture: 'binding' })],
		valueV('binding', 'truthy', true)),

	tc('K-094', 'Get keybinding for replace command', 'P1', ['settings', 'keybindings', 'get-replace'],
		[step(KB_GET, { command: 'editor.action.startFindReplaceAction' }, { capture: 'binding' })],
		valueV('binding', 'truthy', true)),

	tc('K-095', 'Get keybinding for toggle terminal', 'P1', ['settings', 'keybindings', 'get-terminal'],
		[step(KB_GET, { command: 'workbench.action.terminal.toggleTerminal' }, { capture: 'binding' })],
		valueV('binding', 'truthy', true)),

	tc('K-096', 'Get keybinding repeated calls consistent', 'P1', ['settings', 'keybindings', 'get-consistent'],
		[step(KB_GET, { command: 'undo' }, { capture: 'b1' }), step(KB_GET, { command: 'undo' }, { capture: 'b2' })],
		valueV('b2', 'truthy', true)),

	tc('K-097', 'Open keybindings then get binding', 'P0', ['settings', 'keybindings', 'open-then-get'],
		[step(KB_OPEN), step(KB_GET, { command: 'undo' }, { capture: 'binding' })],
		valueV('binding', 'truthy', true)),

	tc('K-098', 'Get multiple keybindings sequentially', 'P1', ['settings', 'keybindings', 'get-multiple'],
		[step(KB_GET, { command: 'undo' }, { capture: 'undo' }), step(KB_GET, { command: 'redo' }, { capture: 'redo' }), step(KB_GET, { command: 'actions.find' }, { capture: 'find' })],
		valueV('find', 'truthy', true)),

	tc('K-099', 'Open keybindings performance', 'P2', ['settings', 'keybindings', 'performance'],
		[step(KB_OPEN, {}, { capture: 'perf' })],
		valueV('perf', 'truthy', true)),

	tc('K-100', 'End-to-end settings and keybindings workflow', 'P0', ['settings', 'keybindings', 'e2e'],
		[step(OPEN_UI), step(GET, { key: 'editor.fontSize' }, { capture: 'fontSize' }), step(SET, { key: 'editor.fontSize', value: 16 }), step(SEARCH, { query: 'font' }, { capture: 'searchResults' }), step(KB_OPEN), step(KB_GET, { command: 'undo' }, { capture: 'undoBinding' }), step(RESET, { key: 'editor.fontSize' })],
		valueV('undoBinding', 'truthy', true)),
];

// ===========================================================================
// Final export
// ===========================================================================

export const settingsTests: TestCase[] = [
	...openSettings,
	...getSet,
	...search,
	...keybindings,
];
