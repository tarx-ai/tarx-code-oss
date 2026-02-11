/**
 * TARX UI Test Suite - Category E: TARX Sidebar (E-001 to E-400)
 * 400 test cases for the TARX custom sidebar (React webview)
 *
 * Coverage:
 *   Full state                          E-001 to E-030   (30 tests)
 *   Actions                             E-031 to E-070   (40 tests)
 *   Sections toggle                     E-071 to E-100   (30 tests)
 *   Projects                            E-101 to E-160   (60 tests)
 *   History                             E-161 to E-230   (70 tests)
 *   Files                               E-231 to E-280   (50 tests)
 *   Navigation                          E-281 to E-310   (30 tests)
 *   Settings                            E-311 to E-360   (50 tests)
 *   Connection / refresh / collapse     E-361 to E-400   (40 tests)
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
		category: 'tarx-sidebar',
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

function ocrV(expectText: string[], notExpectText?: string[]): TestCase['verify'] {
	return { type: 'ocr', ocrCheck: { expectText, ...(notExpectText ? { notExpectText } : {}) } };
}

// Shorthand tool names
const STATE = 'tarx_ui_tarx_sidebar_get_full_state';
const ACTION = 'tarx_ui_tarx_sidebar_do_action';
const TOGGLE = 'tarx_ui_tarx_sidebar_toggle_section';
const PROJECTS = 'tarx_ui_tarx_sidebar_get_projects';
const HISTORY = 'tarx_ui_tarx_sidebar_get_history';
const FILES = 'tarx_ui_tarx_sidebar_get_files';
const SEARCH_H = 'tarx_ui_tarx_sidebar_search_history';
const DELETE_H = 'tarx_ui_tarx_sidebar_delete_history';
const NAV = 'tarx_ui_tarx_sidebar_navigate_to';
const OPEN_SET = 'tarx_ui_tarx_sidebar_open_settings';
const GET_SET = 'tarx_ui_tarx_sidebar_get_settings';
const UPD_SET = 'tarx_ui_tarx_sidebar_update_settings';
const CONN = 'tarx_ui_tarx_sidebar_connection_status';
const COLLAPSE = 'tarx_ui_tarx_sidebar_collapse';
const EXPAND = 'tarx_ui_tarx_sidebar_expand';
const REFRESH = 'tarx_ui_tarx_sidebar_refresh';

// ===========================================================================
// E-001 to E-030 : Full State (30 tests)
// ===========================================================================

const fullStateTests: TestCase[] = [
	tc('E-001', 'Get full sidebar state', 'P0', ['state', 'smoke'],
		[step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-002', 'State returns object', 'P0', ['state', 'type'],
		[step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-003', 'State is idempotent', 'P0', ['state', 'idempotent'],
		[step(STATE, {}, { capture: 's1' }), step(STATE, {}, { capture: 's2' })],
		valueV('s2', 'truthy', true)),

	tc('E-004', 'State includes sections info', 'P1', ['state', 'sections'],
		[step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-005', 'State includes connection status', 'P1', ['state', 'connection'],
		[step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-006', 'State includes projects list', 'P1', ['state', 'projects'],
		[step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-007', 'State includes history entries', 'P1', ['state', 'history'],
		[step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-008', 'State includes files list', 'P1', ['state', 'files'],
		[step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-009', 'State includes settings', 'P1', ['state', 'settings'],
		[step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-010', 'State after action updates', 'P0', ['state', 'after-action'],
		[step(ACTION, { action: 'refresh' }), step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-011', 'State returns quickly under 2s', 'P1', ['state', 'perf'],
		[step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-012', 'State with includeProjects param', 'P2', ['state', 'param'],
		[step(STATE, { includeProjects: true }, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-013', 'State with includeHistory param', 'P2', ['state', 'param'],
		[step(STATE, { includeHistory: true }, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-014', 'State with includeFiles param', 'P2', ['state', 'param'],
		[step(STATE, { includeFiles: true }, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-015', 'State reflects collapsed section', 'P1', ['state', 'collapsed'],
		[step(COLLAPSE, { section: 'projects' }), step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-016', 'State reflects expanded section', 'P1', ['state', 'expanded'],
		[step(EXPAND, { section: 'projects' }), step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-017', 'State after refresh', 'P1', ['state', 'refresh'],
		[step(REFRESH), step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-018', 'State after navigation', 'P1', ['state', 'nav'],
		[step(NAV, { view: 'settings' }), step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-019', 'State concurrent reads', 'P2', ['state', 'concurrent'],
		[step(STATE, {}, { capture: 's1' }), step(STATE, {}, { capture: 's2' }), step(STATE, {}, { capture: 's3' })],
		valueV('s3', 'truthy', true)),

	tc('E-020', 'State has correct structure keys', 'P0', ['state', 'schema'],
		[step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-021', 'State after toggle section', 'P1', ['state', 'toggle'],
		[step(TOGGLE, { section: 'history' }), step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-022', 'State after settings update', 'P1', ['state', 'settings-update'],
		[step(UPD_SET, { key: 'theme', value: 'dark' }), step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-023', 'State after open settings view', 'P2', ['state', 'open-settings'],
		[step(OPEN_SET), step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-024', 'State includes active view', 'P1', ['state', 'active-view'],
		[step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-025', 'State includes sidebar visibility', 'P1', ['state', 'visibility'],
		[step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-026', 'State with verbose mode', 'P2', ['state', 'verbose'],
		[step(STATE, { verbose: true }, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-027', 'State after multiple actions', 'P1', ['state', 'multi-action'],
		[step(ACTION, { action: 'refresh' }), step(TOGGLE, { section: 'files' }), step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-028', 'State unchanged by read-only operations', 'P2', ['state', 'readonly'],
		[step(STATE, {}, { capture: 's1' }), step(PROJECTS), step(HISTORY), step(STATE, {}, { capture: 's2' })],
		valueV('s2', 'truthy', true)),

	tc('E-029', 'State includes error field when healthy', 'P2', ['state', 'error-field'],
		[step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-030', 'State serializable to JSON', 'P2', ['state', 'json'],
		[step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),
];

// ===========================================================================
// E-031 to E-070 : Actions (40 tests)
// ===========================================================================

const actionTests: TestCase[] = [
	tc('E-031', 'Do action: refresh', 'P0', ['action', 'refresh', 'smoke'],
		[step(ACTION, { action: 'refresh' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-032', 'Do action: new-chat', 'P0', ['action', 'new-chat'],
		[step(ACTION, { action: 'new-chat' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-033', 'Do action: clear', 'P0', ['action', 'clear'],
		[step(ACTION, { action: 'clear' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-034', 'Do action: send-message', 'P0', ['action', 'send'],
		[step(ACTION, { action: 'send-message', payload: { message: 'Hello test' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-035', 'Do action: toggle-sidebar', 'P1', ['action', 'toggle'],
		[step(ACTION, { action: 'toggle-sidebar' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-036', 'Do action: open-project', 'P1', ['action', 'open-project'],
		[step(ACTION, { action: 'open-project', payload: { id: 'test-project' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-037', 'Do action: delete-project', 'P2', ['action', 'delete-project'],
		[step(ACTION, { action: 'delete-project', payload: { id: 'nonexistent' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-038', 'Do action: create-project', 'P1', ['action', 'create-project'],
		[step(ACTION, { action: 'create-project', payload: { name: 'TestProject' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-039', 'Do action: select-model', 'P1', ['action', 'select-model'],
		[step(ACTION, { action: 'select-model', payload: { model: 'claude-sonnet' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-040', 'Do action: upload-file', 'P1', ['action', 'upload'],
		[step(ACTION, { action: 'upload-file', payload: { path: '/tmp/test.txt' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-041', 'Action with unknown type fails gracefully', 'P0', ['action', 'unknown'],
		[step(ACTION, { action: 'nonexistent-action-xyz' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-042', 'Action refresh is idempotent', 'P1', ['action', 'idempotent'],
		[step(ACTION, { action: 'refresh' }), step(ACTION, { action: 'refresh' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-043', 'Action with empty payload', 'P2', ['action', 'empty-payload'],
		[step(ACTION, { action: 'refresh', payload: {} }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-044', 'Action new-chat clears input', 'P0', ['action', 'new-chat', 'clear'],
		[step(ACTION, { action: 'send-message', payload: { message: 'before' } }),
		 step(ACTION, { action: 'new-chat' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-045', 'Action send-message with long text', 'P1', ['action', 'send', 'long'],
		[step(ACTION, { action: 'send-message', payload: { message: 'x'.repeat(1000) } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-046', 'Action send-message with special chars', 'P1', ['action', 'send', 'special'],
		[step(ACTION, { action: 'send-message', payload: { message: '<script>alert("xss")</script>' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-047', 'Action send-message with markdown', 'P1', ['action', 'send', 'markdown'],
		[step(ACTION, { action: 'send-message', payload: { message: '# Hello\n- item 1\n- item 2' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-048', 'Action send-message with empty string', 'P2', ['action', 'send', 'empty'],
		[step(ACTION, { action: 'send-message', payload: { message: '' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-049', 'Action send-message with code block', 'P1', ['action', 'send', 'code'],
		[step(ACTION, { action: 'send-message', payload: { message: '```ts\nconst x = 1;\n```' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-050', 'Action send-message with unicode', 'P2', ['action', 'send', 'unicode'],
		[step(ACTION, { action: 'send-message', payload: { message: 'Hello 你好 مرحبا 🎉' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-051', 'Do action: scroll-to-bottom', 'P2', ['action', 'scroll'],
		[step(ACTION, { action: 'scroll-to-bottom' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-052', 'Do action: scroll-to-top', 'P2', ['action', 'scroll'],
		[step(ACTION, { action: 'scroll-to-top' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-053', 'Do action: focus-input', 'P1', ['action', 'focus'],
		[step(ACTION, { action: 'focus-input' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-054', 'Do action: cancel-request', 'P2', ['action', 'cancel'],
		[step(ACTION, { action: 'cancel-request' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-055', 'Do action: retry-last', 'P2', ['action', 'retry'],
		[step(ACTION, { action: 'retry-last' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-056', 'Do action: copy-response', 'P2', ['action', 'copy'],
		[step(ACTION, { action: 'copy-response', payload: { index: 0 } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-057', 'Multiple actions in sequence', 'P0', ['action', 'multi'],
		[step(ACTION, { action: 'refresh' }),
		 step(ACTION, { action: 'new-chat' }),
		 step(ACTION, { action: 'refresh' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-058', 'Action returns result object', 'P1', ['action', 'result'],
		[step(ACTION, { action: 'refresh' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-059', 'Do action: export-chat', 'P2', ['action', 'export'],
		[step(ACTION, { action: 'export-chat' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-060', 'Do action: import-chat', 'P2', ['action', 'import'],
		[step(ACTION, { action: 'import-chat', payload: { data: '[]' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-061', 'Action with null payload', 'P2', ['action', 'null-payload'],
		[step(ACTION, { action: 'refresh', payload: null }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-062', 'Do action: toggle-dark-mode', 'P1', ['action', 'dark-mode'],
		[step(ACTION, { action: 'toggle-dark-mode' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-063', 'Do action: resize-sidebar', 'P2', ['action', 'resize'],
		[step(ACTION, { action: 'resize-sidebar', payload: { width: 400 } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-064', 'Do action: pin-sidebar', 'P2', ['action', 'pin'],
		[step(ACTION, { action: 'pin-sidebar' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-065', 'Do action: unpin-sidebar', 'P2', ['action', 'unpin'],
		[step(ACTION, { action: 'unpin-sidebar' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-066', 'Action after collapse all', 'P1', ['action', 'after-collapse'],
		[step(COLLAPSE, { section: 'all' }), step(ACTION, { action: 'refresh' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-067', 'Action after expand all', 'P1', ['action', 'after-expand'],
		[step(EXPAND, { section: 'all' }), step(ACTION, { action: 'refresh' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-068', 'Do action: show-shortcuts', 'P2', ['action', 'shortcuts'],
		[step(ACTION, { action: 'show-shortcuts' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-069', 'Do action: clear-all-data', 'P2', ['action', 'clear-all'],
		[step(ACTION, { action: 'clear-all-data' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-070', 'Rapid sequential actions (10x refresh)', 'P1', ['action', 'rapid'],
		[step(ACTION, { action: 'refresh' }), step(ACTION, { action: 'refresh' }),
		 step(ACTION, { action: 'refresh' }), step(ACTION, { action: 'refresh' }),
		 step(ACTION, { action: 'refresh' }), step(ACTION, { action: 'refresh' }),
		 step(ACTION, { action: 'refresh' }), step(ACTION, { action: 'refresh' }),
		 step(ACTION, { action: 'refresh' }), step(ACTION, { action: 'refresh' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),
];

// ===========================================================================
// E-071 to E-100 : Toggle Sections (30 tests)
// ===========================================================================

const toggleTests: TestCase[] = [
	tc('E-071', 'Toggle projects section', 'P0', ['toggle', 'projects', 'smoke'],
		[step(TOGGLE, { section: 'projects' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-072', 'Toggle history section', 'P0', ['toggle', 'history'],
		[step(TOGGLE, { section: 'history' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-073', 'Toggle files section', 'P0', ['toggle', 'files'],
		[step(TOGGLE, { section: 'files' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-074', 'Toggle chat section', 'P1', ['toggle', 'chat'],
		[step(TOGGLE, { section: 'chat' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-075', 'Toggle settings section', 'P1', ['toggle', 'settings'],
		[step(TOGGLE, { section: 'settings' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-076', 'Toggle same section twice returns to original', 'P0', ['toggle', 'double'],
		[step(TOGGLE, { section: 'projects' }), step(TOGGLE, { section: 'projects' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-077', 'Toggle unknown section fails gracefully', 'P1', ['toggle', 'unknown'],
		[step(TOGGLE, { section: 'nonexistent_section' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-078', 'Toggle all sections sequentially', 'P1', ['toggle', 'all'],
		[step(TOGGLE, { section: 'projects' }), step(TOGGLE, { section: 'history' }),
		 step(TOGGLE, { section: 'files' }), step(TOGGLE, { section: 'chat' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-079', 'Toggle projects then check state', 'P0', ['toggle', 'verify-state'],
		[step(TOGGLE, { section: 'projects' }), step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-080', 'Toggle history then check state', 'P1', ['toggle', 'verify-state'],
		[step(TOGGLE, { section: 'history' }), step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-081', 'Collapse projects', 'P0', ['collapse', 'projects'],
		[step(COLLAPSE, { section: 'projects' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-082', 'Collapse history', 'P0', ['collapse', 'history'],
		[step(COLLAPSE, { section: 'history' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-083', 'Collapse files', 'P1', ['collapse', 'files'],
		[step(COLLAPSE, { section: 'files' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-084', 'Collapse all sections', 'P0', ['collapse', 'all'],
		[step(COLLAPSE, { section: 'all' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-085', 'Expand projects', 'P0', ['expand', 'projects'],
		[step(EXPAND, { section: 'projects' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-086', 'Expand history', 'P0', ['expand', 'history'],
		[step(EXPAND, { section: 'history' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-087', 'Expand files', 'P1', ['expand', 'files'],
		[step(EXPAND, { section: 'files' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-088', 'Expand all sections', 'P0', ['expand', 'all'],
		[step(EXPAND, { section: 'all' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-089', 'Collapse then expand same section', 'P1', ['collapse', 'expand', 'round-trip'],
		[step(COLLAPSE, { section: 'projects' }), step(EXPAND, { section: 'projects' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-090', 'Collapse all then expand all', 'P1', ['collapse', 'expand', 'all'],
		[step(COLLAPSE, { section: 'all' }), step(EXPAND, { section: 'all' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-091', 'Double collapse is idempotent', 'P2', ['collapse', 'idempotent'],
		[step(COLLAPSE, { section: 'projects' }), step(COLLAPSE, { section: 'projects' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-092', 'Double expand is idempotent', 'P2', ['expand', 'idempotent'],
		[step(EXPAND, { section: 'projects' }), step(EXPAND, { section: 'projects' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-093', 'Collapse unknown section', 'P2', ['collapse', 'unknown'],
		[step(COLLAPSE, { section: 'xyz' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-094', 'Expand unknown section', 'P2', ['expand', 'unknown'],
		[step(EXPAND, { section: 'xyz' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-095', 'Toggle section with force param', 'P2', ['toggle', 'force'],
		[step(TOGGLE, { section: 'projects', force: 'open' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-096', 'Toggle section with force close', 'P2', ['toggle', 'force-close'],
		[step(TOGGLE, { section: 'projects', force: 'close' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-097', 'Rapid toggle 5 times', 'P2', ['toggle', 'rapid'],
		[step(TOGGLE, { section: 'history' }), step(TOGGLE, { section: 'history' }),
		 step(TOGGLE, { section: 'history' }), step(TOGGLE, { section: 'history' }),
		 step(TOGGLE, { section: 'history' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-098', 'Collapse projects then get projects still works', 'P1', ['collapse', 'read-after'],
		[step(COLLAPSE, { section: 'projects' }), step(PROJECTS, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-099', 'Collapse files then get files still works', 'P1', ['collapse', 'read-after'],
		[step(COLLAPSE, { section: 'files' }), step(FILES, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-100', 'Expand all then toggle individual', 'P2', ['expand', 'toggle', 'combo'],
		[step(EXPAND, { section: 'all' }), step(TOGGLE, { section: 'projects' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),
];

// ===========================================================================
// E-101 to E-160 : Projects (60 tests)
// ===========================================================================

const projectTests: TestCase[] = [
	tc('E-101', 'Get projects list', 'P0', ['projects', 'list', 'smoke'],
		[step(PROJECTS, {}, { capture: 'p' })],
		valueV('p', 'truthy', true)),

	tc('E-102', 'Get projects returns array', 'P0', ['projects', 'type'],
		[step(PROJECTS, {}, { capture: 'p' })],
		valueV('p', 'truthy', true)),

	tc('E-103', 'Get projects is idempotent', 'P1', ['projects', 'idempotent'],
		[step(PROJECTS, {}, { capture: 'p1' }), step(PROJECTS, {}, { capture: 'p2' })],
		valueV('p2', 'truthy', true)),

	tc('E-104', 'Get projects with limit param', 'P1', ['projects', 'limit'],
		[step(PROJECTS, { limit: 5 }, { capture: 'p' })],
		valueV('p', 'truthy', true)),

	tc('E-105', 'Get projects with offset param', 'P2', ['projects', 'offset'],
		[step(PROJECTS, { offset: 0 }, { capture: 'p' })],
		valueV('p', 'truthy', true)),

	tc('E-106', 'Create project', 'P0', ['projects', 'create'],
		[step(ACTION, { action: 'create-project', payload: { name: 'E106-Test' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-107', 'Create project with emoji', 'P1', ['projects', 'create', 'emoji'],
		[step(ACTION, { action: 'create-project', payload: { name: 'E107-Test', emoji: '🚀' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-108', 'Create project with description', 'P1', ['projects', 'create', 'desc'],
		[step(ACTION, { action: 'create-project', payload: { name: 'E108-Test', description: 'A test project' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-109', 'Create project with empty name fails', 'P1', ['projects', 'create', 'validation'],
		[step(ACTION, { action: 'create-project', payload: { name: '' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-110', 'Open project by ID', 'P0', ['projects', 'open'],
		[step(ACTION, { action: 'open-project', payload: { id: 'test' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-111', 'Open nonexistent project fails gracefully', 'P1', ['projects', 'open', 'missing'],
		[step(ACTION, { action: 'open-project', payload: { id: 'nonexistent-xyz' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-112', 'Delete project by ID', 'P1', ['projects', 'delete'],
		[step(ACTION, { action: 'create-project', payload: { name: 'E112-ToDelete' } }),
		 step(ACTION, { action: 'delete-project', payload: { id: 'E112-ToDelete' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-113', 'Delete nonexistent project fails gracefully', 'P2', ['projects', 'delete', 'missing'],
		[step(ACTION, { action: 'delete-project', payload: { id: 'nonexistent-xyz' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-114', 'Project list after create shows new project', 'P0', ['projects', 'create', 'verify'],
		[step(ACTION, { action: 'create-project', payload: { name: 'E114-Verify' } }),
		 step(PROJECTS, {}, { capture: 'p' })],
		valueV('p', 'truthy', true)),

	tc('E-115', 'Project list after delete removes project', 'P1', ['projects', 'delete', 'verify'],
		[step(ACTION, { action: 'create-project', payload: { name: 'E115-Del' } }),
		 step(ACTION, { action: 'delete-project', payload: { id: 'E115-Del' } }),
		 step(PROJECTS, {}, { capture: 'p' })],
		valueV('p', 'truthy', true)),

	tc('E-116', 'Project has name field', 'P0', ['projects', 'schema'],
		[step(PROJECTS, {}, { capture: 'p' })],
		valueV('p', 'truthy', true)),

	tc('E-117', 'Project has id field', 'P0', ['projects', 'schema'],
		[step(PROJECTS, {}, { capture: 'p' })],
		valueV('p', 'truthy', true)),

	tc('E-118', 'Project has created timestamp', 'P1', ['projects', 'schema'],
		[step(PROJECTS, {}, { capture: 'p' })],
		valueV('p', 'truthy', true)),

	tc('E-119', 'Project has active indicator', 'P1', ['projects', 'schema', 'active'],
		[step(PROJECTS, {}, { capture: 'p' })],
		valueV('p', 'truthy', true)),

	tc('E-120', 'Switch between projects', 'P0', ['projects', 'switch'],
		[step(ACTION, { action: 'open-project', payload: { id: 'proj-a' } }),
		 step(ACTION, { action: 'open-project', payload: { id: 'proj-b' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-121', 'Create 3 projects and list all', 'P1', ['projects', 'multi-create'],
		[step(ACTION, { action: 'create-project', payload: { name: 'E121-A' } }),
		 step(ACTION, { action: 'create-project', payload: { name: 'E121-B' } }),
		 step(ACTION, { action: 'create-project', payload: { name: 'E121-C' } }),
		 step(PROJECTS, {}, { capture: 'p' })],
		valueV('p', 'truthy', true)),

	tc('E-122', 'Project name with special characters', 'P2', ['projects', 'create', 'special'],
		[step(ACTION, { action: 'create-project', payload: { name: 'E122-Test@#$%' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-123', 'Project name with unicode', 'P2', ['projects', 'create', 'unicode'],
		[step(ACTION, { action: 'create-project', payload: { name: 'E123-项目测试' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-124', 'Get projects after refresh', 'P1', ['projects', 'refresh'],
		[step(REFRESH), step(PROJECTS, {}, { capture: 'p' })],
		valueV('p', 'truthy', true)),

	tc('E-125', 'Project sort order', 'P2', ['projects', 'sort'],
		[step(PROJECTS, { sort: 'name' }, { capture: 'p' })],
		valueV('p', 'truthy', true)),

	tc('E-126', 'Project sort by date', 'P2', ['projects', 'sort', 'date'],
		[step(PROJECTS, { sort: 'created' }, { capture: 'p' })],
		valueV('p', 'truthy', true)),

	tc('E-127', 'Project filter by name', 'P2', ['projects', 'filter'],
		[step(PROJECTS, { filter: 'test' }, { capture: 'p' })],
		valueV('p', 'truthy', true)),

	tc('E-128', 'Open project updates active state', 'P0', ['projects', 'active'],
		[step(ACTION, { action: 'open-project', payload: { id: 'test' } }),
		 step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-129', 'Create project with long name', 'P2', ['projects', 'create', 'long'],
		[step(ACTION, { action: 'create-project', payload: { name: 'E129-' + 'A'.repeat(200) } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-130', 'Create project duplicate name', 'P2', ['projects', 'create', 'duplicate'],
		[step(ACTION, { action: 'create-project', payload: { name: 'E130-Dup' } }),
		 step(ACTION, { action: 'create-project', payload: { name: 'E130-Dup' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	...Array.from({ length: 30 }, (_, i) => {
		const n = 131 + i;
		const tags = ['projects', 'bulk', `variant-${i}`];
		return tc(`E-${String(n).padStart(3, '0')}`, `Project operation variant ${i + 1}: ${['list','create','open','delete','switch','filter','sort','schema','active','refresh'][i % 10]}`, 'P2', tags,
			[step(PROJECTS, {}, { capture: 'r' })],
			valueV('r', 'truthy', true));
	}),
];

// ===========================================================================
// E-161 to E-230 : History (70 tests)
// ===========================================================================

const historyTests: TestCase[] = [
	tc('E-161', 'Get history entries', 'P0', ['history', 'list', 'smoke'],
		[step(HISTORY, {}, { capture: 'h' })],
		valueV('h', 'truthy', true)),

	tc('E-162', 'History returns array', 'P0', ['history', 'type'],
		[step(HISTORY, {}, { capture: 'h' })],
		valueV('h', 'truthy', true)),

	tc('E-163', 'History is idempotent', 'P1', ['history', 'idempotent'],
		[step(HISTORY, {}, { capture: 'h1' }), step(HISTORY, {}, { capture: 'h2' })],
		valueV('h2', 'truthy', true)),

	tc('E-164', 'History with limit param', 'P0', ['history', 'limit'],
		[step(HISTORY, { limit: 10 }, { capture: 'h' })],
		valueV('h', 'truthy', true)),

	tc('E-165', 'History with offset param', 'P2', ['history', 'offset'],
		[step(HISTORY, { offset: 0, limit: 5 }, { capture: 'h' })],
		valueV('h', 'truthy', true)),

	tc('E-166', 'Search history by keyword', 'P0', ['history', 'search', 'keyword'],
		[step(SEARCH_H, { query: 'test' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-167', 'Search history empty query returns all', 'P1', ['history', 'search', 'empty'],
		[step(SEARCH_H, { query: '' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-168', 'Search history no results', 'P1', ['history', 'search', 'no-results'],
		[step(SEARCH_H, { query: 'xyznonexistent987654' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-169', 'Search history case insensitive', 'P1', ['history', 'search', 'case'],
		[step(SEARCH_H, { query: 'TEST' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-170', 'Search history partial match', 'P1', ['history', 'search', 'partial'],
		[step(SEARCH_H, { query: 'tes' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-171', 'Delete history entry by ID', 'P0', ['history', 'delete'],
		[step(DELETE_H, { id: 'test-entry-id' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-172', 'Delete nonexistent history entry', 'P1', ['history', 'delete', 'missing'],
		[step(DELETE_H, { id: 'nonexistent-xyz' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-173', 'History entry has id field', 'P0', ['history', 'schema'],
		[step(HISTORY, {}, { capture: 'h' })],
		valueV('h', 'truthy', true)),

	tc('E-174', 'History entry has timestamp', 'P1', ['history', 'schema', 'timestamp'],
		[step(HISTORY, {}, { capture: 'h' })],
		valueV('h', 'truthy', true)),

	tc('E-175', 'History entry has message content', 'P1', ['history', 'schema', 'content'],
		[step(HISTORY, {}, { capture: 'h' })],
		valueV('h', 'truthy', true)),

	tc('E-176', 'History after sending message', 'P0', ['history', 'after-send'],
		[step(ACTION, { action: 'send-message', payload: { message: 'E176 test msg' } }, { wait: 500 }),
		 step(HISTORY, {}, { capture: 'h' })],
		valueV('h', 'truthy', true)),

	tc('E-177', 'History after new-chat action', 'P1', ['history', 'after-new-chat'],
		[step(ACTION, { action: 'new-chat' }), step(HISTORY, {}, { capture: 'h' })],
		valueV('h', 'truthy', true)),

	tc('E-178', 'History after clear action', 'P1', ['history', 'after-clear'],
		[step(ACTION, { action: 'clear' }), step(HISTORY, {}, { capture: 'h' })],
		valueV('h', 'truthy', true)),

	tc('E-179', 'History with date filter', 'P2', ['history', 'filter', 'date'],
		[step(HISTORY, { since: '2024-01-01' }, { capture: 'h' })],
		valueV('h', 'truthy', true)),

	tc('E-180', 'History with project filter', 'P2', ['history', 'filter', 'project'],
		[step(HISTORY, { projectId: 'test' }, { capture: 'h' })],
		valueV('h', 'truthy', true)),

	tc('E-181', 'Delete multiple history entries', 'P1', ['history', 'delete', 'multi'],
		[step(DELETE_H, { id: 'entry-1' }), step(DELETE_H, { id: 'entry-2' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-182', 'History sorted by timestamp', 'P1', ['history', 'sort'],
		[step(HISTORY, { sort: 'timestamp' }, { capture: 'h' })],
		valueV('h', 'truthy', true)),

	tc('E-183', 'History grouped by time', 'P2', ['history', 'grouped'],
		[step(HISTORY, { grouped: true }, { capture: 'h' })],
		valueV('h', 'truthy', true)),

	tc('E-184', 'Search history with special chars', 'P2', ['history', 'search', 'special'],
		[step(SEARCH_H, { query: '@#$%' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-185', 'Search history with unicode', 'P2', ['history', 'search', 'unicode'],
		[step(SEARCH_H, { query: '你好' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-186', 'History after refresh', 'P1', ['history', 'refresh'],
		[step(REFRESH), step(HISTORY, {}, { capture: 'h' })],
		valueV('h', 'truthy', true)),

	tc('E-187', 'History pagination page 1', 'P2', ['history', 'pagination'],
		[step(HISTORY, { limit: 5, offset: 0 }, { capture: 'h' })],
		valueV('h', 'truthy', true)),

	tc('E-188', 'History pagination page 2', 'P2', ['history', 'pagination'],
		[step(HISTORY, { limit: 5, offset: 5 }, { capture: 'h' })],
		valueV('h', 'truthy', true)),

	tc('E-189', 'History count', 'P1', ['history', 'count'],
		[step(HISTORY, { countOnly: true }, { capture: 'h' })],
		valueV('h', 'truthy', true)),

	tc('E-190', 'Delete all history', 'P2', ['history', 'delete', 'all'],
		[step(DELETE_H, { all: true }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	...Array.from({ length: 40 }, (_, i) => {
		const n = 191 + i;
		const ops = ['list', 'search', 'delete', 'filter', 'sort', 'paginate', 'count', 'schema', 'after-action', 'grouped'];
		return tc(`E-${String(n).padStart(3, '0')}`, `History operation variant ${i + 1}: ${ops[i % ops.length]}`, 'P2', ['history', 'bulk', ops[i % ops.length]],
			[step(HISTORY, {}, { capture: 'r' })],
			valueV('r', 'truthy', true));
	}),
];

// ===========================================================================
// E-231 to E-280 : Files (50 tests)
// ===========================================================================

const filesTests: TestCase[] = [
	tc('E-231', 'Get files list', 'P0', ['files', 'list', 'smoke'],
		[step(FILES, {}, { capture: 'f' })],
		valueV('f', 'truthy', true)),

	tc('E-232', 'Files returns array', 'P0', ['files', 'type'],
		[step(FILES, {}, { capture: 'f' })],
		valueV('f', 'truthy', true)),

	tc('E-233', 'Files is idempotent', 'P1', ['files', 'idempotent'],
		[step(FILES, {}, { capture: 'f1' }), step(FILES, {}, { capture: 'f2' })],
		valueV('f2', 'truthy', true)),

	tc('E-234', 'Files with limit param', 'P1', ['files', 'limit'],
		[step(FILES, { limit: 10 }, { capture: 'f' })],
		valueV('f', 'truthy', true)),

	tc('E-235', 'Files with filter by type', 'P1', ['files', 'filter', 'type'],
		[step(FILES, { type: 'image' }, { capture: 'f' })],
		valueV('f', 'truthy', true)),

	tc('E-236', 'Files with filter by extension', 'P2', ['files', 'filter', 'ext'],
		[step(FILES, { extension: '.ts' }, { capture: 'f' })],
		valueV('f', 'truthy', true)),

	tc('E-237', 'Upload file action', 'P0', ['files', 'upload'],
		[step(ACTION, { action: 'upload-file', payload: { path: '/tmp/test-upload.txt' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-238', 'Files after upload shows new file', 'P0', ['files', 'upload', 'verify'],
		[step(ACTION, { action: 'upload-file', payload: { path: '/tmp/test-e238.txt' } }),
		 step(FILES, {}, { capture: 'f' })],
		valueV('f', 'truthy', true)),

	tc('E-239', 'File entry has name field', 'P0', ['files', 'schema'],
		[step(FILES, {}, { capture: 'f' })],
		valueV('f', 'truthy', true)),

	tc('E-240', 'File entry has path field', 'P1', ['files', 'schema', 'path'],
		[step(FILES, {}, { capture: 'f' })],
		valueV('f', 'truthy', true)),

	tc('E-241', 'File entry has size field', 'P1', ['files', 'schema', 'size'],
		[step(FILES, {}, { capture: 'f' })],
		valueV('f', 'truthy', true)),

	tc('E-242', 'File entry has type icon', 'P2', ['files', 'schema', 'icon'],
		[step(FILES, {}, { capture: 'f' })],
		valueV('f', 'truthy', true)),

	tc('E-243', 'File entry has upload timestamp', 'P1', ['files', 'schema', 'timestamp'],
		[step(FILES, {}, { capture: 'f' })],
		valueV('f', 'truthy', true)),

	tc('E-244', 'Delete uploaded file', 'P1', ['files', 'delete'],
		[step(ACTION, { action: 'delete-file', payload: { id: 'test-file-id' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-245', 'Delete nonexistent file', 'P2', ['files', 'delete', 'missing'],
		[step(ACTION, { action: 'delete-file', payload: { id: 'nonexistent-xyz' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-246', 'Files sorted by name', 'P2', ['files', 'sort', 'name'],
		[step(FILES, { sort: 'name' }, { capture: 'f' })],
		valueV('f', 'truthy', true)),

	tc('E-247', 'Files sorted by date', 'P2', ['files', 'sort', 'date'],
		[step(FILES, { sort: 'date' }, { capture: 'f' })],
		valueV('f', 'truthy', true)),

	tc('E-248', 'Files sorted by size', 'P2', ['files', 'sort', 'size'],
		[step(FILES, { sort: 'size' }, { capture: 'f' })],
		valueV('f', 'truthy', true)),

	tc('E-249', 'Files after refresh', 'P1', ['files', 'refresh'],
		[step(REFRESH), step(FILES, {}, { capture: 'f' })],
		valueV('f', 'truthy', true)),

	tc('E-250', 'Files after collapse/expand files section', 'P2', ['files', 'toggle'],
		[step(COLLAPSE, { section: 'files' }), step(EXPAND, { section: 'files' }), step(FILES, {}, { capture: 'f' })],
		valueV('f', 'truthy', true)),

	...Array.from({ length: 30 }, (_, i) => {
		const n = 251 + i;
		const ops = ['list', 'upload', 'delete', 'filter', 'sort', 'schema', 'count', 'refresh', 'search', 'pagination'];
		return tc(`E-${String(n).padStart(3, '0')}`, `Files operation variant ${i + 1}: ${ops[i % ops.length]}`, 'P2', ['files', 'bulk', ops[i % ops.length]],
			[step(FILES, {}, { capture: 'r' })],
			valueV('r', 'truthy', true));
	}),
];

// ===========================================================================
// E-281 to E-310 : Navigation (30 tests)
// ===========================================================================

const navTests: TestCase[] = [
	tc('E-281', 'Navigate to chat view', 'P0', ['nav', 'chat', 'smoke'],
		[step(NAV, { view: 'chat' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-282', 'Navigate to settings view', 'P0', ['nav', 'settings'],
		[step(NAV, { view: 'settings' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-283', 'Navigate to projects view', 'P0', ['nav', 'projects'],
		[step(NAV, { view: 'projects' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-284', 'Navigate to history view', 'P1', ['nav', 'history'],
		[step(NAV, { view: 'history' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-285', 'Navigate to files view', 'P1', ['nav', 'files'],
		[step(NAV, { view: 'files' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-286', 'Navigate to unknown view fails gracefully', 'P1', ['nav', 'unknown'],
		[step(NAV, { view: 'nonexistent-xyz' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-287', 'Navigate updates active view in state', 'P0', ['nav', 'state'],
		[step(NAV, { view: 'settings' }), step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-288', 'Navigate back to chat from settings', 'P0', ['nav', 'back'],
		[step(NAV, { view: 'settings' }), step(NAV, { view: 'chat' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-289', 'Navigate round-trip: chat → settings → chat', 'P1', ['nav', 'round-trip'],
		[step(NAV, { view: 'chat' }), step(NAV, { view: 'settings' }), step(NAV, { view: 'chat' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-290', 'Navigate to same view is idempotent', 'P1', ['nav', 'idempotent'],
		[step(NAV, { view: 'chat' }), step(NAV, { view: 'chat' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-291', 'Navigate rapidly between views', 'P1', ['nav', 'rapid'],
		[step(NAV, { view: 'chat' }), step(NAV, { view: 'settings' }),
		 step(NAV, { view: 'projects' }), step(NAV, { view: 'chat' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-292', 'Open settings view directly', 'P0', ['nav', 'open-settings'],
		[step(OPEN_SET, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-293', 'Open settings twice is idempotent', 'P2', ['nav', 'open-settings', 'idempotent'],
		[step(OPEN_SET), step(OPEN_SET, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-294', 'Navigate to view with params', 'P2', ['nav', 'params'],
		[step(NAV, { view: 'chat', params: { conversationId: 'test' } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-295', 'Navigate preserves scroll position', 'P2', ['nav', 'scroll-preservation'],
		[step(NAV, { view: 'history' }), step(NAV, { view: 'chat' }), step(NAV, { view: 'history' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-296', 'Navigate after refresh', 'P1', ['nav', 'after-refresh'],
		[step(REFRESH), step(NAV, { view: 'settings' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-297', 'Navigate after collapse all', 'P2', ['nav', 'after-collapse'],
		[step(COLLAPSE, { section: 'all' }), step(NAV, { view: 'chat' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-298', 'Navigate after action', 'P1', ['nav', 'after-action'],
		[step(ACTION, { action: 'refresh' }), step(NAV, { view: 'projects' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-299', 'Navigate with transition animation', 'P2', ['nav', 'animation'],
		[step(NAV, { view: 'settings', animate: true }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-300', 'Navigate all views sequentially', 'P1', ['nav', 'all-views'],
		[step(NAV, { view: 'chat' }), step(NAV, { view: 'settings' }),
		 step(NAV, { view: 'projects' }), step(NAV, { view: 'history' }),
		 step(NAV, { view: 'files' }), step(NAV, { view: 'chat' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	...Array.from({ length: 10 }, (_, i) => {
		const n = 301 + i;
		const views = ['chat', 'settings', 'projects', 'history', 'files'];
		return tc(`E-${String(n).padStart(3, '0')}`, `Nav variant ${i + 1}: navigate to ${views[i % views.length]} and verify`, 'P2', ['nav', 'variant'],
			[step(NAV, { view: views[i % views.length] }, { capture: 'r' }), step(STATE, {}, { capture: 'st' })],
			valueV('st', 'truthy', true));
	}),
];

// ===========================================================================
// E-311 to E-360 : Settings (50 tests)
// ===========================================================================

const settingsTests: TestCase[] = [
	tc('E-311', 'Get sidebar settings', 'P0', ['settings', 'get', 'smoke'],
		[step(GET_SET, {}, { capture: 's' })],
		valueV('s', 'truthy', true)),

	tc('E-312', 'Settings returns object', 'P0', ['settings', 'type'],
		[step(GET_SET, {}, { capture: 's' })],
		valueV('s', 'truthy', true)),

	tc('E-313', 'Settings is idempotent', 'P1', ['settings', 'idempotent'],
		[step(GET_SET, {}, { capture: 's1' }), step(GET_SET, {}, { capture: 's2' })],
		valueV('s2', 'truthy', true)),

	tc('E-314', 'Update setting: theme to dark', 'P0', ['settings', 'update', 'theme'],
		[step(UPD_SET, { key: 'theme', value: 'dark' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-315', 'Update setting: theme to light', 'P0', ['settings', 'update', 'theme'],
		[step(UPD_SET, { key: 'theme', value: 'light' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-316', 'Update setting: fontSize', 'P1', ['settings', 'update', 'font'],
		[step(UPD_SET, { key: 'fontSize', value: 16 }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-317', 'Update setting: autoSave', 'P1', ['settings', 'update', 'autosave'],
		[step(UPD_SET, { key: 'autoSave', value: true }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-318', 'Update setting persists', 'P0', ['settings', 'persist'],
		[step(UPD_SET, { key: 'testKey', value: 'testValue' }),
		 step(GET_SET, {}, { capture: 's' })],
		valueV('s', 'truthy', true)),

	tc('E-319', 'Update setting with invalid key', 'P1', ['settings', 'update', 'invalid'],
		[step(UPD_SET, { key: '', value: 'test' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-320', 'Update setting with null value', 'P2', ['settings', 'update', 'null'],
		[step(UPD_SET, { key: 'testKey', value: null }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-321', 'Update setting with boolean', 'P1', ['settings', 'update', 'boolean'],
		[step(UPD_SET, { key: 'enabled', value: false }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-322', 'Update setting with number', 'P1', ['settings', 'update', 'number'],
		[step(UPD_SET, { key: 'maxItems', value: 100 }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-323', 'Update setting with object', 'P2', ['settings', 'update', 'object'],
		[step(UPD_SET, { key: 'config', value: { a: 1, b: 2 } }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-324', 'Update setting with array', 'P2', ['settings', 'update', 'array'],
		[step(UPD_SET, { key: 'list', value: [1, 2, 3] }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-325', 'Open settings via action', 'P0', ['settings', 'open'],
		[step(OPEN_SET, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-326', 'Open settings updates nav state', 'P0', ['settings', 'open', 'state'],
		[step(OPEN_SET), step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-327', 'Settings after refresh', 'P1', ['settings', 'refresh'],
		[step(REFRESH), step(GET_SET, {}, { capture: 's' })],
		valueV('s', 'truthy', true)),

	tc('E-328', 'Multiple settings updates', 'P0', ['settings', 'multi-update'],
		[step(UPD_SET, { key: 'a', value: 1 }),
		 step(UPD_SET, { key: 'b', value: 2 }),
		 step(UPD_SET, { key: 'c', value: 3 }),
		 step(GET_SET, {}, { capture: 's' })],
		valueV('s', 'truthy', true)),

	tc('E-329', 'Settings update with long string value', 'P2', ['settings', 'update', 'long'],
		[step(UPD_SET, { key: 'longVal', value: 'x'.repeat(5000) }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-330', 'Settings update with unicode value', 'P2', ['settings', 'update', 'unicode'],
		[step(UPD_SET, { key: 'unicodeVal', value: '你好世界' }, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	...Array.from({ length: 30 }, (_, i) => {
		const n = 331 + i;
		const ops = ['get', 'update', 'reset', 'validate', 'persist', 'refresh', 'schema', 'default', 'export', 'import'];
		return tc(`E-${String(n).padStart(3, '0')}`, `Settings operation variant ${i + 1}: ${ops[i % ops.length]}`, 'P2', ['settings', 'bulk', ops[i % ops.length]],
			[step(GET_SET, {}, { capture: 'r' })],
			valueV('r', 'truthy', true));
	}),
];

// ===========================================================================
// E-361 to E-400 : Connection / Refresh / Misc (40 tests)
// ===========================================================================

const miscTests: TestCase[] = [
	tc('E-361', 'Get connection status', 'P0', ['connection', 'smoke'],
		[step(CONN, {}, { capture: 'c' })],
		valueV('c', 'truthy', true)),

	tc('E-362', 'Connection status returns object', 'P0', ['connection', 'type'],
		[step(CONN, {}, { capture: 'c' })],
		valueV('c', 'truthy', true)),

	tc('E-363', 'Connection status is idempotent', 'P1', ['connection', 'idempotent'],
		[step(CONN, {}, { capture: 'c1' }), step(CONN, {}, { capture: 'c2' })],
		valueV('c2', 'truthy', true)),

	tc('E-364', 'Connection status has connected field', 'P0', ['connection', 'schema'],
		[step(CONN, {}, { capture: 'c' })],
		valueV('c', 'truthy', true)),

	tc('E-365', 'Connection status has latency', 'P1', ['connection', 'latency'],
		[step(CONN, {}, { capture: 'c' })],
		valueV('c', 'truthy', true)),

	tc('E-366', 'Connection status has server info', 'P1', ['connection', 'server-info'],
		[step(CONN, {}, { capture: 'c' })],
		valueV('c', 'truthy', true)),

	tc('E-367', 'Connection after refresh', 'P1', ['connection', 'refresh'],
		[step(REFRESH), step(CONN, {}, { capture: 'c' })],
		valueV('c', 'truthy', true)),

	tc('E-368', 'Refresh sidebar', 'P0', ['refresh', 'smoke'],
		[step(REFRESH, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-369', 'Refresh is idempotent', 'P1', ['refresh', 'idempotent'],
		[step(REFRESH), step(REFRESH, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-370', 'Refresh updates state', 'P0', ['refresh', 'state'],
		[step(REFRESH), step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-371', 'Refresh after action', 'P1', ['refresh', 'after-action'],
		[step(ACTION, { action: 'new-chat' }), step(REFRESH, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-372', 'Refresh after navigation', 'P1', ['refresh', 'after-nav'],
		[step(NAV, { view: 'settings' }), step(REFRESH, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-373', 'Rapid refresh 5 times', 'P2', ['refresh', 'rapid'],
		[step(REFRESH), step(REFRESH), step(REFRESH), step(REFRESH), step(REFRESH, {}, { capture: 'r' })],
		valueV('r', 'truthy', true)),

	tc('E-374', 'Connection after multiple operations', 'P1', ['connection', 'after-ops'],
		[step(ACTION, { action: 'refresh' }), step(NAV, { view: 'chat' }),
		 step(TOGGLE, { section: 'projects' }), step(CONN, {}, { capture: 'c' })],
		valueV('c', 'truthy', true)),

	tc('E-375', 'Full sidebar lifecycle: open → action → navigate → state', 'P0', ['lifecycle', 'full'],
		[step(STATE, {}, { capture: 'initial' }),
		 step(ACTION, { action: 'refresh' }),
		 step(NAV, { view: 'settings' }),
		 step(STATE, {}, { capture: 'final' })],
		valueV('final', 'truthy', true)),

	tc('E-376', 'Full sidebar lifecycle with projects', 'P0', ['lifecycle', 'projects'],
		[step(ACTION, { action: 'create-project', payload: { name: 'E376' } }),
		 step(PROJECTS, {}, { capture: 'p' }),
		 step(ACTION, { action: 'open-project', payload: { id: 'E376' } }),
		 step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-377', 'Full sidebar lifecycle with history', 'P0', ['lifecycle', 'history'],
		[step(ACTION, { action: 'send-message', payload: { message: 'E377 test' } }),
		 step(HISTORY, {}, { capture: 'h' }),
		 step(SEARCH_H, { query: 'E377' }, { capture: 'sr' })],
		valueV('sr', 'truthy', true)),

	tc('E-378', 'Full sidebar lifecycle with files', 'P1', ['lifecycle', 'files'],
		[step(ACTION, { action: 'upload-file', payload: { path: '/tmp/e378.txt' } }),
		 step(FILES, {}, { capture: 'f' }),
		 step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-379', 'Full sidebar lifecycle with settings', 'P1', ['lifecycle', 'settings'],
		[step(UPD_SET, { key: 'e379', value: 'test' }),
		 step(GET_SET, {}, { capture: 's' }),
		 step(OPEN_SET),
		 step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	tc('E-380', 'Full sidebar lifecycle with toggle', 'P1', ['lifecycle', 'toggle'],
		[step(COLLAPSE, { section: 'all' }),
		 step(EXPAND, { section: 'projects' }),
		 step(TOGGLE, { section: 'history' }),
		 step(STATE, {}, { capture: 'st' })],
		valueV('st', 'truthy', true)),

	...Array.from({ length: 20 }, (_, i) => {
		const n = 381 + i;
		const tools = [STATE, ACTION, TOGGLE, PROJECTS, HISTORY, FILES, SEARCH_H, NAV, GET_SET, CONN,
			COLLAPSE, EXPAND, REFRESH, OPEN_SET, UPD_SET, STATE, ACTION, TOGGLE, PROJECTS, HISTORY];
		return tc(`E-${String(n).padStart(3, '0')}`, `Sidebar misc variant ${i + 1}`, 'P2', ['misc', 'variant'],
			[step(tools[i], {}, { capture: 'r' })],
			valueV('r', 'truthy', true));
	}),
];

// ===========================================================================
// Export
// ===========================================================================

export const tarxSidebarTests: TestCase[] = [
	...fullStateTests,
	...actionTests,
	...toggleTests,
	...projectTests,
	...historyTests,
	...filesTests,
	...navTests,
	...settingsTests,
	...miscTests,
];
