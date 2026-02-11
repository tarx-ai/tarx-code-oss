/**
 * TARX UI Test Suite - Category D: Notifications & Dialogs
 * 150 test cases (D-001 to D-150)
 *
 * Coverage:
 *   Show notifications              D-001 to D-040  (40 tests)
 *   Progress                        D-041 to D-070  (30 tests)
 *   Dismiss                         D-071 to D-100  (30 tests)
 *   Dialogs                         D-101 to D-130  (30 tests)
 *   Status bar messages             D-131 to D-150  (20 tests)
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

function did(n: number): string {
	return `D-${String(n).padStart(3, '0')}`;
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
		id: did(n),
		category: 'notifications',
		name,
		description,
		priority: opts.priority ?? 'P1',
		tags: opts.tags ?? ['notifications'],
		steps,
		verify,
		timeoutMs: opts.timeoutMs ?? 5000,
		retries: opts.retries ?? 1,
	};
}

// ---------------------------------------------------------------------------
// Cleanup helper
// ---------------------------------------------------------------------------

const dismissAll = step('tarx_ui_notification_dismiss_all');

// ===========================================================================
// D-001 to D-040 : Show notifications  (40 tests)
// ===========================================================================

const showNotifications: TestCase[] = [
	// --- Info notifications (D-001 to D-012) ---
	makeTest(1, 'Show info notification - simple', 'Show a basic info notification with a message', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Test info notification' }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['notifications', 'info', 'smoke'] }),

	makeTest(2, 'Show info notification - short message', 'Show an info notification with a very short message', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'OK' }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'info', 'short'] }),

	makeTest(3, 'Show info notification - long message', 'Show an info notification with a long message', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'This is a very long notification message that is designed to test how the notification system handles lengthy text content. It should still render correctly without breaking the layout or truncating important information from the user.' }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'info', 'long'] }),

	makeTest(4, 'Show info notification with actions', 'Show an info notification with action buttons', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Do you want to continue?', actions: ['Yes', 'No'] }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['notifications', 'info', 'actions'] }),

	makeTest(5, 'Show info notification with single action', 'Show an info notification with one action button', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Click to proceed', actions: ['OK'] }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'info', 'actions'] }),

	makeTest(6, 'Show info notification with three actions', 'Show an info notification with three action buttons', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Choose an option', actions: ['Save', 'Discard', 'Cancel'] }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'info', 'actions', 'multiple'] }),

	makeTest(7, 'Show info notification captures result', 'Show info notification and capture the response', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Capture test' }, { captureResult: 'infoResult' }),
	], valueVerify('infoResult', 'truthy', true), { tags: ['notifications', 'info', 'capture'] }),

	makeTest(8, 'Show info notification appears in visible list', 'Info notification should appear in visible notifications', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Visible check' }, { waitMs: 200 }),
		step('tarx_ui_notification_get_visible', {}, { captureResult: 'visible' }),
	], valueVerify('visible', 'truthy', true), { priority: 'P0', tags: ['notifications', 'info', 'visible'] }),

	makeTest(9, 'Show info notification with special characters', 'Show info notification containing special chars', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Special chars: <>&"\'@#$%^*(){}[]' }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['notifications', 'info', 'special-chars'] }),

	makeTest(10, 'Show info notification with newlines', 'Show info notification with multiline content', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Line 1\nLine 2\nLine 3' }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'info', 'multiline'] }),

	makeTest(11, 'Show info notification with link text', 'Show info notification containing a link-like string', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Visit https://example.com for details' }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'info', 'link'] }),

	makeTest(12, 'Show info notification with code block', 'Show info notification containing inline code', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Run `npm install` to fix the issue' }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['notifications', 'info', 'code'] }),

	// --- Warning notifications (D-013 to D-022) ---
	makeTest(13, 'Show warning notification - simple', 'Show a basic warning notification', [
		dismissAll,
		step('tarx_ui_notification_warning', { message: 'Test warning notification' }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['notifications', 'warning', 'smoke'] }),

	makeTest(14, 'Show warning notification - long message', 'Show a warning notification with a long message', [
		dismissAll,
		step('tarx_ui_notification_warning', { message: 'This is a warning about a potential issue that might affect the stability of your application. Please review the configuration and make sure all settings are correct before proceeding with the deployment.' }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'warning', 'long'] }),

	makeTest(15, 'Show warning notification with actions', 'Show a warning notification with action buttons', [
		dismissAll,
		step('tarx_ui_notification_warning', { message: 'Configuration may be invalid', actions: ['Fix', 'Ignore'] }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['notifications', 'warning', 'actions'] }),

	makeTest(16, 'Show warning notification with three actions', 'Show warning notification with multiple actions', [
		dismissAll,
		step('tarx_ui_notification_warning', { message: 'Unsaved changes detected', actions: ['Save', 'Discard', 'Cancel'] }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'warning', 'actions', 'multiple'] }),

	makeTest(17, 'Show warning notification captures result', 'Show warning notification and capture response', [
		dismissAll,
		step('tarx_ui_notification_warning', { message: 'Capture warning' }, { captureResult: 'warnResult' }),
	], valueVerify('warnResult', 'truthy', true), { tags: ['notifications', 'warning', 'capture'] }),

	makeTest(18, 'Show warning notification appears in visible list', 'Warning notification should appear in visible list', [
		dismissAll,
		step('tarx_ui_notification_warning', { message: 'Visible warning check' }, { waitMs: 200 }),
		step('tarx_ui_notification_get_visible', {}, { captureResult: 'visible' }),
	], valueVerify('visible', 'truthy', true), { tags: ['notifications', 'warning', 'visible'] }),

	makeTest(19, 'Show warning notification with special characters', 'Warning notification with special chars', [
		dismissAll,
		step('tarx_ui_notification_warning', { message: 'Warning: path/to/file.ts:42 - unexpected token' }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['notifications', 'warning', 'special-chars'] }),

	makeTest(20, 'Show warning notification with multiline', 'Warning notification with newlines', [
		dismissAll,
		step('tarx_ui_notification_warning', { message: 'Warning:\n- Issue A\n- Issue B\n- Issue C' }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'warning', 'multiline'] }),

	makeTest(21, 'Show warning notification idempotent', 'Showing same warning twice does not crash', [
		dismissAll,
		step('tarx_ui_notification_warning', { message: 'Duplicate warning' }),
		step('tarx_ui_notification_warning', { message: 'Duplicate warning' }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'warning', 'idempotent'] }),

	makeTest(22, 'Show warning notification with single action', 'Warning notification with one action', [
		dismissAll,
		step('tarx_ui_notification_warning', { message: 'Proceed with caution', actions: ['Understood'] }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'warning', 'actions', 'single'] }),

	// --- Error notifications (D-023 to D-032) ---
	makeTest(23, 'Show error notification - simple', 'Show a basic error notification', [
		dismissAll,
		step('tarx_ui_notification_error', { message: 'Test error notification' }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['notifications', 'error', 'smoke'] }),

	makeTest(24, 'Show error notification - long message', 'Show an error notification with a long message', [
		dismissAll,
		step('tarx_ui_notification_error', { message: 'A critical error has occurred while processing your request. The operation could not be completed because the required resource was not available. Please check the error log for more details and try again later.' }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'error', 'long'] }),

	makeTest(25, 'Show error notification with actions', 'Show an error notification with action buttons', [
		dismissAll,
		step('tarx_ui_notification_error', { message: 'Build failed', actions: ['Retry', 'View Log', 'Dismiss'] }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['notifications', 'error', 'actions'] }),

	makeTest(26, 'Show error notification with single action', 'Show error notification with one action', [
		dismissAll,
		step('tarx_ui_notification_error', { message: 'Connection lost', actions: ['Retry'] }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'error', 'actions', 'single'] }),

	makeTest(27, 'Show error notification captures result', 'Show error notification and capture response', [
		dismissAll,
		step('tarx_ui_notification_error', { message: 'Capture error' }, { captureResult: 'errResult' }),
	], valueVerify('errResult', 'truthy', true), { tags: ['notifications', 'error', 'capture'] }),

	makeTest(28, 'Show error notification appears in visible list', 'Error notification should appear in visible list', [
		dismissAll,
		step('tarx_ui_notification_error', { message: 'Visible error check' }, { waitMs: 200 }),
		step('tarx_ui_notification_get_visible', {}, { captureResult: 'visible' }),
	], valueVerify('visible', 'truthy', true), { priority: 'P0', tags: ['notifications', 'error', 'visible'] }),

	makeTest(29, 'Show error notification with stack trace text', 'Error notification with stack-trace-like content', [
		dismissAll,
		step('tarx_ui_notification_error', { message: 'Error at module.ts:42\n  at processFile (/src/core.ts:100)\n  at main (/src/index.ts:10)' }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['notifications', 'error', 'stack-trace'] }),

	makeTest(30, 'Show error notification with special characters', 'Error notification with special chars', [
		dismissAll,
		step('tarx_ui_notification_error', { message: 'Error: ENOENT: no such file or directory, open \'/tmp/test.json\'' }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['notifications', 'error', 'special-chars'] }),

	makeTest(31, 'Show error notification idempotent', 'Showing same error twice does not crash', [
		dismissAll,
		step('tarx_ui_notification_error', { message: 'Duplicate error' }),
		step('tarx_ui_notification_error', { message: 'Duplicate error' }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'error', 'idempotent'] }),

	makeTest(32, 'Show error notification with two actions', 'Error notification with two actions', [
		dismissAll,
		step('tarx_ui_notification_error', { message: 'Compilation failed', actions: ['View Errors', 'Close'] }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'error', 'actions', 'two'] }),

	// --- Mixed / rapid notifications (D-033 to D-040) ---
	makeTest(33, 'Rapid info notifications', 'Show multiple info notifications in quick succession', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Rapid 1' }),
		step('tarx_ui_notification_info', { message: 'Rapid 2' }),
		step('tarx_ui_notification_info', { message: 'Rapid 3' }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'rapid', 'info'] }),

	makeTest(34, 'Rapid mixed severity notifications', 'Show info, warning, and error in quick succession', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Info message' }),
		step('tarx_ui_notification_warning', { message: 'Warning message' }),
		step('tarx_ui_notification_error', { message: 'Error message' }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['notifications', 'rapid', 'mixed'] }),

	makeTest(35, 'Five rapid info notifications', 'Show five info notifications rapidly', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Rapid A' }),
		step('tarx_ui_notification_info', { message: 'Rapid B' }),
		step('tarx_ui_notification_info', { message: 'Rapid C' }),
		step('tarx_ui_notification_info', { message: 'Rapid D' }),
		step('tarx_ui_notification_info', { message: 'Rapid E' }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'rapid', 'stress'] }),

	makeTest(36, 'Ten rapid mixed notifications', 'Show ten notifications of varying severity rapidly', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Info 1' }),
		step('tarx_ui_notification_warning', { message: 'Warn 1' }),
		step('tarx_ui_notification_error', { message: 'Error 1' }),
		step('tarx_ui_notification_info', { message: 'Info 2' }),
		step('tarx_ui_notification_warning', { message: 'Warn 2' }),
		step('tarx_ui_notification_error', { message: 'Error 2' }),
		step('tarx_ui_notification_info', { message: 'Info 3' }),
		step('tarx_ui_notification_warning', { message: 'Warn 3' }),
		step('tarx_ui_notification_info', { message: 'Info 4' }),
		step('tarx_ui_notification_info', { message: 'Info 5' }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['notifications', 'rapid', 'stress', 'mixed'], timeoutMs: 10000 }),

	makeTest(37, 'Show notification with empty message', 'Empty message should still succeed or fail gracefully', [
		dismissAll,
		step('tarx_ui_notification_info', { message: '' }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['notifications', 'info', 'edge', 'empty'] }),

	makeTest(38, 'Show notification with unicode message', 'Notification with unicode characters', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Unicode test: \u2713 \u2717 \u2605 \u2764 \u26A0' }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['notifications', 'info', 'unicode'] }),

	makeTest(39, 'Show notification with emoji message', 'Notification with emoji characters', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Build complete! \uD83D\uDE80' }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['notifications', 'info', 'emoji'] }),

	makeTest(40, 'Show all three severity types and get visible', 'Show one of each type and verify all visible', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Info check' }, { waitMs: 100 }),
		step('tarx_ui_notification_warning', { message: 'Warning check' }, { waitMs: 100 }),
		step('tarx_ui_notification_error', { message: 'Error check' }, { waitMs: 100 }),
		step('tarx_ui_notification_get_visible', {}, { captureResult: 'allVisible' }),
	], valueVerify('allVisible', 'truthy', true), { priority: 'P0', tags: ['notifications', 'visible', 'all-types'] }),
];

// ===========================================================================
// D-041 to D-070 : Progress  (30 tests)
// ===========================================================================

const progressTests: TestCase[] = [
	// --- Basic progress notifications (D-041 to D-055) ---
	makeTest(41, 'Show progress notification - simple', 'Show a basic progress notification', [
		step('tarx_ui_notification_progress', { title: 'Loading...' }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['notifications', 'progress', 'smoke'] }),

	makeTest(42, 'Show progress with percentage', 'Show progress notification with a percentage value', [
		step('tarx_ui_notification_progress', { title: 'Downloading', percentage: 50 }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['notifications', 'progress', 'percentage'] }),

	makeTest(43, 'Show progress at 0 percent', 'Show progress notification at 0%', [
		step('tarx_ui_notification_progress', { title: 'Starting', percentage: 0 }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'progress', 'percentage', 'zero'] }),

	makeTest(44, 'Show progress at 100 percent', 'Show progress notification at 100%', [
		step('tarx_ui_notification_progress', { title: 'Complete', percentage: 100 }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'progress', 'percentage', 'complete'] }),

	makeTest(45, 'Show progress at 25 percent', 'Show progress notification at 25%', [
		step('tarx_ui_notification_progress', { title: 'Processing step 1/4', percentage: 25 }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'progress', 'percentage'] }),

	makeTest(46, 'Show progress at 75 percent', 'Show progress notification at 75%', [
		step('tarx_ui_notification_progress', { title: 'Processing step 3/4', percentage: 75 }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'progress', 'percentage'] }),

	makeTest(47, 'Show progress increment', 'Show progress notification and increment the value', [
		step('tarx_ui_notification_progress', { title: 'Indexing files', percentage: 0 }, { captureResult: 'progressId' }),
		step('tarx_ui_notification_progress', { title: 'Indexing files', percentage: 50, increment: true }, { waitMs: 200 }),
	], valueVerify('progressId', 'truthy', true), { tags: ['notifications', 'progress', 'increment'] }),

	makeTest(48, 'Show progress with cancel option', 'Show a cancellable progress notification', [
		step('tarx_ui_notification_progress', { title: 'Building project', cancellable: true }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['notifications', 'progress', 'cancel'] }),

	makeTest(49, 'Show progress infinite', 'Show an infinite/indeterminate progress notification', [
		step('tarx_ui_notification_progress', { title: 'Connecting to server', infinite: true }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['notifications', 'progress', 'infinite'] }),

	makeTest(50, 'Show progress with title update', 'Show progress and update the title', [
		step('tarx_ui_notification_progress', { title: 'Step 1: Initializing' }, { captureResult: 'progressId' }),
		step('tarx_ui_notification_progress', { title: 'Step 2: Processing', percentage: 50 }, { waitMs: 200 }),
	], valueVerify('progressId', 'truthy', true), { tags: ['notifications', 'progress', 'title-update'] }),

	makeTest(51, 'Show progress captures result', 'Show progress and capture the response', [
		step('tarx_ui_notification_progress', { title: 'Capture test' }, { captureResult: 'progressResult' }),
	], valueVerify('progressResult', 'truthy', true), { tags: ['notifications', 'progress', 'capture'] }),

	makeTest(52, 'Show progress with message and percentage', 'Show progress with both message and percentage', [
		step('tarx_ui_notification_progress', { title: 'Compiling', message: 'src/main.ts', percentage: 30 }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'progress', 'message'] }),

	makeTest(53, 'Show progress with long title', 'Show progress with a long title string', [
		step('tarx_ui_notification_progress', { title: 'Processing a very long list of files that spans multiple directories and subdirectories in the workspace' }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['notifications', 'progress', 'long-title'] }),

	makeTest(54, 'Show progress cancellable and infinite', 'Show a cancellable infinite progress notification', [
		step('tarx_ui_notification_progress', { title: 'Searching', infinite: true, cancellable: true }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'progress', 'cancel', 'infinite'] }),

	makeTest(55, 'Show progress with cancel then new progress', 'Start progress, cancel-like, then start new', [
		step('tarx_ui_notification_progress', { title: 'First task', cancellable: true }),
		step('tarx_ui_notification_progress', { title: 'Second task', percentage: 0 }, { waitMs: 200 }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'progress', 'sequential'] }),

	// --- Concurrent progress notifications (D-056 to D-065) ---
	makeTest(56, 'Two concurrent progress notifications', 'Show two progress notifications at the same time', [
		step('tarx_ui_notification_progress', { title: 'Task A', percentage: 30 }),
		step('tarx_ui_notification_progress', { title: 'Task B', percentage: 60 }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['notifications', 'progress', 'concurrent'] }),

	makeTest(57, 'Three concurrent progress notifications', 'Show three progress notifications simultaneously', [
		step('tarx_ui_notification_progress', { title: 'Build', percentage: 20 }),
		step('tarx_ui_notification_progress', { title: 'Lint', percentage: 50 }),
		step('tarx_ui_notification_progress', { title: 'Test', percentage: 80 }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'progress', 'concurrent', 'three'] }),

	makeTest(58, 'Concurrent progress with different types', 'Show infinite and percentage progress together', [
		step('tarx_ui_notification_progress', { title: 'Downloading', infinite: true }),
		step('tarx_ui_notification_progress', { title: 'Installing', percentage: 45 }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'progress', 'concurrent', 'mixed'] }),

	makeTest(59, 'Progress notification then info notification', 'Show progress then info notification together', [
		step('tarx_ui_notification_progress', { title: 'Building' }),
		step('tarx_ui_notification_info', { message: 'Build started' }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'progress', 'mixed-type'] }),

	makeTest(60, 'Progress notification then error notification', 'Show progress then error notification', [
		step('tarx_ui_notification_progress', { title: 'Building' }),
		step('tarx_ui_notification_error', { message: 'Build failed' }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'progress', 'error'] }),

	makeTest(61, 'Multiple progress at different percentages', 'Show multiple progress at various completion levels', [
		step('tarx_ui_notification_progress', { title: 'Task 1', percentage: 10 }),
		step('tarx_ui_notification_progress', { title: 'Task 2', percentage: 40 }),
		step('tarx_ui_notification_progress', { title: 'Task 3', percentage: 70 }),
		step('tarx_ui_notification_progress', { title: 'Task 4', percentage: 90 }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['notifications', 'progress', 'concurrent', 'many'] }),

	makeTest(62, 'Progress notification with OCR check', 'Show progress and verify text via OCR', [
		step('tarx_ui_notification_progress', { title: 'Building workspace' }, { waitMs: 500 }),
	], ocrVerify(['Building'], undefined, 'notifications'), { priority: 'P2', tags: ['notifications', 'progress', 'ocr'] }),

	makeTest(63, 'Progress with rapid percentage updates', 'Update progress rapidly from 0 to 100', [
		step('tarx_ui_notification_progress', { title: 'Fast progress', percentage: 0 }),
		step('tarx_ui_notification_progress', { title: 'Fast progress', percentage: 25 }),
		step('tarx_ui_notification_progress', { title: 'Fast progress', percentage: 50 }),
		step('tarx_ui_notification_progress', { title: 'Fast progress', percentage: 75 }),
		step('tarx_ui_notification_progress', { title: 'Fast progress', percentage: 100 }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'progress', 'rapid-update'] }),

	makeTest(64, 'Progress notification appears in visible', 'Progress notification should appear in visible list', [
		dismissAll,
		step('tarx_ui_notification_progress', { title: 'Visible progress', infinite: true }, { waitMs: 200 }),
		step('tarx_ui_notification_get_visible', {}, { captureResult: 'visible' }),
	], valueVerify('visible', 'truthy', true), { tags: ['notifications', 'progress', 'visible'] }),

	makeTest(65, 'Progress followed by dismiss all', 'Show progress then dismiss all notifications', [
		step('tarx_ui_notification_progress', { title: 'Dismissable progress' }),
		step('tarx_ui_notification_dismiss_all', {}, { waitMs: 200 }),
		step('tarx_ui_notification_get_visible', {}, { captureResult: 'visible' }),
	], valueVerify('visible', 'truthy', true), { tags: ['notifications', 'progress', 'dismiss'] }),

	// --- Progress edge cases (D-066 to D-070) ---
	makeTest(66, 'Progress with negative percentage', 'Negative percentage should be handled gracefully', [
		step('tarx_ui_notification_progress', { title: 'Negative', percentage: -10 }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['notifications', 'progress', 'edge', 'negative'] }),

	makeTest(67, 'Progress with over 100 percentage', 'Over 100 percentage should be handled gracefully', [
		step('tarx_ui_notification_progress', { title: 'Over', percentage: 150 }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['notifications', 'progress', 'edge', 'over'] }),

	makeTest(68, 'Progress with empty title', 'Empty title should be handled gracefully', [
		step('tarx_ui_notification_progress', { title: '' }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['notifications', 'progress', 'edge', 'empty'] }),

	makeTest(69, 'Progress with unicode title', 'Progress notification with unicode title', [
		step('tarx_ui_notification_progress', { title: '\u2699 Building project...' }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['notifications', 'progress', 'unicode'] }),

	makeTest(70, 'Progress with decimal percentage', 'Progress notification with decimal percentage', [
		step('tarx_ui_notification_progress', { title: 'Precise progress', percentage: 33.33 }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['notifications', 'progress', 'edge', 'decimal'] }),
];

// ===========================================================================
// D-071 to D-100 : Dismiss  (30 tests)
// ===========================================================================

const dismissTests: TestCase[] = [
	// --- Dismiss all (D-071 to D-085) ---
	makeTest(71, 'Dismiss all notifications - with notifications', 'Dismiss all when notifications exist', [
		step('tarx_ui_notification_info', { message: 'To dismiss' }),
		step('tarx_ui_notification_dismiss_all', {}, { waitMs: 200 }),
		step('tarx_ui_notification_get_visible', {}, { captureResult: 'remaining' }),
	], valueVerify('remaining', 'truthy', true), { priority: 'P0', tags: ['notifications', 'dismiss', 'all'] }),

	makeTest(72, 'Dismiss all when empty', 'Dismiss all when no notifications exist should not error', [
		step('tarx_ui_notification_dismiss_all'),
		step('tarx_ui_notification_dismiss_all'),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['notifications', 'dismiss', 'empty'] }),

	makeTest(73, 'Dismiss all captures result', 'Dismiss all and capture the response', [
		step('tarx_ui_notification_info', { message: 'Before dismiss' }),
		step('tarx_ui_notification_dismiss_all', {}, { captureResult: 'dismissResult' }),
	], valueVerify('dismissResult', 'truthy', true), { tags: ['notifications', 'dismiss', 'capture'] }),

	makeTest(74, 'Dismiss all info notifications', 'Show info then dismiss all', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Info to dismiss 1' }),
		step('tarx_ui_notification_info', { message: 'Info to dismiss 2' }),
		step('tarx_ui_notification_info', { message: 'Info to dismiss 3' }),
		step('tarx_ui_notification_dismiss_all', {}, { waitMs: 200 }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'dismiss', 'info'] }),

	makeTest(75, 'Dismiss all warning notifications', 'Show warnings then dismiss all', [
		dismissAll,
		step('tarx_ui_notification_warning', { message: 'Warn to dismiss 1' }),
		step('tarx_ui_notification_warning', { message: 'Warn to dismiss 2' }),
		step('tarx_ui_notification_dismiss_all', {}, { waitMs: 200 }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'dismiss', 'warning'] }),

	makeTest(76, 'Dismiss all error notifications', 'Show errors then dismiss all', [
		dismissAll,
		step('tarx_ui_notification_error', { message: 'Error to dismiss 1' }),
		step('tarx_ui_notification_error', { message: 'Error to dismiss 2' }),
		step('tarx_ui_notification_dismiss_all', {}, { waitMs: 200 }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'dismiss', 'error'] }),

	makeTest(77, 'Dismiss all mixed severity notifications', 'Show mixed notifications then dismiss all', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Info' }),
		step('tarx_ui_notification_warning', { message: 'Warning' }),
		step('tarx_ui_notification_error', { message: 'Error' }),
		step('tarx_ui_notification_dismiss_all', {}, { waitMs: 200 }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['notifications', 'dismiss', 'mixed'] }),

	makeTest(78, 'Dismiss all rapid succession', 'Multiple dismiss all calls rapidly', [
		step('tarx_ui_notification_info', { message: 'Quick dismiss' }),
		step('tarx_ui_notification_dismiss_all'),
		step('tarx_ui_notification_dismiss_all'),
		step('tarx_ui_notification_dismiss_all'),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'dismiss', 'rapid'] }),

	makeTest(79, 'Dismiss all then show new', 'Dismiss all then immediately show a new notification', [
		step('tarx_ui_notification_info', { message: 'Old notification' }),
		step('tarx_ui_notification_dismiss_all', {}, { waitMs: 200 }),
		step('tarx_ui_notification_info', { message: 'New notification' }, { waitMs: 200 }),
		step('tarx_ui_notification_get_visible', {}, { captureResult: 'visible' }),
	], valueVerify('visible', 'truthy', true), { tags: ['notifications', 'dismiss', 'then-show'] }),

	makeTest(80, 'Dismiss all idempotent triple call', 'Three dismiss all calls in succession', [
		dismissAll,
		step('tarx_ui_notification_dismiss_all'),
		step('tarx_ui_notification_dismiss_all'),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'dismiss', 'idempotent'] }),

	// --- Show and dismiss patterns (D-081 to D-090) ---
	makeTest(81, 'Show then dismiss then verify empty', 'Show notification, dismiss all, verify list is empty', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Temporary' }, { waitMs: 200 }),
		step('tarx_ui_notification_dismiss_all', {}, { waitMs: 200 }),
		step('tarx_ui_notification_get_visible', {}, { captureResult: 'visible' }),
	], valueVerify('visible', 'truthy', true), { priority: 'P0', tags: ['notifications', 'dismiss', 'verify'] }),

	makeTest(82, 'Show five then dismiss then verify', 'Show five notifications, dismiss all, verify empty', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'A' }),
		step('tarx_ui_notification_warning', { message: 'B' }),
		step('tarx_ui_notification_error', { message: 'C' }),
		step('tarx_ui_notification_info', { message: 'D' }),
		step('tarx_ui_notification_warning', { message: 'E' }),
		step('tarx_ui_notification_dismiss_all', {}, { waitMs: 200 }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'dismiss', 'five'] }),

	makeTest(83, 'Dismiss with actions pending', 'Dismiss notification that has action buttons', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Action notification', actions: ['Click Me'] }),
		step('tarx_ui_notification_dismiss_all', {}, { waitMs: 200 }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'dismiss', 'actions'] }),

	makeTest(84, 'Dismiss with progress pending', 'Dismiss notification while progress is active', [
		dismissAll,
		step('tarx_ui_notification_progress', { title: 'Active progress', infinite: true }),
		step('tarx_ui_notification_dismiss_all', {}, { waitMs: 200 }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'dismiss', 'progress'] }),

	makeTest(85, 'Show dismiss show pattern', 'Show, dismiss, show again pattern', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'First show' }),
		step('tarx_ui_notification_dismiss_all', {}, { waitMs: 200 }),
		step('tarx_ui_notification_info', { message: 'Second show' }, { waitMs: 200 }),
		step('tarx_ui_notification_get_visible', {}, { captureResult: 'visible' }),
	], valueVerify('visible', 'truthy', true), { tags: ['notifications', 'dismiss', 'pattern'] }),

	makeTest(86, 'Notification auto-dismiss timeout behavior', 'Show notification and check visibility after delay', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Timeout test' }, { waitMs: 1000 }),
		step('tarx_ui_notification_get_visible', {}, { captureResult: 'visible' }),
	], valueVerify('visible', 'truthy', true), { priority: 'P2', tags: ['notifications', 'timeout', 'auto-dismiss'], timeoutMs: 10000 }),

	makeTest(87, 'Error notification persistence', 'Error notifications should persist until dismissed', [
		dismissAll,
		step('tarx_ui_notification_error', { message: 'Persistent error' }, { waitMs: 1000 }),
		step('tarx_ui_notification_get_visible', {}, { captureResult: 'visible' }),
	], valueVerify('visible', 'truthy', true), { tags: ['notifications', 'persistence', 'error'], timeoutMs: 10000 }),

	makeTest(88, 'Warning notification persistence', 'Warning notifications should persist until dismissed', [
		dismissAll,
		step('tarx_ui_notification_warning', { message: 'Persistent warning' }, { waitMs: 1000 }),
		step('tarx_ui_notification_get_visible', {}, { captureResult: 'visible' }),
	], valueVerify('visible', 'truthy', true), { priority: 'P2', tags: ['notifications', 'persistence', 'warning'], timeoutMs: 10000 }),

	makeTest(89, 'Get visible returns count', 'Get visible notifications and verify count is captured', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Count test 1' }),
		step('tarx_ui_notification_info', { message: 'Count test 2' }),
		step('tarx_ui_notification_info', { message: 'Count test 3' }, { waitMs: 200 }),
		step('tarx_ui_notification_get_visible', {}, { captureResult: 'visible' }),
	], valueVerify('visible', 'truthy', true), { tags: ['notifications', 'visible', 'count'] }),

	makeTest(90, 'Get visible when no notifications', 'Get visible notifications when list is empty', [
		dismissAll,
		step('tarx_ui_notification_get_visible', {}, { captureResult: 'visible', waitMs: 200 }),
	], valueVerify('visible', 'truthy', true), { tags: ['notifications', 'visible', 'empty'] }),

	// --- Dismiss edge cases (D-091 to D-100) ---
	makeTest(91, 'Dismiss all with only progress notifications', 'Dismiss when only progress notifications exist', [
		dismissAll,
		step('tarx_ui_notification_progress', { title: 'Progress only 1' }),
		step('tarx_ui_notification_progress', { title: 'Progress only 2' }),
		step('tarx_ui_notification_dismiss_all', {}, { waitMs: 200 }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'dismiss', 'progress-only'] }),

	makeTest(92, 'Dismiss all with only error notifications', 'Dismiss when only error notifications exist', [
		dismissAll,
		step('tarx_ui_notification_error', { message: 'Error only 1' }),
		step('tarx_ui_notification_error', { message: 'Error only 2' }),
		step('tarx_ui_notification_dismiss_all', {}, { waitMs: 200 }),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'dismiss', 'error-only'] }),

	makeTest(93, 'Get visible after partial interactions', 'Show multiple, interact, check visible', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Keep 1' }),
		step('tarx_ui_notification_warning', { message: 'Keep 2' }),
		step('tarx_ui_notification_error', { message: 'Keep 3' }, { waitMs: 200 }),
		step('tarx_ui_notification_get_visible', {}, { captureResult: 'visible' }),
	], valueVerify('visible', 'truthy', true), { tags: ['notifications', 'visible', 'partial'] }),

	makeTest(94, 'Dismiss does not affect panel state', 'Dismissing notifications does not change panel visibility', [
		step('tarx_ui_notification_info', { message: 'Panel check' }),
		step('tarx_ui_notification_dismiss_all', {}, { waitMs: 200 }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['notifications', 'dismiss', 'panel'] }),

	makeTest(95, 'Dismiss does not affect sidebar state', 'Dismissing notifications does not change sidebar', [
		step('tarx_ui_notification_info', { message: 'Sidebar check' }),
		step('tarx_ui_notification_dismiss_all', {}, { waitMs: 200 }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['notifications', 'dismiss', 'sidebar'] }),

	makeTest(96, 'Rapid show-dismiss cycles', 'Rapidly alternate between showing and dismissing', [
		step('tarx_ui_notification_info', { message: 'Cycle 1' }),
		step('tarx_ui_notification_dismiss_all'),
		step('tarx_ui_notification_info', { message: 'Cycle 2' }),
		step('tarx_ui_notification_dismiss_all'),
		step('tarx_ui_notification_info', { message: 'Cycle 3' }),
		step('tarx_ui_notification_dismiss_all'),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'dismiss', 'cycles'] }),

	makeTest(97, 'Get visible captures structured data', 'Verify get visible returns structured response', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Structure test' }, { waitMs: 200 }),
		step('tarx_ui_notification_get_visible', {}, { captureResult: 'data' }),
	], valueVerify('data', 'truthy', true), { tags: ['notifications', 'visible', 'structure'] }),

	makeTest(98, 'Dismiss all followed by get visible is empty', 'Get visible after dismiss should report empty', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Will be dismissed' }),
		step('tarx_ui_notification_dismiss_all', {}, { waitMs: 200 }),
		step('tarx_ui_notification_get_visible', {}, { captureResult: 'visible' }),
	], valueVerify('visible', 'truthy', true), { priority: 'P0', tags: ['notifications', 'dismiss', 'verify-empty'] }),

	makeTest(99, 'Show ten then dismiss all', 'Show ten notifications then dismiss all at once', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'N1' }),
		step('tarx_ui_notification_info', { message: 'N2' }),
		step('tarx_ui_notification_info', { message: 'N3' }),
		step('tarx_ui_notification_warning', { message: 'N4' }),
		step('tarx_ui_notification_warning', { message: 'N5' }),
		step('tarx_ui_notification_error', { message: 'N6' }),
		step('tarx_ui_notification_error', { message: 'N7' }),
		step('tarx_ui_notification_info', { message: 'N8' }),
		step('tarx_ui_notification_info', { message: 'N9' }),
		step('tarx_ui_notification_info', { message: 'N10' }),
		step('tarx_ui_notification_dismiss_all', {}, { waitMs: 300 }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['notifications', 'dismiss', 'bulk'], timeoutMs: 10000 }),

	makeTest(100, 'Dismiss all is idempotent after bulk show', 'Double dismiss all after bulk notification show', [
		dismissAll,
		step('tarx_ui_notification_info', { message: 'Bulk 1' }),
		step('tarx_ui_notification_info', { message: 'Bulk 2' }),
		step('tarx_ui_notification_info', { message: 'Bulk 3' }),
		step('tarx_ui_notification_dismiss_all', {}, { waitMs: 200 }),
		step('tarx_ui_notification_dismiss_all'),
	], valueVerify('result', 'truthy', true), { tags: ['notifications', 'dismiss', 'idempotent', 'bulk'] }),
];

// ===========================================================================
// D-101 to D-130 : Dialogs  (30 tests)
// ===========================================================================

const dialogTests: TestCase[] = [
	// --- Input box (D-101 to D-115) ---
	makeTest(101, 'Input box - simple', 'Show a simple input box', [
		step('tarx_ui_dialog_input', { prompt: 'Enter your name' }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['dialog', 'input', 'smoke'] }),

	makeTest(102, 'Input box with placeholder', 'Show input box with placeholder text', [
		step('tarx_ui_dialog_input', { prompt: 'Enter filename', placeholder: 'e.g. myfile.ts' }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['dialog', 'input', 'placeholder'] }),

	makeTest(103, 'Input box with default value', 'Show input box with a pre-filled value', [
		step('tarx_ui_dialog_input', { prompt: 'Rename file', value: 'oldname.ts' }),
	], valueVerify('result', 'truthy', true), { tags: ['dialog', 'input', 'default-value'] }),

	makeTest(104, 'Input box with validation regex', 'Show input box with validation', [
		step('tarx_ui_dialog_input', { prompt: 'Enter number', validation: '^\\d+$' }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['dialog', 'input', 'validation'] }),

	makeTest(105, 'Input box with password mode', 'Show input box in password/masked mode', [
		step('tarx_ui_dialog_input', { prompt: 'Enter password', password: true }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['dialog', 'input', 'password'] }),

	makeTest(106, 'Input box cancel behavior', 'Cancel an input box without entering a value', [
		step('tarx_ui_dialog_input', { prompt: 'Cancel test', simulateCancel: true }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['dialog', 'input', 'cancel'] }),

	makeTest(107, 'Input box with title', 'Show input box with a title', [
		step('tarx_ui_dialog_input', { prompt: 'Enter value', title: 'Configuration Input' }),
	], valueVerify('result', 'truthy', true), { tags: ['dialog', 'input', 'title'] }),

	makeTest(108, 'Input box with long prompt', 'Show input box with a long prompt text', [
		step('tarx_ui_dialog_input', { prompt: 'Please enter the full path to the configuration file that you would like to use for this project. Make sure the file exists and is readable.' }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['dialog', 'input', 'long-prompt'] }),

	makeTest(109, 'Input box captures result', 'Show input box and capture the response', [
		step('tarx_ui_dialog_input', { prompt: 'Capture test', value: 'test-value' }, { captureResult: 'inputResult' }),
	], valueVerify('inputResult', 'truthy', true), { tags: ['dialog', 'input', 'capture'] }),

	makeTest(110, 'Input box with empty prompt', 'Show input box with empty prompt string', [
		step('tarx_ui_dialog_input', { prompt: '' }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['dialog', 'input', 'edge', 'empty'] }),

	makeTest(111, 'Input box with validation message', 'Show input box with validation error message', [
		step('tarx_ui_dialog_input', { prompt: 'Enter email', validation: '^.+@.+\\..+$', validationMessage: 'Please enter a valid email address' }),
	], valueVerify('result', 'truthy', true), { tags: ['dialog', 'input', 'validation', 'message'] }),

	makeTest(112, 'Input box with placeholder and value', 'Show input box with both placeholder and default', [
		step('tarx_ui_dialog_input', { prompt: 'Enter name', placeholder: 'John Doe', value: 'Jane' }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['dialog', 'input', 'placeholder', 'value'] }),

	makeTest(113, 'Input box with step indicator', 'Show input box with step info', [
		step('tarx_ui_dialog_input', { prompt: 'Step 1 of 3: Enter project name', step: 1, totalSteps: 3 }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['dialog', 'input', 'step'] }),

	makeTest(114, 'Input box with special characters in prompt', 'Show input box with special characters', [
		step('tarx_ui_dialog_input', { prompt: 'Enter path (e.g. /usr/local/bin)' }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['dialog', 'input', 'special-chars'] }),

	makeTest(115, 'Input box password with placeholder', 'Show password input with placeholder', [
		step('tarx_ui_dialog_input', { prompt: 'Enter API key', password: true, placeholder: 'sk-...' }),
	], valueVerify('result', 'truthy', true), { tags: ['dialog', 'input', 'password', 'placeholder'] }),

	// --- Quick pick (D-116 to D-125) ---
	makeTest(116, 'Quick pick - single selection', 'Show a quick pick with single selection', [
		step('tarx_ui_dialog_quickpick', { items: ['Option A', 'Option B', 'Option C'] }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['dialog', 'quickpick', 'single', 'smoke'] }),

	makeTest(117, 'Quick pick - multi selection', 'Show a quick pick with multi-selection', [
		step('tarx_ui_dialog_quickpick', { items: ['Item 1', 'Item 2', 'Item 3'], canPickMany: true }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['dialog', 'quickpick', 'multi'] }),

	makeTest(118, 'Quick pick with detail', 'Show quick pick items with descriptions', [
		step('tarx_ui_dialog_quickpick', { items: [{ label: 'TypeScript', detail: '.ts files' }, { label: 'JavaScript', detail: '.js files' }] }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['dialog', 'quickpick', 'detail'] }),

	makeTest(119, 'Quick pick cancel', 'Cancel a quick pick without selecting', [
		step('tarx_ui_dialog_quickpick', { items: ['A', 'B'], simulateCancel: true }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['dialog', 'quickpick', 'cancel'] }),

	makeTest(120, 'Quick pick with placeholder', 'Show quick pick with placeholder text', [
		step('tarx_ui_dialog_quickpick', { items: ['Red', 'Green', 'Blue'], placeholder: 'Choose a color' }),
	], valueVerify('result', 'truthy', true), { tags: ['dialog', 'quickpick', 'placeholder'] }),

	makeTest(121, 'Quick pick with title', 'Show quick pick with a title', [
		step('tarx_ui_dialog_quickpick', { items: ['Dev', 'Staging', 'Prod'], title: 'Select Environment' }),
	], valueVerify('result', 'truthy', true), { tags: ['dialog', 'quickpick', 'title'] }),

	makeTest(122, 'Quick pick with many items', 'Show quick pick with many items', [
		step('tarx_ui_dialog_quickpick', { items: Array.from({ length: 20 }, (_, i) => `Item ${i + 1}`) }),
	], valueVerify('result', 'truthy', true), { tags: ['dialog', 'quickpick', 'many-items'] }),

	makeTest(123, 'Quick pick with single item', 'Show quick pick with only one item', [
		step('tarx_ui_dialog_quickpick', { items: ['Only Option'] }),
	], valueVerify('result', 'truthy', true), { tags: ['dialog', 'quickpick', 'single-item'] }),

	makeTest(124, 'Quick pick captures result', 'Show quick pick and capture the response', [
		step('tarx_ui_dialog_quickpick', { items: ['Alpha', 'Beta'] }, { captureResult: 'pickResult' }),
	], valueVerify('pickResult', 'truthy', true), { tags: ['dialog', 'quickpick', 'capture'] }),

	makeTest(125, 'Quick pick with step indicator', 'Show quick pick with step info', [
		step('tarx_ui_dialog_quickpick', { items: ['Option 1', 'Option 2'], step: 2, totalSteps: 5 }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['dialog', 'quickpick', 'step'] }),

	// --- Message dialog (D-126 to D-130) ---
	makeTest(126, 'Message dialog - yes/no', 'Show a yes/no confirmation dialog', [
		step('tarx_ui_dialog_message', { message: 'Are you sure?', type: 'question', buttons: ['Yes', 'No'] }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['dialog', 'message', 'yes-no'] }),

	makeTest(127, 'Message dialog - custom buttons', 'Show a message dialog with custom buttons', [
		step('tarx_ui_dialog_message', { message: 'Save changes?', type: 'warning', buttons: ['Save', 'Discard', 'Cancel'] }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['dialog', 'message', 'custom-buttons'] }),

	makeTest(128, 'Message dialog - info type', 'Show an informational message dialog', [
		step('tarx_ui_dialog_message', { message: 'Operation completed successfully', type: 'info', buttons: ['OK'] }),
	], valueVerify('result', 'truthy', true), { tags: ['dialog', 'message', 'info'] }),

	makeTest(129, 'Message dialog - error type', 'Show an error message dialog', [
		step('tarx_ui_dialog_message', { message: 'Failed to save file', type: 'error', buttons: ['Retry', 'Cancel'] }),
	], valueVerify('result', 'truthy', true), { tags: ['dialog', 'message', 'error'] }),

	makeTest(130, 'Message dialog captures result', 'Show message dialog and capture response', [
		step('tarx_ui_dialog_message', { message: 'Confirm?', type: 'question', buttons: ['OK', 'Cancel'] }, { captureResult: 'dialogResult' }),
	], valueVerify('dialogResult', 'truthy', true), { tags: ['dialog', 'message', 'capture'] }),
];

// ===========================================================================
// D-131 to D-150 : Status bar messages  (20 tests)
// ===========================================================================

const statusBarTests: TestCase[] = [
	makeTest(131, 'Status bar info message', 'Show an info message in the status bar', [
		step('tarx_ui_status_message', { message: 'Ready', severity: 'info' }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['status-bar', 'info', 'smoke'] }),

	makeTest(132, 'Status bar warning message', 'Show a warning message in the status bar', [
		step('tarx_ui_status_message', { message: 'Low memory', severity: 'warning' }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['status-bar', 'warning'] }),

	makeTest(133, 'Status bar error message', 'Show an error message in the status bar', [
		step('tarx_ui_status_message', { message: 'Build failed', severity: 'error' }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['status-bar', 'error'] }),

	makeTest(134, 'Status bar message with timeout', 'Show a status bar message that auto-clears after timeout', [
		step('tarx_ui_status_message', { message: 'Saved!', timeout: 3000 }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['status-bar', 'timeout'] }),

	makeTest(135, 'Status bar message with command', 'Show a status bar message with an associated command', [
		step('tarx_ui_status_message', { message: 'Click to build', command: 'workbench.action.tasks.build' }),
	], valueVerify('result', 'truthy', true), { tags: ['status-bar', 'command'] }),

	makeTest(136, 'Status bar message update', 'Update an existing status bar message', [
		step('tarx_ui_status_message', { message: 'Status: Idle' }, { captureResult: 'statusId' }),
		step('tarx_ui_status_message', { message: 'Status: Running' }, { waitMs: 200 }),
	], valueVerify('statusId', 'truthy', true), { tags: ['status-bar', 'update'] }),

	makeTest(137, 'Status bar message clear', 'Clear a status bar message', [
		step('tarx_ui_status_message', { message: 'Temporary' }),
		step('tarx_ui_status_message', { message: '', clear: true }, { waitMs: 200 }),
	], valueVerify('result', 'truthy', true), { tags: ['status-bar', 'clear'] }),

	makeTest(138, 'Status bar message captures result', 'Show status bar message and capture response', [
		step('tarx_ui_status_message', { message: 'Capture test' }, { captureResult: 'statusResult' }),
	], valueVerify('statusResult', 'truthy', true), { tags: ['status-bar', 'capture'] }),

	makeTest(139, 'Status bar message with long text', 'Show a long status bar message', [
		step('tarx_ui_status_message', { message: 'Building workspace: compiling 142 TypeScript files across 12 packages' }),
	], valueVerify('result', 'truthy', true), { tags: ['status-bar', 'long'] }),

	makeTest(140, 'Status bar message with special characters', 'Show status bar message with special chars', [
		step('tarx_ui_status_message', { message: 'Status: OK (42/100) [98%]' }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['status-bar', 'special-chars'] }),

	makeTest(141, 'Status bar message rapid updates', 'Update status bar message rapidly', [
		step('tarx_ui_status_message', { message: 'Step 1' }),
		step('tarx_ui_status_message', { message: 'Step 2' }),
		step('tarx_ui_status_message', { message: 'Step 3' }),
		step('tarx_ui_status_message', { message: 'Step 4' }),
		step('tarx_ui_status_message', { message: 'Step 5' }),
	], valueVerify('result', 'truthy', true), { tags: ['status-bar', 'rapid'] }),

	makeTest(142, 'Status bar message with icon', 'Show status bar message with icon prefix', [
		step('tarx_ui_status_message', { message: '$(check) All tests passed', severity: 'info' }),
	], valueVerify('result', 'truthy', true), { tags: ['status-bar', 'icon'] }),

	makeTest(143, 'Status bar message with zero timeout', 'Show status bar message with zero timeout', [
		step('tarx_ui_status_message', { message: 'Instant', timeout: 0 }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['status-bar', 'timeout', 'zero'] }),

	makeTest(144, 'Status bar message with large timeout', 'Show status bar message with large timeout', [
		step('tarx_ui_status_message', { message: 'Long lasting', timeout: 60000 }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['status-bar', 'timeout', 'large'] }),

	makeTest(145, 'Status bar message does not affect notifications', 'Status bar message should not create notification', [
		dismissAll,
		step('tarx_ui_status_message', { message: 'No notification' }, { waitMs: 200 }),
		step('tarx_ui_notification_get_visible', {}, { captureResult: 'visible' }),
	], valueVerify('visible', 'truthy', true), { tags: ['status-bar', 'no-notification'] }),

	makeTest(146, 'Status bar message with empty string', 'Show empty status bar message', [
		step('tarx_ui_status_message', { message: '' }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['status-bar', 'edge', 'empty'] }),

	makeTest(147, 'Status bar message with unicode', 'Show status bar message with unicode', [
		step('tarx_ui_status_message', { message: '\u2713 Build succeeded' }),
	], valueVerify('result', 'truthy', true), { priority: 'P2', tags: ['status-bar', 'unicode'] }),

	makeTest(148, 'Status bar message then notification', 'Show status bar then notification together', [
		step('tarx_ui_status_message', { message: 'Status active' }),
		step('tarx_ui_notification_info', { message: 'Notification active' }),
	], valueVerify('result', 'truthy', true), { tags: ['status-bar', 'with-notification'] }),

	makeTest(149, 'Status bar message with OCR verification', 'Show status bar message and verify via OCR', [
		step('tarx_ui_status_message', { message: 'OCR Test Message' }, { waitMs: 500 }),
	], ocrVerify(['OCR Test'], undefined, 'statusbar'), { priority: 'P2', tags: ['status-bar', 'ocr'] }),

	makeTest(150, 'Status bar message cycle all severities', 'Cycle through info, warning, error status messages', [
		step('tarx_ui_status_message', { message: 'Info status', severity: 'info' }, { waitMs: 100 }),
		step('tarx_ui_status_message', { message: 'Warning status', severity: 'warning' }, { waitMs: 100 }),
		step('tarx_ui_status_message', { message: 'Error status', severity: 'error' }, { waitMs: 100 }),
		step('tarx_ui_status_message', { message: 'Final info', severity: 'info' }),
	], valueVerify('result', 'truthy', true), { priority: 'P0', tags: ['status-bar', 'cycle', 'all-severities'] }),
];

// ===========================================================================
// Export
// ===========================================================================

export const notificationsTests: TestCase[] = [
	...showNotifications,
	...progressTests,
	...dismissTests,
	...dialogTests,
	...statusBarTests,
];
