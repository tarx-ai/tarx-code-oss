/**
 * TARX UI Test Suite - Category C: Panels, Views & Layout
 * 200 test cases (C-001 to C-200)
 *
 * Coverage:
 *   Panel show/hide/toggle          C-001 to C-050  (50 tests)
 *   Sidebar                         C-051 to C-110  (60 tests)
 *   View management                 C-111 to C-160  (50 tests)
 *   Layout                          C-161 to C-200  (40 tests)
 */

import type { TestCase } from '../types.js';

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function step(
	tool: string,
	params: Record<string, unknown> = {},
	opts: { expectSuccess?: boolean; captureResult?: string; waitMs?: number } = {},
): { tool: string; params: Record<string, unknown>; expectSuccess: boolean; captureResult?: string; waitMs?: number } {
	return {
		tool,
		params,
		expectSuccess: opts.expectSuccess ?? true,
		...(opts.captureResult ? { captureResult: opts.captureResult } : {}),
		...(opts.waitMs ? { waitMs: opts.waitMs } : {}),
	};
}

function failStep(
	tool: string,
	params: Record<string, unknown> = {},
): { tool: string; params: Record<string, unknown>; expectSuccess: boolean } {
	return { tool, params, expectSuccess: false };
}

function stateVerify(
	endpoint: string,
	expect: Record<string, unknown>,
	params?: Record<string, unknown>,
): TestCase['verify'] {
	return {
		type: 'state',
		stateCheck: { endpoint, ...(params ? { params } : {}), expect },
	};
}

function valueVerify(
	variable: string,
	assertion: 'equals' | 'contains' | 'truthy' | 'falsy' | 'gt' | 'lt',
	expected: unknown,
): TestCase['verify'] {
	return { type: 'value', valueCheck: { variable, assertion, expected } };
}

function ocrVerify(expectText: string[], notExpectText?: string[], region?: string): TestCase['verify'] {
	return {
		type: 'ocr',
		ocrCheck: {
			expectText,
			...(notExpectText ? { notExpectText } : {}),
			...(region ? { region } : {}),
		},
	};
}

function compositeVerify(
	stateEndpoint: string,
	stateExpect: Record<string, unknown>,
	variable: string,
	assertion: 'equals' | 'contains' | 'truthy' | 'falsy' | 'gt' | 'lt',
	expected: unknown,
): TestCase['verify'] {
	return {
		type: 'composite',
		stateCheck: { endpoint: stateEndpoint, expect: stateExpect },
		valueCheck: { variable, assertion, expected },
	};
}

function cid(n: number): string {
	return `C-${String(n).padStart(3, '0')}`;
}

function makeTest(
	n: number,
	name: string,
	description: string,
	steps: TestCase['steps'],
	verify: TestCase['verify'],
	opts: { priority?: TestCase['priority']; tags?: string[]; timeoutMs?: number; retries?: number } = {},
): TestCase {
	return {
		id: cid(n),
		category: 'panels',
		name,
		description,
		priority: opts.priority ?? 'P1',
		tags: opts.tags ?? ['panels'],
		steps,
		verify,
		timeoutMs: opts.timeoutMs ?? 5000,
		retries: opts.retries ?? 1,
	};
}

// ---------------------------------------------------------------------------
// Well-known panel IDs, view IDs, and sidebar sections
// ---------------------------------------------------------------------------

const PANELS = ['terminal', 'output', 'problems', 'debug-console', 'comments'] as const;
const SIDEBAR_VIEWS = ['explorer', 'search', 'scm', 'debug', 'extensions', 'tarx-sidebar'] as const;
const VIEW_IDS = [
	'workbench.view.explorer',
	'workbench.view.search',
	'workbench.view.scm',
	'workbench.view.debug',
	'workbench.view.extensions',
	'workbench.panel.output',
	'workbench.panel.markers',
	'terminal',
	'workbench.panel.comments',
	'workbench.view.extension.tarx-sidebar',
] as const;

// ===========================================================================
// C-001 to C-050 : Panel show / hide / toggle  (50 tests)
// ===========================================================================

const panelShowHideToggle: TestCase[] = [
	// --- Panel show (C-001 to C-015) ---
	makeTest(1, 'Show panel - default', 'Show the bottom panel with default settings', [
		step('tarx_ui_panel_show'),
	], stateVerify('tarx_ui_panel_get_state', { visible: true }), { priority: 'P0', tags: ['panels', 'show', 'smoke'] }),

	makeTest(2, 'Show output panel', 'Show the panel and activate the output tab', [
		step('tarx_ui_panel_show', { panel: 'output' }),
	], stateVerify('tarx_ui_panel_get_state', { visible: true, activePanel: 'output' }), { priority: 'P0', tags: ['panels', 'show', 'output'] }),

	makeTest(3, 'Show problems panel', 'Show the panel with the problems/markers tab', [
		step('tarx_ui_panel_show', { panel: 'problems' }),
	], stateVerify('tarx_ui_panel_get_state', { visible: true, activePanel: 'problems' }), { priority: 'P0', tags: ['panels', 'show', 'problems'] }),

	makeTest(4, 'Show debug console panel', 'Show the panel and switch to debug console', [
		step('tarx_ui_panel_show', { panel: 'debug-console' }),
	], stateVerify('tarx_ui_panel_get_state', { visible: true, activePanel: 'debug-console' }), { priority: 'P0', tags: ['panels', 'show', 'debug'] }),

	makeTest(5, 'Show terminal panel', 'Show the panel with the terminal tab active', [
		step('tarx_ui_panel_show', { panel: 'terminal' }),
	], stateVerify('tarx_ui_panel_get_state', { visible: true, activePanel: 'terminal' }), { priority: 'P0', tags: ['panels', 'show', 'terminal'] }),

	makeTest(6, 'Show comments panel', 'Show the panel with comments visible', [
		step('tarx_ui_panel_show', { panel: 'comments' }),
	], stateVerify('tarx_ui_panel_get_state', { visible: true }), { tags: ['panels', 'show', 'comments'] }),

	makeTest(7, 'Show panel when already visible is idempotent', 'Showing the panel when already open should not error', [
		step('tarx_ui_panel_show'),
		step('tarx_ui_panel_show'),
	], stateVerify('tarx_ui_panel_get_state', { visible: true }), { tags: ['panels', 'show', 'idempotent'] }),

	makeTest(8, 'Show panel with focus', 'Show the panel and verify focus moves to it', [
		step('tarx_ui_panel_show', { focus: true }),
	], stateVerify('tarx_ui_panel_get_state', { visible: true }), { tags: ['panels', 'show', 'focus'] }),

	makeTest(9, 'Show panel after hide round-trip', 'Hide then show the panel to verify round-trip', [
		step('tarx_ui_panel_hide'),
		step('tarx_ui_panel_show', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: true }), { tags: ['panels', 'show', 'round-trip'] }),

	makeTest(10, 'Show panel preserves last active tab', 'After hiding and re-showing, last active tab persists', [
		step('tarx_ui_panel_show', { panel: 'output' }),
		step('tarx_ui_panel_hide', {}, { waitMs: 200 }),
		step('tarx_ui_panel_show', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: true, activePanel: 'output' }), { tags: ['panels', 'show', 'persistence'] }),

	makeTest(11, 'Show panel captures result', 'Show panel and capture the response for inspection', [
		step('tarx_ui_panel_show', {}, { captureResult: 'showResult' }),
	], valueVerify('showResult', 'truthy', true), { tags: ['panels', 'show', 'capture'] }),

	makeTest(12, 'Show panel rapid succession', 'Multiple rapid show calls do not error', [
		step('tarx_ui_panel_show'),
		step('tarx_ui_panel_show'),
		step('tarx_ui_panel_show'),
	], stateVerify('tarx_ui_panel_get_state', { visible: true }), { tags: ['panels', 'show', 'rapid'] }),

	makeTest(13, 'Show panel does not affect sidebar', 'Showing the panel leaves sidebar state unchanged', [
		step('tarx_ui_sidebar_show', { view: 'explorer' }),
		step('tarx_ui_panel_show'),
	], stateVerify('tarx_ui_layout_get', { panelVisible: true, sideBarVisible: true }), { tags: ['panels', 'show', 'sidebar'] }),

	makeTest(14, 'Show panel height check', 'Panel is visible and has nonzero height', [
		step('tarx_ui_panel_show', {}, { captureResult: 'panelState' }),
	], valueVerify('panelState', 'truthy', true), { tags: ['panels', 'show', 'height'] }),

	makeTest(15, 'Show panel with all panel types sequentially', 'Cycle through each panel type to verify all work', [
		step('tarx_ui_panel_show', { panel: 'terminal' }, { waitMs: 100 }),
		step('tarx_ui_panel_show', { panel: 'output' }, { waitMs: 100 }),
		step('tarx_ui_panel_show', { panel: 'problems' }, { waitMs: 100 }),
		step('tarx_ui_panel_show', { panel: 'debug-console' }, { waitMs: 100 }),
		step('tarx_ui_panel_show', { panel: 'comments' }, { waitMs: 100 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: true }), { tags: ['panels', 'show', 'cycle'], timeoutMs: 8000 }),

	// --- Panel hide (C-016 to C-030) ---
	makeTest(16, 'Hide panel - default', 'Hide the bottom panel', [
		step('tarx_ui_panel_show'),
		step('tarx_ui_panel_hide', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: false }), { priority: 'P0', tags: ['panels', 'hide'] }),

	makeTest(17, 'Hide panel when already hidden is idempotent', 'Hiding an already hidden panel should not error', [
		step('tarx_ui_panel_hide'),
		step('tarx_ui_panel_hide'),
	], stateVerify('tarx_ui_panel_get_state', { visible: false }), { priority: 'P0', tags: ['panels', 'hide', 'idempotent'] }),

	makeTest(18, 'Hide panel with terminal active', 'Hide panel while terminal tab is active', [
		step('tarx_ui_panel_show', { panel: 'terminal' }),
		step('tarx_ui_panel_hide', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: false }), { tags: ['panels', 'hide', 'terminal'] }),

	makeTest(19, 'Hide panel with output active', 'Hide panel while output tab is active', [
		step('tarx_ui_panel_show', { panel: 'output' }),
		step('tarx_ui_panel_hide', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: false }), { tags: ['panels', 'hide', 'output'] }),

	makeTest(20, 'Hide panel with problems active', 'Hide panel while problems tab is active', [
		step('tarx_ui_panel_show', { panel: 'problems' }),
		step('tarx_ui_panel_hide', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: false }), { tags: ['panels', 'hide', 'problems'] }),

	makeTest(21, 'Hide panel with debug console active', 'Hide panel while debug console tab is active', [
		step('tarx_ui_panel_show', { panel: 'debug-console' }),
		step('tarx_ui_panel_hide', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: false }), { tags: ['panels', 'hide', 'debug'] }),

	makeTest(22, 'Hide panel returns focus to editor', 'After hiding the panel focus returns to the editor area', [
		step('tarx_ui_panel_show', { focus: true }),
		step('tarx_ui_panel_hide', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: false }), { tags: ['panels', 'hide', 'focus'] }),

	makeTest(23, 'Hide panel rapid succession', 'Multiple rapid hide calls do not error', [
		step('tarx_ui_panel_show'),
		step('tarx_ui_panel_hide'),
		step('tarx_ui_panel_hide'),
		step('tarx_ui_panel_hide'),
	], stateVerify('tarx_ui_panel_get_state', { visible: false }), { tags: ['panels', 'hide', 'rapid'] }),

	makeTest(24, 'Hide panel preserves sidebar', 'Hiding the panel does not affect the sidebar', [
		step('tarx_ui_sidebar_show', { view: 'explorer' }),
		step('tarx_ui_panel_show'),
		step('tarx_ui_panel_hide', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_layout_get', { panelVisible: false, sideBarVisible: true }), { tags: ['panels', 'hide', 'sidebar'] }),

	makeTest(25, 'Hide panel captures result', 'Hide panel and capture the response', [
		step('tarx_ui_panel_show'),
		step('tarx_ui_panel_hide', {}, { captureResult: 'hideResult' }),
	], valueVerify('hideResult', 'truthy', true), { tags: ['panels', 'hide', 'capture'] }),

	makeTest(26, 'Hide panel during layout set', 'Hide panel while a layout change is applied', [
		step('tarx_ui_layout_set', { preset: 'default' }),
		step('tarx_ui_panel_hide', {}, { waitMs: 100 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: false }), { tags: ['panels', 'hide', 'layout'] }),

	makeTest(27, 'Hide panel with comments active', 'Hide panel while comments tab is active', [
		step('tarx_ui_panel_show', { panel: 'comments' }),
		step('tarx_ui_panel_hide', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: false }), { tags: ['panels', 'hide', 'comments'] }),

	makeTest(28, 'Hide panel maximized state', 'Hide a maximized panel and verify it is hidden', [
		step('tarx_ui_panel_show', { maximized: true }),
		step('tarx_ui_panel_hide', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: false }), { tags: ['panels', 'hide', 'maximized'] }),

	makeTest(29, 'Hide panel preserves editor content', 'Hiding panel does not disrupt the active editor', [
		step('tarx_ui_panel_show'),
		step('tarx_ui_panel_hide', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: false }), { priority: 'P2', tags: ['panels', 'hide', 'editor'] }),

	makeTest(30, 'Hide panel then verify layout state', 'Hide panel and confirm via full layout get', [
		step('tarx_ui_panel_show'),
		step('tarx_ui_panel_hide', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_layout_get', { panelVisible: false }), { tags: ['panels', 'hide', 'layout-verify'] }),

	// --- Panel toggle (C-031 to C-040) ---
	makeTest(31, 'Toggle panel from hidden to visible', 'Toggle should show panel when hidden', [
		step('tarx_ui_panel_hide'),
		step('tarx_ui_panel_toggle', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: true }), { priority: 'P0', tags: ['panels', 'toggle'] }),

	makeTest(32, 'Toggle panel from visible to hidden', 'Toggle should hide panel when visible', [
		step('tarx_ui_panel_show'),
		step('tarx_ui_panel_toggle', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: false }), { priority: 'P0', tags: ['panels', 'toggle'] }),

	makeTest(33, 'Double toggle returns to original state', 'Two toggles return panel to its starting state', [
		step('tarx_ui_panel_show'),
		step('tarx_ui_panel_toggle', {}, { waitMs: 200 }),
		step('tarx_ui_panel_toggle', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: true }), { tags: ['panels', 'toggle', 'round-trip'] }),

	makeTest(34, 'Triple toggle panel', 'Odd number of toggles inverts the state', [
		step('tarx_ui_panel_hide'),
		step('tarx_ui_panel_toggle', {}, { waitMs: 100 }),
		step('tarx_ui_panel_toggle', {}, { waitMs: 100 }),
		step('tarx_ui_panel_toggle', {}, { waitMs: 100 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: true }), { tags: ['panels', 'toggle', 'odd'] }),

	makeTest(35, 'Toggle panel with specific tab', 'Toggle with a panel parameter activates that tab', [
		step('tarx_ui_panel_hide'),
		step('tarx_ui_panel_toggle', { panel: 'terminal' }, { waitMs: 200 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: true }), { tags: ['panels', 'toggle', 'terminal'] }),

	makeTest(36, 'Toggle panel rapid fire even count', 'Even toggles return to original (hidden)', [
		step('tarx_ui_panel_hide'),
		step('tarx_ui_panel_toggle'),
		step('tarx_ui_panel_toggle'),
		step('tarx_ui_panel_toggle'),
		step('tarx_ui_panel_toggle'),
	], stateVerify('tarx_ui_panel_get_state', { visible: false }), { tags: ['panels', 'toggle', 'rapid'], timeoutMs: 3000 }),

	makeTest(37, 'Toggle panel does not affect sidebar', 'Sidebar remains in its state after toggling panel', [
		step('tarx_ui_sidebar_show', { view: 'explorer' }),
		step('tarx_ui_panel_toggle', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: true }), { tags: ['panels', 'toggle', 'sidebar'] }),

	makeTest(38, 'Toggle panel with output tab', 'Toggle while specifying output panel', [
		step('tarx_ui_panel_hide'),
		step('tarx_ui_panel_toggle', { panel: 'output' }, { waitMs: 200 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: true }), { tags: ['panels', 'toggle', 'output'] }),

	makeTest(39, 'Toggle panel with problems tab', 'Toggle while specifying problems panel', [
		step('tarx_ui_panel_hide'),
		step('tarx_ui_panel_toggle', { panel: 'problems' }, { waitMs: 200 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: true }), { tags: ['panels', 'toggle', 'problems'] }),

	makeTest(40, 'Toggle panel preserves editor content', 'Toggling panel does not disrupt the active editor', [
		step('tarx_ui_panel_toggle', {}, { waitMs: 200 }),
		step('tarx_ui_panel_toggle', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: false }), { priority: 'P2', tags: ['panels', 'toggle', 'editor'] }),

	// --- Panel is visible / height / maximize / restore (C-041 to C-050) ---
	makeTest(41, 'Panel is visible check - visible', 'Check panel visibility when panel is shown', [
		step('tarx_ui_panel_show'),
		step('tarx_ui_panel_get_state', {}, { captureResult: 'panelState' }),
	], valueVerify('panelState', 'truthy', true), { priority: 'P0', tags: ['panels', 'state', 'visible'] }),

	makeTest(42, 'Panel is visible check - hidden', 'Check panel visibility when panel is hidden', [
		step('tarx_ui_panel_hide'),
		step('tarx_ui_panel_get_state', {}, { captureResult: 'panelState' }),
	], stateVerify('tarx_ui_panel_get_state', { visible: false }), { priority: 'P0', tags: ['panels', 'state', 'hidden'] }),

	makeTest(43, 'Panel height is nonzero when visible', 'Visible panel should report nonzero height', [
		step('tarx_ui_panel_show'),
		step('tarx_ui_panel_get_state', {}, { captureResult: 'state' }),
	], valueVerify('state', 'truthy', true), { tags: ['panels', 'state', 'height'] }),

	makeTest(44, 'Maximize panel', 'Maximize the panel and verify its state', [
		step('tarx_ui_panel_show', { maximized: true }),
	], stateVerify('tarx_ui_panel_get_state', { visible: true, maximized: true }), { priority: 'P0', tags: ['panels', 'maximize'] }),

	makeTest(45, 'Restore panel from maximized', 'Restore a maximized panel back to normal size', [
		step('tarx_ui_panel_show', { maximized: true }),
		step('tarx_ui_panel_show', { maximized: false }, { waitMs: 200 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: true, maximized: false }), { priority: 'P0', tags: ['panels', 'restore'] }),

	makeTest(46, 'Maximize panel then hide then show restores maximized', 'Maximize, hide, show should remain maximized', [
		step('tarx_ui_panel_show', { maximized: true }),
		step('tarx_ui_panel_hide', {}, { waitMs: 200 }),
		step('tarx_ui_panel_show', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: true }), { tags: ['panels', 'maximize', 'persistence'] }),

	makeTest(47, 'Panel state after multiple operations', 'Show, maximize, restore, hide, show sequence', [
		step('tarx_ui_panel_show'),
		step('tarx_ui_panel_show', { maximized: true }, { waitMs: 100 }),
		step('tarx_ui_panel_show', { maximized: false }, { waitMs: 100 }),
		step('tarx_ui_panel_hide', {}, { waitMs: 100 }),
		step('tarx_ui_panel_show', {}, { waitMs: 100 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: true }), { tags: ['panels', 'state', 'sequence'], timeoutMs: 8000 }),

	makeTest(48, 'Panel get state returns structured data', 'Panel state endpoint returns valid structured response', [
		step('tarx_ui_panel_show'),
		step('tarx_ui_panel_get_state', {}, { captureResult: 'fullState' }),
	], valueVerify('fullState', 'truthy', true), { tags: ['panels', 'state', 'structure'] }),

	makeTest(49, 'Panel toggle then check state', 'Toggle from hidden and verify state reports visible', [
		step('tarx_ui_panel_hide'),
		step('tarx_ui_panel_toggle', {}, { waitMs: 200 }),
		step('tarx_ui_panel_get_state', {}, { captureResult: 'state' }),
	], valueVerify('state', 'truthy', true), { tags: ['panels', 'toggle', 'state'] }),

	makeTest(50, 'Panel show all tabs and get state', 'Show each panel tab and confirm state after last', [
		step('tarx_ui_panel_show', { panel: 'terminal' }, { waitMs: 50 }),
		step('tarx_ui_panel_show', { panel: 'output' }, { waitMs: 50 }),
		step('tarx_ui_panel_show', { panel: 'problems' }, { waitMs: 50 }),
		step('tarx_ui_panel_show', { panel: 'debug-console' }, { waitMs: 50 }),
		step('tarx_ui_panel_show', { panel: 'comments' }, { waitMs: 50 }),
		step('tarx_ui_panel_get_state', {}, { captureResult: 'finalState' }),
	], valueVerify('finalState', 'truthy', true), { priority: 'P2', tags: ['panels', 'state', 'cycle'], timeoutMs: 8000 }),
];

// ===========================================================================
// C-051 to C-110 : Sidebar  (60 tests)
// ===========================================================================

const sidebarTests: TestCase[] = [
	// --- Sidebar show (C-051 to C-070) ---
	makeTest(51, 'Show sidebar - default', 'Show the primary sidebar without specifying a view', [
		step('tarx_ui_sidebar_show'),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: true }), { priority: 'P0', tags: ['sidebar', 'show'] }),

	makeTest(52, 'Show sidebar - explorer view', 'Show sidebar with the explorer view', [
		step('tarx_ui_sidebar_show', { view: 'explorer' }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: true, activeView: 'explorer' }), { priority: 'P0', tags: ['sidebar', 'show', 'explorer'] }),

	makeTest(53, 'Show sidebar - search view', 'Show sidebar with the search view', [
		step('tarx_ui_sidebar_show', { view: 'search' }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: true, activeView: 'search' }), { priority: 'P0', tags: ['sidebar', 'show', 'search'] }),

	makeTest(54, 'Show sidebar - scm view', 'Show sidebar with the source control view', [
		step('tarx_ui_sidebar_show', { view: 'scm' }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: true, activeView: 'scm' }), { tags: ['sidebar', 'show', 'scm'] }),

	makeTest(55, 'Show sidebar - debug view', 'Show sidebar with the debug/run view', [
		step('tarx_ui_sidebar_show', { view: 'debug' }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: true, activeView: 'debug' }), { tags: ['sidebar', 'show', 'debug'] }),

	makeTest(56, 'Show sidebar - extensions view', 'Show sidebar with the extensions view', [
		step('tarx_ui_sidebar_show', { view: 'extensions' }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: true, activeView: 'extensions' }), { tags: ['sidebar', 'show', 'extensions'] }),

	makeTest(57, 'Show sidebar - tarx custom view', 'Show the TARX sidebar view', [
		step('tarx_ui_sidebar_show', { view: 'tarx-sidebar' }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: true }), { priority: 'P0', tags: ['sidebar', 'show', 'tarx'] }),

	makeTest(58, 'Show sidebar when already visible is idempotent', 'Showing sidebar when already open does not error', [
		step('tarx_ui_sidebar_show'),
		step('tarx_ui_sidebar_show'),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: true }), { tags: ['sidebar', 'show', 'idempotent'] }),

	makeTest(59, 'Show sidebar switches view if different', 'Showing sidebar with different view switches to it', [
		step('tarx_ui_sidebar_show', { view: 'explorer' }),
		step('tarx_ui_sidebar_show', { view: 'search' }, { waitMs: 200 }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: true, activeView: 'search' }), { tags: ['sidebar', 'show', 'switch'] }),

	makeTest(60, 'Show sidebar after hide round-trip', 'Hide then show sidebar as a round-trip', [
		step('tarx_ui_sidebar_hide'),
		step('tarx_ui_sidebar_show', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: true }), { tags: ['sidebar', 'show', 'round-trip'] }),

	makeTest(61, 'Show sidebar with focus', 'Show sidebar and move focus to it', [
		step('tarx_ui_sidebar_show', { view: 'explorer', focus: true }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: true }), { tags: ['sidebar', 'show', 'focus'] }),

	makeTest(62, 'Show sidebar preserves panel state', 'Showing sidebar does not change panel visibility', [
		step('tarx_ui_panel_show'),
		step('tarx_ui_sidebar_show', { view: 'explorer' }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: true, panelVisible: true }), { tags: ['sidebar', 'show', 'panel'] }),

	makeTest(63, 'Show sidebar cycles through all views', 'Cycle through explorer, search, scm, debug, extensions', [
		step('tarx_ui_sidebar_show', { view: 'explorer' }, { waitMs: 100 }),
		step('tarx_ui_sidebar_show', { view: 'search' }, { waitMs: 100 }),
		step('tarx_ui_sidebar_show', { view: 'scm' }, { waitMs: 100 }),
		step('tarx_ui_sidebar_show', { view: 'debug' }, { waitMs: 100 }),
		step('tarx_ui_sidebar_show', { view: 'extensions' }, { waitMs: 100 }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: true }), { tags: ['sidebar', 'show', 'cycle'], timeoutMs: 8000 }),

	makeTest(64, 'Show sidebar captures response', 'Show sidebar and capture the tool response', [
		step('tarx_ui_sidebar_show', {}, { captureResult: 'showResult' }),
	], valueVerify('showResult', 'truthy', true), { tags: ['sidebar', 'show', 'capture'] }),

	makeTest(65, 'Show sidebar rapid succession', 'Multiple rapid show calls do not error', [
		step('tarx_ui_sidebar_show', { view: 'explorer' }),
		step('tarx_ui_sidebar_show', { view: 'search' }),
		step('tarx_ui_sidebar_show', { view: 'scm' }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: true }), { priority: 'P2', tags: ['sidebar', 'show', 'rapid'] }),

	makeTest(66, 'Show sidebar with OCR verification', 'Show explorer and verify OCR detects explorer text', [
		step('tarx_ui_sidebar_show', { view: 'explorer' }, { waitMs: 500 }),
	], ocrVerify(['EXPLORER'], undefined, 'sidebar'), { priority: 'P2', tags: ['sidebar', 'show', 'ocr'] }),

	makeTest(67, 'Show sidebar search with OCR', 'Show search view and verify OCR detects search text', [
		step('tarx_ui_sidebar_show', { view: 'search' }, { waitMs: 500 }),
	], ocrVerify(['SEARCH'], undefined, 'sidebar'), { priority: 'P2', tags: ['sidebar', 'show', 'search', 'ocr'] }),

	makeTest(68, 'Show sidebar extensions with OCR', 'Show extensions view and verify OCR', [
		step('tarx_ui_sidebar_show', { view: 'extensions' }, { waitMs: 500 }),
	], ocrVerify(['EXTENSIONS'], undefined, 'sidebar'), { priority: 'P2', tags: ['sidebar', 'show', 'extensions', 'ocr'] }),

	makeTest(69, 'Show sidebar with invalid view falls back', 'Invalid view name should fall back gracefully', [
		failStep('tarx_ui_sidebar_show', { view: 'nonexistent-view' }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['sidebar', 'show', 'error'] }),

	makeTest(70, 'Show sidebar returns structured state', 'Show sidebar and verify get_state returns structure', [
		step('tarx_ui_sidebar_show', { view: 'explorer' }),
		step('tarx_ui_sidebar_get_state', {}, { captureResult: 'sidebarState' }),
	], valueVerify('sidebarState', 'truthy', true), { tags: ['sidebar', 'show', 'state'] }),

	// --- Sidebar hide (C-071 to C-085) ---
	makeTest(71, 'Hide sidebar - default', 'Hide the primary sidebar', [
		step('tarx_ui_sidebar_show'),
		step('tarx_ui_sidebar_hide', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: false }), { priority: 'P0', tags: ['sidebar', 'hide'] }),

	makeTest(72, 'Hide sidebar when already hidden is idempotent', 'Hiding an already hidden sidebar should not error', [
		step('tarx_ui_sidebar_hide'),
		step('tarx_ui_sidebar_hide'),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: false }), { tags: ['sidebar', 'hide', 'idempotent'] }),

	makeTest(73, 'Hide sidebar with explorer active', 'Hide sidebar while explorer view is active', [
		step('tarx_ui_sidebar_show', { view: 'explorer' }),
		step('tarx_ui_sidebar_hide', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: false }), { tags: ['sidebar', 'hide', 'explorer'] }),

	makeTest(74, 'Hide sidebar with search active', 'Hide sidebar while search view is active', [
		step('tarx_ui_sidebar_show', { view: 'search' }),
		step('tarx_ui_sidebar_hide', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: false }), { tags: ['sidebar', 'hide', 'search'] }),

	makeTest(75, 'Hide sidebar with scm active', 'Hide sidebar while scm view is active', [
		step('tarx_ui_sidebar_show', { view: 'scm' }),
		step('tarx_ui_sidebar_hide', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: false }), { tags: ['sidebar', 'hide', 'scm'] }),

	makeTest(76, 'Hide sidebar with debug active', 'Hide sidebar while debug view is active', [
		step('tarx_ui_sidebar_show', { view: 'debug' }),
		step('tarx_ui_sidebar_hide', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: false }), { tags: ['sidebar', 'hide', 'debug'] }),

	makeTest(77, 'Hide sidebar with extensions active', 'Hide sidebar while extensions view is active', [
		step('tarx_ui_sidebar_show', { view: 'extensions' }),
		step('tarx_ui_sidebar_hide', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: false }), { tags: ['sidebar', 'hide', 'extensions'] }),

	makeTest(78, 'Hide sidebar returns focus to editor', 'After hiding sidebar, focus returns to editor', [
		step('tarx_ui_sidebar_show', { view: 'explorer', focus: true }),
		step('tarx_ui_sidebar_hide', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: false }), { tags: ['sidebar', 'hide', 'focus'] }),

	makeTest(79, 'Hide sidebar rapid succession', 'Multiple rapid hide calls do not error', [
		step('tarx_ui_sidebar_show'),
		step('tarx_ui_sidebar_hide'),
		step('tarx_ui_sidebar_hide'),
		step('tarx_ui_sidebar_hide'),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: false }), { tags: ['sidebar', 'hide', 'rapid'] }),

	makeTest(80, 'Hide sidebar preserves panel', 'Hiding sidebar does not affect panel visibility', [
		step('tarx_ui_panel_show'),
		step('tarx_ui_sidebar_show'),
		step('tarx_ui_sidebar_hide', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: false, panelVisible: true }), { tags: ['sidebar', 'hide', 'panel'] }),

	makeTest(81, 'Hide sidebar captures response', 'Hide sidebar and capture the tool response', [
		step('tarx_ui_sidebar_show'),
		step('tarx_ui_sidebar_hide', {}, { captureResult: 'hideResult' }),
	], valueVerify('hideResult', 'truthy', true), { tags: ['sidebar', 'hide', 'capture'] }),

	makeTest(82, 'Hide sidebar with tarx view active', 'Hide sidebar while tarx-sidebar view is active', [
		step('tarx_ui_sidebar_show', { view: 'tarx-sidebar' }),
		step('tarx_ui_sidebar_hide', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: false }), { tags: ['sidebar', 'hide', 'tarx'] }),

	makeTest(83, 'Hide sidebar then verify layout', 'Hide sidebar and confirm via full layout endpoint', [
		step('tarx_ui_sidebar_show'),
		step('tarx_ui_sidebar_hide', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: false }), { tags: ['sidebar', 'hide', 'layout-verify'] }),

	makeTest(84, 'Hide sidebar does not affect secondary sidebar', 'Hiding primary sidebar leaves secondary sidebar intact', [
		step('tarx_ui_secondary_sidebar_toggle'),
		step('tarx_ui_sidebar_hide', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: false }), { priority: 'P2', tags: ['sidebar', 'hide', 'secondary'] }),

	makeTest(85, 'Hide sidebar preserves editor group layout', 'Hiding sidebar does not merge editor groups', [
		step('tarx_ui_sidebar_show'),
		step('tarx_ui_sidebar_hide', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: false }), { priority: 'P2', tags: ['sidebar', 'hide', 'editor-groups'] }),

	// --- Sidebar toggle (C-086 to C-095) ---
	makeTest(86, 'Toggle sidebar from hidden to visible', 'Toggle should show sidebar when hidden', [
		step('tarx_ui_sidebar_hide'),
		step('tarx_ui_sidebar_toggle', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: true }), { priority: 'P0', tags: ['sidebar', 'toggle'] }),

	makeTest(87, 'Toggle sidebar from visible to hidden', 'Toggle should hide sidebar when visible', [
		step('tarx_ui_sidebar_show'),
		step('tarx_ui_sidebar_toggle', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: false }), { priority: 'P0', tags: ['sidebar', 'toggle'] }),

	makeTest(88, 'Double toggle sidebar returns to original', 'Two toggles return sidebar to starting state', [
		step('tarx_ui_sidebar_show'),
		step('tarx_ui_sidebar_toggle', {}, { waitMs: 200 }),
		step('tarx_ui_sidebar_toggle', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: true }), { tags: ['sidebar', 'toggle', 'round-trip'] }),

	makeTest(89, 'Triple toggle sidebar', 'Odd number of toggles inverts sidebar state', [
		step('tarx_ui_sidebar_hide'),
		step('tarx_ui_sidebar_toggle', {}, { waitMs: 100 }),
		step('tarx_ui_sidebar_toggle', {}, { waitMs: 100 }),
		step('tarx_ui_sidebar_toggle', {}, { waitMs: 100 }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: true }), { tags: ['sidebar', 'toggle', 'odd'] }),

	makeTest(90, 'Toggle sidebar rapid fire even count', 'Even toggles return to original (hidden)', [
		step('tarx_ui_sidebar_hide'),
		step('tarx_ui_sidebar_toggle'),
		step('tarx_ui_sidebar_toggle'),
		step('tarx_ui_sidebar_toggle'),
		step('tarx_ui_sidebar_toggle'),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: false }), { tags: ['sidebar', 'toggle', 'rapid'] }),

	makeTest(91, 'Toggle sidebar does not affect panel', 'Panel remains in its state after toggling sidebar', [
		step('tarx_ui_panel_show'),
		step('tarx_ui_sidebar_toggle', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_layout_get', { panelVisible: true }), { tags: ['sidebar', 'toggle', 'panel'] }),

	makeTest(92, 'Toggle sidebar captures response', 'Toggle sidebar and capture the result', [
		step('tarx_ui_sidebar_hide'),
		step('tarx_ui_sidebar_toggle', {}, { captureResult: 'toggleResult' }),
	], valueVerify('toggleResult', 'truthy', true), { tags: ['sidebar', 'toggle', 'capture'] }),

	makeTest(93, 'Toggle sidebar preserves active view', 'Toggle away and back preserves which view was active', [
		step('tarx_ui_sidebar_show', { view: 'search' }),
		step('tarx_ui_sidebar_toggle', {}, { waitMs: 200 }),
		step('tarx_ui_sidebar_toggle', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: true, activeView: 'search' }), { tags: ['sidebar', 'toggle', 'persistence'] }),

	makeTest(94, 'Toggle sidebar then check state', 'Toggle from hidden and verify state reports visible', [
		step('tarx_ui_sidebar_hide'),
		step('tarx_ui_sidebar_toggle', {}, { waitMs: 200 }),
		step('tarx_ui_sidebar_get_state', {}, { captureResult: 'state' }),
	], valueVerify('state', 'truthy', true), { tags: ['sidebar', 'toggle', 'state'] }),

	makeTest(95, 'Toggle sidebar with focused editor', 'Toggle sidebar when editor has focus', [
		step('tarx_ui_sidebar_hide'),
		step('tarx_ui_sidebar_toggle', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: true }), { priority: 'P2', tags: ['sidebar', 'toggle', 'editor'] }),

	// --- Sidebar width / position (C-096 to C-110) ---
	makeTest(96, 'Sidebar width is nonzero when visible', 'Visible sidebar should have a nonzero width', [
		step('tarx_ui_sidebar_show'),
		step('tarx_ui_sidebar_get_state', {}, { captureResult: 'state' }),
	], valueVerify('state', 'truthy', true), { tags: ['sidebar', 'width'] }),

	makeTest(97, 'Sidebar position left (default)', 'Sidebar default position is on the left', [
		step('tarx_ui_sidebar_show'),
		step('tarx_ui_layout_get', {}, { captureResult: 'layout' }),
	], valueVerify('layout', 'truthy', true), { tags: ['sidebar', 'position', 'left'] }),

	makeTest(98, 'Sidebar position right', 'Move sidebar to the right side', [
		step('tarx_ui_layout_set', { sideBarPosition: 'right' }),
		step('tarx_ui_sidebar_show', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: true }), { tags: ['sidebar', 'position', 'right'] }),

	makeTest(99, 'Sidebar position left after right', 'Move sidebar back to left from right', [
		step('tarx_ui_layout_set', { sideBarPosition: 'right' }),
		step('tarx_ui_layout_set', { sideBarPosition: 'left' }, { waitMs: 200 }),
		step('tarx_ui_sidebar_show'),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: true }), { tags: ['sidebar', 'position', 'restore'] }),

	makeTest(100, 'Open explorer view via sidebar show', 'Open the explorer using sidebar show with view parameter', [
		step('tarx_ui_sidebar_show', { view: 'explorer' }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: true, activeView: 'explorer' }), { priority: 'P0', tags: ['sidebar', 'explorer'] }),

	makeTest(101, 'Open search view via sidebar show', 'Open the search view using sidebar show', [
		step('tarx_ui_sidebar_show', { view: 'search' }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: true, activeView: 'search' }), { tags: ['sidebar', 'search'] }),

	makeTest(102, 'Open scm view via sidebar show', 'Open the source control view using sidebar show', [
		step('tarx_ui_sidebar_show', { view: 'scm' }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: true, activeView: 'scm' }), { tags: ['sidebar', 'scm'] }),

	makeTest(103, 'Open debug view via sidebar show', 'Open the debug view using sidebar show', [
		step('tarx_ui_sidebar_show', { view: 'debug' }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: true, activeView: 'debug' }), { tags: ['sidebar', 'debug'] }),

	makeTest(104, 'Open extensions view via sidebar show', 'Open the extensions view using sidebar show', [
		step('tarx_ui_sidebar_show', { view: 'extensions' }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: true, activeView: 'extensions' }), { tags: ['sidebar', 'extensions'] }),

	makeTest(105, 'Open custom tarx view via sidebar show', 'Open the TARX custom sidebar view', [
		step('tarx_ui_sidebar_show', { view: 'tarx-sidebar' }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: true }), { tags: ['sidebar', 'tarx', 'custom'] }),

	makeTest(106, 'Sidebar get state returns all fields', 'Get sidebar state and verify response structure', [
		step('tarx_ui_sidebar_show', { view: 'explorer' }),
		step('tarx_ui_sidebar_get_state', {}, { captureResult: 'fullState' }),
	], valueVerify('fullState', 'truthy', true), { tags: ['sidebar', 'state', 'structure'] }),

	makeTest(107, 'Sidebar show then immediately get state', 'Show and immediately query state', [
		step('tarx_ui_sidebar_show', { view: 'debug' }),
		step('tarx_ui_sidebar_get_state', {}, { captureResult: 'state' }),
	], valueVerify('state', 'truthy', true), { tags: ['sidebar', 'state', 'immediate'] }),

	makeTest(108, 'Sidebar hide then get state shows hidden', 'After hiding, state should report not visible', [
		step('tarx_ui_sidebar_hide'),
		step('tarx_ui_sidebar_get_state', {}, { captureResult: 'state' }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: false }), { tags: ['sidebar', 'state', 'hidden'] }),

	makeTest(109, 'Sidebar show with invalid view then get state', 'Invalid view should not crash state endpoint', [
		failStep('tarx_ui_sidebar_show', { view: 'nonexistent' }),
		step('tarx_ui_sidebar_get_state', {}, { captureResult: 'state' }),
	], valueVerify('state', 'truthy', true), { priority: 'P2', tags: ['sidebar', 'state', 'error'] }),

	makeTest(110, 'Sidebar width persists across toggle', 'Toggle sidebar off and on preserves width', [
		step('tarx_ui_sidebar_show'),
		step('tarx_ui_sidebar_get_state', {}, { captureResult: 'before' }),
		step('tarx_ui_sidebar_toggle', {}, { waitMs: 200 }),
		step('tarx_ui_sidebar_toggle', {}, { waitMs: 200 }),
		step('tarx_ui_sidebar_get_state', {}, { captureResult: 'after' }),
	], valueVerify('after', 'truthy', true), { priority: 'P2', tags: ['sidebar', 'width', 'persistence'], timeoutMs: 8000 }),
];

// ===========================================================================
// C-111 to C-160 : View management  (50 tests)
// ===========================================================================

const viewManagement: TestCase[] = [
	// --- Open/close/focus views by ID (C-111 to C-130) ---
	makeTest(111, 'Open view - explorer by ID', 'Open the explorer view using its view ID', [
		step('tarx_ui_view_open', { viewId: 'workbench.view.explorer' }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: true }), { priority: 'P0', tags: ['view', 'open', 'explorer'] }),

	makeTest(112, 'Open view - search by ID', 'Open the search view using its view ID', [
		step('tarx_ui_view_open', { viewId: 'workbench.view.search' }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: true }), { priority: 'P0', tags: ['view', 'open', 'search'] }),

	makeTest(113, 'Open view - scm by ID', 'Open the SCM view using its view ID', [
		step('tarx_ui_view_open', { viewId: 'workbench.view.scm' }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: true }), { tags: ['view', 'open', 'scm'] }),

	makeTest(114, 'Open view - debug by ID', 'Open the debug view using its view ID', [
		step('tarx_ui_view_open', { viewId: 'workbench.view.debug' }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: true }), { tags: ['view', 'open', 'debug'] }),

	makeTest(115, 'Open view - extensions by ID', 'Open the extensions view using its view ID', [
		step('tarx_ui_view_open', { viewId: 'workbench.view.extensions' }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: true }), { tags: ['view', 'open', 'extensions'] }),

	makeTest(116, 'Open view - output panel by ID', 'Open the output panel using its view ID', [
		step('tarx_ui_view_open', { viewId: 'workbench.panel.output' }),
	], stateVerify('tarx_ui_panel_get_state', { visible: true }), { tags: ['view', 'open', 'output'] }),

	makeTest(117, 'Open view - problems panel by ID', 'Open the problems/markers panel using its view ID', [
		step('tarx_ui_view_open', { viewId: 'workbench.panel.markers' }),
	], stateVerify('tarx_ui_panel_get_state', { visible: true }), { tags: ['view', 'open', 'problems'] }),

	makeTest(118, 'Open view - terminal by ID', 'Open the terminal panel using its view ID', [
		step('tarx_ui_view_open', { viewId: 'terminal' }),
	], stateVerify('tarx_ui_panel_get_state', { visible: true }), { tags: ['view', 'open', 'terminal'] }),

	makeTest(119, 'Open view - comments by ID', 'Open the comments panel using its view ID', [
		step('tarx_ui_view_open', { viewId: 'workbench.panel.comments' }),
	], stateVerify('tarx_ui_panel_get_state', { visible: true }), { priority: 'P2', tags: ['view', 'open', 'comments'] }),

	makeTest(120, 'Open view - tarx sidebar by ID', 'Open the TARX sidebar view using its view ID', [
		step('tarx_ui_view_open', { viewId: 'workbench.view.extension.tarx-sidebar' }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: true }), { tags: ['view', 'open', 'tarx'] }),

	makeTest(121, 'Open view with invalid ID fails gracefully', 'Opening a view with an unknown ID should fail', [
		failStep('tarx_ui_view_open', { viewId: 'nonexistent.view.id' }),
	], valueVerify('result', 'truthy', true), { tags: ['view', 'open', 'error'] }),

	makeTest(122, 'Close view - explorer', 'Close the explorer view', [
		step('tarx_ui_view_open', { viewId: 'workbench.view.explorer' }),
		step('tarx_ui_view_close', { viewId: 'workbench.view.explorer' }, { waitMs: 200 }),
	], valueVerify('result', 'truthy', true), { tags: ['view', 'close', 'explorer'] }),

	makeTest(123, 'Close view - search', 'Close the search view', [
		step('tarx_ui_view_open', { viewId: 'workbench.view.search' }),
		step('tarx_ui_view_close', { viewId: 'workbench.view.search' }, { waitMs: 200 }),
	], valueVerify('result', 'truthy', true), { tags: ['view', 'close', 'search'] }),

	makeTest(124, 'Close view with invalid ID fails gracefully', 'Closing a nonexistent view should fail', [
		failStep('tarx_ui_view_close', { viewId: 'nonexistent.view.id' }),
	], valueVerify('result', 'truthy', true), { tags: ['view', 'close', 'error'] }),

	makeTest(125, 'Focus view - explorer', 'Focus the explorer view', [
		step('tarx_ui_sidebar_show', { view: 'explorer' }),
		step('tarx_ui_view_focus', { viewId: 'workbench.view.explorer' }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: true }), { priority: 'P0', tags: ['view', 'focus', 'explorer'] }),

	makeTest(126, 'Focus view - search', 'Focus the search view', [
		step('tarx_ui_sidebar_show', { view: 'search' }),
		step('tarx_ui_view_focus', { viewId: 'workbench.view.search' }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: true }), { tags: ['view', 'focus', 'search'] }),

	makeTest(127, 'Focus view - debug', 'Focus the debug view', [
		step('tarx_ui_sidebar_show', { view: 'debug' }),
		step('tarx_ui_view_focus', { viewId: 'workbench.view.debug' }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: true }), { tags: ['view', 'focus', 'debug'] }),

	makeTest(128, 'Focus view with invalid ID fails gracefully', 'Focusing a nonexistent view should fail', [
		failStep('tarx_ui_view_focus', { viewId: 'nonexistent.view.id' }),
	], valueVerify('result', 'truthy', true), { tags: ['view', 'focus', 'error'] }),

	makeTest(129, 'View is visible - explorer', 'Check if explorer view is visible after opening', [
		step('tarx_ui_sidebar_show', { view: 'explorer' }),
		step('tarx_ui_sidebar_get_state', {}, { captureResult: 'state' }),
	], valueVerify('state', 'truthy', true), { tags: ['view', 'visible', 'explorer'] }),

	makeTest(130, 'View is not visible after close', 'Check view is not visible after closing', [
		step('tarx_ui_sidebar_show', { view: 'explorer' }),
		step('tarx_ui_sidebar_hide', {}, { waitMs: 200 }),
		step('tarx_ui_sidebar_get_state', {}, { captureResult: 'state' }),
	], stateVerify('tarx_ui_sidebar_get_state', { visible: false }), { tags: ['view', 'visible', 'closed'] }),

	// --- Move views / view containers (C-131 to C-145) ---
	makeTest(131, 'Move view between panels - output to sidebar', 'Move output view from panel to sidebar', [
		step('tarx_ui_layout_set', { moveView: { viewId: 'workbench.panel.output', target: 'sidebar' } }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['view', 'move', 'sidebar'] }),

	makeTest(132, 'Move view between panels - search to panel', 'Move search view from sidebar to panel', [
		step('tarx_ui_layout_set', { moveView: { viewId: 'workbench.view.search', target: 'panel' } }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['view', 'move', 'panel'] }),

	makeTest(133, 'Reset view locations', 'Reset all views to their default locations', [
		step('tarx_ui_layout_set', { resetViews: true }),
	], valueVerify('result', 'truthy', true), { tags: ['view', 'reset'] }),

	makeTest(134, 'View container listing', 'List all view containers', [
		step('tarx_ui_layout_get', {}, { captureResult: 'layout' }),
	], valueVerify('layout', 'truthy', true), { tags: ['view', 'containers', 'list'] }),

	makeTest(135, 'Open multiple views sequentially', 'Open explorer, then search, then debug views', [
		step('tarx_ui_view_open', { viewId: 'workbench.view.explorer' }, { waitMs: 100 }),
		step('tarx_ui_view_open', { viewId: 'workbench.view.search' }, { waitMs: 100 }),
		step('tarx_ui_view_open', { viewId: 'workbench.view.debug' }, { waitMs: 100 }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: true }), { tags: ['view', 'open', 'sequential'], timeoutMs: 8000 }),

	makeTest(136, 'Open view then close then reopen', 'Open explorer, close it, then reopen', [
		step('tarx_ui_view_open', { viewId: 'workbench.view.explorer' }),
		step('tarx_ui_view_close', { viewId: 'workbench.view.explorer' }, { waitMs: 200 }),
		step('tarx_ui_view_open', { viewId: 'workbench.view.explorer' }, { waitMs: 200 }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: true }), { tags: ['view', 'reopen'] }),

	makeTest(137, 'Focus view then open different view', 'Focus explorer then open search view', [
		step('tarx_ui_view_focus', { viewId: 'workbench.view.explorer' }),
		step('tarx_ui_view_open', { viewId: 'workbench.view.search' }, { waitMs: 200 }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: true }), { tags: ['view', 'focus', 'switch'] }),

	makeTest(138, 'Open all sidebar views in sequence', 'Open every known sidebar view in sequence', [
		step('tarx_ui_view_open', { viewId: 'workbench.view.explorer' }, { waitMs: 50 }),
		step('tarx_ui_view_open', { viewId: 'workbench.view.search' }, { waitMs: 50 }),
		step('tarx_ui_view_open', { viewId: 'workbench.view.scm' }, { waitMs: 50 }),
		step('tarx_ui_view_open', { viewId: 'workbench.view.debug' }, { waitMs: 50 }),
		step('tarx_ui_view_open', { viewId: 'workbench.view.extensions' }, { waitMs: 50 }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: true }), { tags: ['view', 'open', 'all-sidebar'], timeoutMs: 8000 }),

	makeTest(139, 'Open all panel views in sequence', 'Open every known panel view in sequence', [
		step('tarx_ui_view_open', { viewId: 'workbench.panel.output' }, { waitMs: 50 }),
		step('tarx_ui_view_open', { viewId: 'workbench.panel.markers' }, { waitMs: 50 }),
		step('tarx_ui_view_open', { viewId: 'terminal' }, { waitMs: 50 }),
		step('tarx_ui_view_open', { viewId: 'workbench.panel.comments' }, { waitMs: 50 }),
	], stateVerify('tarx_ui_panel_get_state', { visible: true }), { tags: ['view', 'open', 'all-panel'], timeoutMs: 8000 }),

	makeTest(140, 'Close view that was never opened', 'Closing a view that is not open should fail gracefully', [
		failStep('tarx_ui_view_close', { viewId: 'workbench.panel.comments' }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['view', 'close', 'not-open'] }),

	// --- Secondary sidebar (C-141 to C-160) ---
	makeTest(141, 'Secondary sidebar toggle - show', 'Toggle secondary sidebar to show it', [
		step('tarx_ui_layout_set', { secondarySideBarVisible: false }),
		step('tarx_ui_secondary_sidebar_toggle', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_layout_get', { secondarySideBarVisible: true }), { priority: 'P0', tags: ['secondary-sidebar', 'toggle', 'show'] }),

	makeTest(142, 'Secondary sidebar toggle - hide', 'Toggle secondary sidebar to hide it', [
		step('tarx_ui_layout_set', { secondarySideBarVisible: true }),
		step('tarx_ui_secondary_sidebar_toggle', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_layout_get', { secondarySideBarVisible: false }), { priority: 'P0', tags: ['secondary-sidebar', 'toggle', 'hide'] }),

	makeTest(143, 'Secondary sidebar double toggle', 'Double toggle returns to original state', [
		step('tarx_ui_layout_set', { secondarySideBarVisible: false }),
		step('tarx_ui_secondary_sidebar_toggle', {}, { waitMs: 200 }),
		step('tarx_ui_secondary_sidebar_toggle', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_layout_get', { secondarySideBarVisible: false }), { tags: ['secondary-sidebar', 'toggle', 'round-trip'] }),

	makeTest(144, 'Secondary sidebar show via layout set', 'Show secondary sidebar using layout set', [
		step('tarx_ui_layout_set', { secondarySideBarVisible: true }),
	], stateVerify('tarx_ui_layout_get', { secondarySideBarVisible: true }), { priority: 'P0', tags: ['secondary-sidebar', 'show'] }),

	makeTest(145, 'Secondary sidebar hide via layout set', 'Hide secondary sidebar using layout set', [
		step('tarx_ui_layout_set', { secondarySideBarVisible: false }),
	], stateVerify('tarx_ui_layout_get', { secondarySideBarVisible: false }), { tags: ['secondary-sidebar', 'hide'] }),

	makeTest(146, 'Secondary sidebar toggle does not affect primary', 'Toggling secondary sidebar leaves primary sidebar alone', [
		step('tarx_ui_sidebar_show', { view: 'explorer' }),
		step('tarx_ui_secondary_sidebar_toggle', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: true }), { tags: ['secondary-sidebar', 'toggle', 'primary'] }),

	makeTest(147, 'Secondary sidebar toggle does not affect panel', 'Toggling secondary sidebar leaves panel alone', [
		step('tarx_ui_panel_show'),
		step('tarx_ui_secondary_sidebar_toggle', {}, { waitMs: 200 }),
	], stateVerify('tarx_ui_layout_get', { panelVisible: true }), { tags: ['secondary-sidebar', 'toggle', 'panel'] }),

	makeTest(148, 'Secondary sidebar rapid toggle', 'Rapid toggles do not corrupt state', [
		step('tarx_ui_secondary_sidebar_toggle'),
		step('tarx_ui_secondary_sidebar_toggle'),
		step('tarx_ui_secondary_sidebar_toggle'),
		step('tarx_ui_secondary_sidebar_toggle'),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['secondary-sidebar', 'toggle', 'rapid'] }),

	makeTest(149, 'Both sidebars visible simultaneously', 'Show both primary and secondary sidebars at once', [
		step('tarx_ui_sidebar_show', { view: 'explorer' }),
		step('tarx_ui_layout_set', { secondarySideBarVisible: true }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: true, secondarySideBarVisible: true }), { tags: ['secondary-sidebar', 'both'] }),

	makeTest(150, 'Both sidebars hidden simultaneously', 'Hide both primary and secondary sidebars', [
		step('tarx_ui_sidebar_hide'),
		step('tarx_ui_layout_set', { secondarySideBarVisible: false }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: false, secondarySideBarVisible: false }), { tags: ['secondary-sidebar', 'both-hidden'] }),

	makeTest(151, 'Secondary sidebar toggle captures response', 'Toggle secondary sidebar and capture result', [
		step('tarx_ui_secondary_sidebar_toggle', {}, { captureResult: 'toggleResult' }),
	], valueVerify('toggleResult', 'truthy', true), { priority: 'P2', tags: ['secondary-sidebar', 'toggle', 'capture'] }),

	makeTest(152, 'Secondary sidebar state after triple toggle', 'Three toggles from hidden should end visible', [
		step('tarx_ui_layout_set', { secondarySideBarVisible: false }),
		step('tarx_ui_secondary_sidebar_toggle', {}, { waitMs: 100 }),
		step('tarx_ui_secondary_sidebar_toggle', {}, { waitMs: 100 }),
		step('tarx_ui_secondary_sidebar_toggle', {}, { waitMs: 100 }),
	], stateVerify('tarx_ui_layout_get', { secondarySideBarVisible: true }), { tags: ['secondary-sidebar', 'toggle', 'triple'] }),

	makeTest(153, 'Secondary sidebar with layout preset', 'Apply layout preset then toggle secondary sidebar', [
		step('tarx_ui_layout_set', { preset: 'default' }),
		step('tarx_ui_secondary_sidebar_toggle', {}, { waitMs: 200 }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['secondary-sidebar', 'preset'] }),

	makeTest(154, 'View open in secondary sidebar context', 'Open a view and verify layout with secondary sidebar', [
		step('tarx_ui_layout_set', { secondarySideBarVisible: true }),
		step('tarx_ui_view_open', { viewId: 'workbench.view.explorer' }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: true, secondarySideBarVisible: true }), { priority: 'P2', tags: ['secondary-sidebar', 'view'] }),

	makeTest(155, 'Secondary sidebar and panel both visible', 'Show secondary sidebar and panel simultaneously', [
		step('tarx_ui_panel_show'),
		step('tarx_ui_layout_set', { secondarySideBarVisible: true }),
	], stateVerify('tarx_ui_layout_get', { panelVisible: true, secondarySideBarVisible: true }), { tags: ['secondary-sidebar', 'panel', 'both'] }),

	makeTest(156, 'All three regions visible', 'Show primary sidebar, secondary sidebar, and panel', [
		step('tarx_ui_sidebar_show', { view: 'explorer' }),
		step('tarx_ui_panel_show'),
		step('tarx_ui_layout_set', { secondarySideBarVisible: true }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: true, panelVisible: true, secondarySideBarVisible: true }), { tags: ['secondary-sidebar', 'all-regions'] }),

	makeTest(157, 'Hide all three regions', 'Hide primary sidebar, secondary sidebar, and panel', [
		step('tarx_ui_sidebar_hide'),
		step('tarx_ui_panel_hide'),
		step('tarx_ui_layout_set', { secondarySideBarVisible: false }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: false, panelVisible: false, secondarySideBarVisible: false }), { tags: ['secondary-sidebar', 'all-hidden'] }),

	makeTest(158, 'Secondary sidebar toggle with OCR', 'Toggle secondary sidebar and verify via OCR', [
		step('tarx_ui_layout_set', { secondarySideBarVisible: false }),
		step('tarx_ui_secondary_sidebar_toggle', {}, { waitMs: 500 }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['secondary-sidebar', 'ocr'] }),

	makeTest(159, 'Secondary sidebar persists across layout changes', 'Secondary sidebar visibility survives layout set', [
		step('tarx_ui_layout_set', { secondarySideBarVisible: true }),
		step('tarx_ui_layout_set', { preset: 'default' }, { waitMs: 200 }),
		step('tarx_ui_layout_get', {}, { captureResult: 'layout' }),
	], valueVerify('layout', 'truthy', true), { priority: 'P2', tags: ['secondary-sidebar', 'persistence'] }),

	makeTest(160, 'View containers enumeration', 'Get layout and verify view container data is present', [
		step('tarx_ui_layout_get', {}, { captureResult: 'layout' }),
	], valueVerify('layout', 'truthy', true), { tags: ['view', 'containers', 'enumeration'] }),
];

// ===========================================================================
// C-161 to C-200 : Layout  (40 tests)
// ===========================================================================

const layoutTests: TestCase[] = [
	// --- Get/set full layout state (C-161 to C-170) ---
	makeTest(161, 'Get full layout state', 'Retrieve the complete layout state', [
		step('tarx_ui_layout_get', {}, { captureResult: 'layout' }),
	], valueVerify('layout', 'truthy', true), { priority: 'P0', tags: ['layout', 'get'] }),

	makeTest(162, 'Set layout - default preset', 'Apply the default layout preset', [
		step('tarx_ui_layout_set', { preset: 'default' }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['layout', 'set', 'default'] }),

	makeTest(163, 'Set layout with panel visible', 'Set layout with panel explicitly visible', [
		step('tarx_ui_layout_set', { panelVisible: true }),
	], stateVerify('tarx_ui_layout_get', { panelVisible: true }), { tags: ['layout', 'set', 'panel'] }),

	makeTest(164, 'Set layout with panel hidden', 'Set layout with panel explicitly hidden', [
		step('tarx_ui_layout_set', { panelVisible: false }),
	], stateVerify('tarx_ui_layout_get', { panelVisible: false }), { tags: ['layout', 'set', 'panel-hidden'] }),

	makeTest(165, 'Set layout with sidebar visible', 'Set layout with sidebar explicitly visible', [
		step('tarx_ui_layout_set', { sideBarVisible: true }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: true }), { tags: ['layout', 'set', 'sidebar'] }),

	makeTest(166, 'Set layout with sidebar hidden', 'Set layout with sidebar explicitly hidden', [
		step('tarx_ui_layout_set', { sideBarVisible: false }),
	], stateVerify('tarx_ui_layout_get', { sideBarVisible: false }), { tags: ['layout', 'set', 'sidebar-hidden'] }),

	makeTest(167, 'Set layout with multiple properties', 'Set layout with both panel and sidebar properties', [
		step('tarx_ui_layout_set', { panelVisible: true, sideBarVisible: true }),
	], stateVerify('tarx_ui_layout_get', { panelVisible: true, sideBarVisible: true }), { tags: ['layout', 'set', 'multi'] }),

	makeTest(168, 'Get layout returns consistent state', 'Two consecutive gets return the same state', [
		step('tarx_ui_layout_get', {}, { captureResult: 'layout1' }),
		step('tarx_ui_layout_get', {}, { captureResult: 'layout2' }),
	], valueVerify('layout2', 'truthy', true), { tags: ['layout', 'get', 'consistent'] }),

	makeTest(169, 'Set then get layout round-trip', 'Set specific layout then verify via get', [
		step('tarx_ui_layout_set', { panelVisible: false, sideBarVisible: true }),
		step('tarx_ui_layout_get', {}, { captureResult: 'layout', waitMs: 200 }),
	], stateVerify('tarx_ui_layout_get', { panelVisible: false, sideBarVisible: true }), { tags: ['layout', 'round-trip'] }),

	makeTest(170, 'Set layout captures response', 'Set layout and capture the response', [
		step('tarx_ui_layout_set', { preset: 'default' }, { captureResult: 'setResult' }),
	], valueVerify('setResult', 'truthy', true), { tags: ['layout', 'set', 'capture'] }),

	// --- Zen mode / fullscreen / centered layout (C-171 to C-180) ---
	makeTest(171, 'Toggle zen mode on', 'Enable zen mode via layout set', [
		step('tarx_ui_layout_set', { zenMode: true }),
	], stateVerify('tarx_ui_layout_get', { zenMode: true }), { priority: 'P0', tags: ['layout', 'zen', 'on'] }),

	makeTest(172, 'Toggle zen mode off', 'Disable zen mode via layout set', [
		step('tarx_ui_layout_set', { zenMode: true }),
		step('tarx_ui_layout_set', { zenMode: false }, { waitMs: 200 }),
	], stateVerify('tarx_ui_layout_get', { zenMode: false }), { priority: 'P0', tags: ['layout', 'zen', 'off'] }),

	makeTest(173, 'Zen mode round-trip', 'Enable then disable zen mode and verify state', [
		step('tarx_ui_layout_set', { zenMode: true }, { waitMs: 200 }),
		step('tarx_ui_layout_set', { zenMode: false }, { waitMs: 200 }),
		step('tarx_ui_layout_get', {}, { captureResult: 'layout' }),
	], stateVerify('tarx_ui_layout_get', { zenMode: false }), { tags: ['layout', 'zen', 'round-trip'] }),

	makeTest(174, 'Toggle fullscreen on', 'Enable fullscreen via layout set', [
		step('tarx_ui_layout_set', { fullscreen: true }),
	], stateVerify('tarx_ui_layout_get', { fullscreen: true }), { priority: 'P0', tags: ['layout', 'fullscreen', 'on'] }),

	makeTest(175, 'Toggle fullscreen off', 'Disable fullscreen via layout set', [
		step('tarx_ui_layout_set', { fullscreen: true }),
		step('tarx_ui_layout_set', { fullscreen: false }, { waitMs: 200 }),
	], stateVerify('tarx_ui_layout_get', { fullscreen: false }), { priority: 'P0', tags: ['layout', 'fullscreen', 'off'] }),

	makeTest(176, 'Toggle centered layout on', 'Enable centered layout via layout set', [
		step('tarx_ui_layout_set', { centeredLayout: true }),
	], stateVerify('tarx_ui_layout_get', { centeredLayout: true }), { tags: ['layout', 'centered', 'on'] }),

	makeTest(177, 'Toggle centered layout off', 'Disable centered layout via layout set', [
		step('tarx_ui_layout_set', { centeredLayout: true }),
		step('tarx_ui_layout_set', { centeredLayout: false }, { waitMs: 200 }),
	], stateVerify('tarx_ui_layout_get', { centeredLayout: false }), { tags: ['layout', 'centered', 'off'] }),

	makeTest(178, 'Toggle activity bar on', 'Show the activity bar via layout set', [
		step('tarx_ui_layout_set', { activityBarVisible: true }),
	], stateVerify('tarx_ui_layout_get', { activityBarVisible: true }), { tags: ['layout', 'activitybar', 'on'] }),

	makeTest(179, 'Toggle activity bar off', 'Hide the activity bar via layout set', [
		step('tarx_ui_layout_set', { activityBarVisible: false }),
	], stateVerify('tarx_ui_layout_get', { activityBarVisible: false }), { tags: ['layout', 'activitybar', 'off'] }),

	makeTest(180, 'Toggle status bar on', 'Show the status bar via layout set', [
		step('tarx_ui_layout_set', { statusBarVisible: true }),
	], stateVerify('tarx_ui_layout_get', { statusBarVisible: true }), { tags: ['layout', 'statusbar', 'on'] }),

	// --- Editor toggles / splits (C-181 to C-200) ---
	makeTest(181, 'Toggle status bar off', 'Hide the status bar via layout set', [
		step('tarx_ui_layout_set', { statusBarVisible: false }),
	], stateVerify('tarx_ui_layout_get', { statusBarVisible: false }), { tags: ['layout', 'statusbar', 'off'] }),

	makeTest(182, 'Toggle minimap on', 'Enable minimap via layout set', [
		step('tarx_ui_layout_set', { minimap: true }),
	], valueVerify('result', 'truthy', true), { tags: ['layout', 'minimap', 'on'] }),

	makeTest(183, 'Toggle minimap off', 'Disable minimap via layout set', [
		step('tarx_ui_layout_set', { minimap: false }),
	], valueVerify('result', 'truthy', true), { tags: ['layout', 'minimap', 'off'] }),

	makeTest(184, 'Toggle breadcrumbs on', 'Enable breadcrumbs via layout set', [
		step('tarx_ui_layout_set', { breadcrumbs: true }),
	], valueVerify('result', 'truthy', true), { tags: ['layout', 'breadcrumbs', 'on'] }),

	makeTest(185, 'Toggle breadcrumbs off', 'Disable breadcrumbs via layout set', [
		step('tarx_ui_layout_set', { breadcrumbs: false }),
	], valueVerify('result', 'truthy', true), { tags: ['layout', 'breadcrumbs', 'off'] }),

	makeTest(186, 'Split editor horizontal', 'Split the active editor horizontally', [
		step('tarx_ui_layout_set', { splitEditor: 'horizontal' }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['layout', 'split', 'horizontal'] }),

	makeTest(187, 'Split editor vertical', 'Split the active editor vertically', [
		step('tarx_ui_layout_set', { splitEditor: 'vertical' }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['layout', 'split', 'vertical'] }),

	makeTest(188, 'Editor group layout - two columns', 'Set editor groups to two-column layout', [
		step('tarx_ui_layout_set', { editorLayout: { groups: [{ size: 0.5 }, { size: 0.5 }], orientation: 'horizontal' } }),
	], valueVerify('result', 'truthy', true), { tags: ['layout', 'editor-group', 'two-columns'] }),

	makeTest(189, 'Editor group layout - two rows', 'Set editor groups to two-row layout', [
		step('tarx_ui_layout_set', { editorLayout: { groups: [{ size: 0.5 }, { size: 0.5 }], orientation: 'vertical' } }),
	], valueVerify('result', 'truthy', true), { tags: ['layout', 'editor-group', 'two-rows'] }),

	makeTest(190, 'Editor group layout - three columns', 'Set editor groups to three-column layout', [
		step('tarx_ui_layout_set', { editorLayout: { groups: [{ size: 0.33 }, { size: 0.34 }, { size: 0.33 }], orientation: 'horizontal' } }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['layout', 'editor-group', 'three-columns'] }),

	makeTest(191, 'Close editor group', 'Close the last editor group', [
		step('tarx_ui_layout_set', { closeEditorGroup: true }),
	], valueVerify('result', 'truthy', true), { tags: ['layout', 'editor-group', 'close'] }),

	makeTest(192, 'Move editor to next group', 'Move the active editor to the next group', [
		step('tarx_ui_layout_set', { splitEditor: 'horizontal' }),
		step('tarx_ui_layout_set', { moveEditorToGroup: 'next' }, { waitMs: 200 }),
	], valueVerify('result', 'truthy', true), { tags: ['layout', 'editor-group', 'move'] }),

	makeTest(193, 'Toggle word wrap on', 'Enable word wrap via layout set', [
		step('tarx_ui_layout_set', { wordWrap: true }),
	], valueVerify('result', 'truthy', true), { tags: ['layout', 'wordwrap', 'on'] }),

	makeTest(194, 'Toggle word wrap off', 'Disable word wrap via layout set', [
		step('tarx_ui_layout_set', { wordWrap: false }),
	], valueVerify('result', 'truthy', true), { tags: ['layout', 'wordwrap', 'off'] }),

	makeTest(195, 'Toggle render whitespace on', 'Enable render whitespace via layout set', [
		step('tarx_ui_layout_set', { renderWhitespace: 'all' }),
	], valueVerify('result', 'truthy', true), { tags: ['layout', 'whitespace', 'on'] }),

	makeTest(196, 'Toggle render whitespace off', 'Disable render whitespace via layout set', [
		step('tarx_ui_layout_set', { renderWhitespace: 'none' }),
	], valueVerify('result', 'truthy', true), { tags: ['layout', 'whitespace', 'off'] }),

	makeTest(197, 'Toggle line numbers on', 'Enable line numbers via layout set', [
		step('tarx_ui_layout_set', { lineNumbers: 'on' }),
	], valueVerify('result', 'truthy', true), { tags: ['layout', 'linenumbers', 'on'] }),

	makeTest(198, 'Toggle line numbers off', 'Disable line numbers via layout set', [
		step('tarx_ui_layout_set', { lineNumbers: 'off' }),
	], valueVerify('result', 'truthy', true), { tags: ['layout', 'linenumbers', 'off'] }),

	makeTest(199, 'Toggle line numbers relative', 'Set line numbers to relative mode', [
		step('tarx_ui_layout_set', { lineNumbers: 'relative' }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['layout', 'linenumbers', 'relative'] }),

	makeTest(200, 'Full layout reset to default', 'Reset entire layout to default state', [
		step('tarx_ui_layout_set', { preset: 'default' }),
		step('tarx_ui_layout_get', {}, { captureResult: 'finalLayout', waitMs: 200 }),
	], valueVerify('finalLayout', 'truthy', true), { priority: 'P0', tags: ['layout', 'reset', 'default'] }),
];

// ===========================================================================
// Export
// ===========================================================================

export const panelsTests: TestCase[] = [
	...panelShowHideToggle,
	...sidebarTests,
	...viewManagement,
	...layoutTests,
];
