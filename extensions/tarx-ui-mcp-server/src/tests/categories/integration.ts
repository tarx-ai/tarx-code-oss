/**
 * TARX UI Test Suite - Category M: Integration (M-001 to M-200)
 * 200 test cases for cross-feature integration workflows
 *
 * Coverage:
 *   Open + Edit + Save + Verify       M-001 to M-030   (30 tests)
 *   Project + Conversation + Chat      M-031 to M-060   (30 tests)
 *   Theme + Screenshot + OCR           M-061 to M-080   (20 tests)
 *   Terminal + Editor + Debug          M-081 to M-100   (20 tests)
 *   Sidebar + Project Management       M-101 to M-130   (30 tests)
 *   Window + Layout                    M-131 to M-150   (20 tests)
 *   Chaos / Stress                     M-151 to M-170   (20 tests)
 *   Error Recovery                     M-171 to M-185   (15 tests)
 *   Performance                        M-186 to M-200   (15 tests)
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
		category: 'integration',
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

// Tool constants
const OPEN_FILE = 'tarx_ui_editor_open_file';
const SET_CONTENT = 'tarx_ui_editor_set_content';
const GET_CONTENT = 'tarx_ui_editor_get_content';
const SAVE = 'tarx_ui_editor_save';
const CLOSE = 'tarx_ui_editor_close';
const CLOSE_ALL = 'tarx_ui_editor_close_all';
const TERM_CREATE = 'tarx_ui_terminal_create';
const TERM_SEND = 'tarx_ui_terminal_send_command';
const TERM_OUTPUT = 'tarx_ui_terminal_get_output';
const TERM_LIST = 'tarx_ui_terminal_list';
const TERM_CLOSE = 'tarx_ui_terminal_close';
const DBG_OPEN = 'tarx_ui_debug_open';
const DBG_START = 'tarx_ui_debug_start';
const DBG_STOP = 'tarx_ui_debug_stop';
const DBG_STATE = 'tarx_ui_debug_get_state';
const THEME_SET = 'tarx_ui_theme_set';
const THEME_GET = 'tarx_ui_theme_get';
const THEME_LIST = 'tarx_ui_theme_list';
const FONT_SIZE = 'tarx_ui_theme_font_size';
const FONT_FAMILY = 'tarx_ui_theme_font_family';
const SETTINGS_GET = 'tarx_ui_settings_get';
const SETTINGS_SET = 'tarx_ui_settings_set';
const SETTINGS_RESET = 'tarx_ui_settings_reset';
const SETTINGS_UI = 'tarx_ui_settings_open_ui';
const SETTINGS_JSON = 'tarx_ui_settings_open_json';
const SCREENSHOT = 'tarx_ui_screenshot_full';
const REGION_SHOT = 'tarx_ui_screenshot_region';
const OCR = 'tarx_ui_screenshot_ocr';
const FIND_TEXT = 'tarx_ui_screenshot_find_text';
const SHOT_LIST = 'tarx_ui_screenshot_list';
const EXPLORE_OPEN = 'tarx_ui_explorer_open';
const EXPLORE_TREE = 'tarx_ui_explorer_tree';
const EXPLORE_REVEAL = 'tarx_ui_explorer_reveal';
const EXPLORE_CREATE_FILE = 'tarx_ui_explorer_create_file';
const EXPLORE_CREATE_DIR = 'tarx_ui_explorer_create_folder';
const EXPLORE_DELETE = 'tarx_ui_explorer_delete';
const EXPLORE_RENAME = 'tarx_ui_explorer_rename';
const SCM_OPEN = 'tarx_ui_scm_open';
const SCM_CHANGES = 'tarx_ui_scm_get_changes';
const SCM_STAGE = 'tarx_ui_scm_stage_file';
const SCM_COMMIT = 'tarx_ui_scm_commit';
const SCM_BRANCH = 'tarx_ui_scm_get_branch';

// ===========================================================================
// M-001 to M-030 : Open + Edit + Save + Verify (30 tests)
// ===========================================================================

const openEditSave: TestCase[] = [
	tc('M-001', 'Open file, edit content, save', 'P0', ['integration', 'editor', 'file-io'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m001.ts' }),
		step(SET_CONTENT, { content: 'const x = 1;' }, { wait: 300 }),
		step(SAVE),
		step(GET_CONTENT, {}, { capture: 'saved' }),
	], valueV('saved', 'contains', 'const x = 1')),

	tc('M-002', 'Open, edit, close without save, reopen', 'P0', ['integration', 'editor', 'discard'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m002.ts' }),
		step(SET_CONTENT, { content: 'original' }),
		step(SAVE),
		step(SET_CONTENT, { content: 'modified' }),
		step(CLOSE, { save: false }),
		step(OPEN_FILE, { filePath: '/tmp/int-m002.ts' }),
		step(GET_CONTENT, {}, { capture: 'result' }),
	], valueV('result', 'contains', 'original')),

	tc('M-003', 'Create file via explorer then open in editor', 'P0', ['integration', 'explorer', 'editor'], [
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m003.txt', content: 'hello' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m003.txt' }),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'contains', 'hello')),

	tc('M-004', 'Edit multiple files sequentially', 'P1', ['integration', 'editor', 'multi-file'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m004-a.ts' }),
		step(SET_CONTENT, { content: 'file-a' }),
		step(SAVE),
		step(OPEN_FILE, { filePath: '/tmp/int-m004-b.ts' }),
		step(SET_CONTENT, { content: 'file-b' }),
		step(SAVE),
		step(OPEN_FILE, { filePath: '/tmp/int-m004-a.ts' }),
		step(GET_CONTENT, {}, { capture: 'a' }),
	], valueV('a', 'contains', 'file-a')),

	tc('M-005', 'Open file, set content, screenshot, verify via OCR', 'P0', ['integration', 'editor', 'ocr'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m005.ts' }),
		step(SET_CONTENT, { content: 'function helloWorld() {}' }, { wait: 500 }),
		step(SCREENSHOT, {}, { capture: 'shot' }),
		step(OCR, {}, { capture: 'text' }),
	], valueV('text', 'contains', 'helloWorld')),

	tc('M-006', 'Create folder then file inside it', 'P1', ['integration', 'explorer', 'hierarchy'], [
		step(EXPLORE_CREATE_DIR, { path: '/tmp/int-m006-dir' }),
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m006-dir/nested.txt', content: 'nested' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m006-dir/nested.txt' }),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'contains', 'nested')),

	tc('M-007', 'Edit file then check SCM changes', 'P0', ['integration', 'editor', 'scm'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m007.ts' }),
		step(SET_CONTENT, { content: 'changed content' }),
		step(SAVE),
		step(SCM_OPEN),
		step(SCM_CHANGES, {}, { capture: 'changes' }),
	], valueV('changes', 'truthy', true)),

	tc('M-008', 'Open file, rename via explorer, verify editor updates', 'P1', ['integration', 'explorer', 'rename'], [
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m008-old.txt', content: 'rename-me' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m008-old.txt' }),
		step(EXPLORE_RENAME, { oldPath: '/tmp/int-m008-old.txt', newPath: '/tmp/int-m008-new.txt' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m008-new.txt' }),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'contains', 'rename-me')),

	tc('M-009', 'Close all editors then verify no open tabs', 'P1', ['integration', 'editor', 'close'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m009-a.ts' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m009-b.ts' }),
		step(CLOSE_ALL),
		step(GET_CONTENT, {}, { capture: 'c', expectSuccess: false }),
	], valueV('c', 'falsy', true)),

	tc('M-010', 'Save empty file content', 'P2', ['integration', 'editor', 'empty'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m010.ts' }),
		step(SET_CONTENT, { content: '' }),
		step(SAVE),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'equals', '')),

	tc('M-011', 'Open large content file and save', 'P1', ['integration', 'editor', 'large'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m011.ts' }),
		step(SET_CONTENT, { content: 'x'.repeat(50000) }),
		step(SAVE),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'truthy', true)),

	tc('M-012', 'Open file, edit, save, delete, verify gone', 'P1', ['integration', 'editor', 'delete'], [
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m012.txt', content: 'temp' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m012.txt' }),
		step(SAVE),
		step(CLOSE),
		step(EXPLORE_DELETE, { path: '/tmp/int-m012.txt' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m012.txt' }, { expectSuccess: false }),
	], valueV('result', 'falsy', true)),

	tc('M-013', 'Edit TypeScript file with unicode content', 'P2', ['integration', 'editor', 'unicode'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m013.ts' }),
		step(SET_CONTENT, { content: 'const greeting = "Hola mundo";' }),
		step(SAVE),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'contains', 'Hola mundo')),

	tc('M-014', 'Create file then reveal in explorer', 'P1', ['integration', 'explorer', 'reveal'], [
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m014.txt', content: 'reveal-me' }),
		step(EXPLORE_REVEAL, { path: '/tmp/int-m014.txt' }),
		step(EXPLORE_TREE, {}, { capture: 'tree' }),
	], valueV('tree', 'truthy', true)),

	tc('M-015', 'Open JSON file and edit', 'P1', ['integration', 'editor', 'json'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m015.json' }),
		step(SET_CONTENT, { content: '{"key": "value"}' }),
		step(SAVE),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'contains', '"key"')),

	tc('M-016', 'Create nested directory structure', 'P1', ['integration', 'explorer', 'nested'], [
		step(EXPLORE_CREATE_DIR, { path: '/tmp/int-m016/a' }),
		step(EXPLORE_CREATE_DIR, { path: '/tmp/int-m016/a/b' }),
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m016/a/b/deep.txt', content: 'deep' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m016/a/b/deep.txt' }),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'contains', 'deep')),

	tc('M-017', 'Open multiple files and close all', 'P2', ['integration', 'editor', 'batch-close'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m017-a.ts' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m017-b.ts' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m017-c.ts' }),
		step(CLOSE_ALL),
	], stateV(GET_CONTENT, { hasOpenEditor: false })),

	tc('M-018', 'Edit file then get SCM branch info', 'P1', ['integration', 'editor', 'scm'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m018.ts' }),
		step(SET_CONTENT, { content: 'branch test' }),
		step(SAVE),
		step(SCM_BRANCH, {}, { capture: 'branch' }),
	], valueV('branch', 'truthy', true)),

	tc('M-019', 'Rapid open-edit-save cycle', 'P2', ['integration', 'editor', 'rapid'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m019.ts' }),
		step(SET_CONTENT, { content: 'v1' }),
		step(SAVE),
		step(SET_CONTENT, { content: 'v2' }),
		step(SAVE),
		step(SET_CONTENT, { content: 'v3' }),
		step(SAVE),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'contains', 'v3')),

	tc('M-020', 'Create file with special characters in name', 'P2', ['integration', 'explorer', 'special-chars'], [
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m020-test_file.txt', content: 'special' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m020-test_file.txt' }),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'contains', 'special')),

	tc('M-021', 'Open CSS file, edit, save, verify', 'P1', ['integration', 'editor', 'css'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m021.css' }),
		step(SET_CONTENT, { content: '.root { color: red; }' }),
		step(SAVE),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'contains', 'color: red')),

	tc('M-022', 'Explorer tree then open first file', 'P1', ['integration', 'explorer', 'tree-open'], [
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m022/readme.md', content: '# Test' }),
		step(EXPLORE_OPEN),
		step(EXPLORE_TREE, {}, { capture: 'tree' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m022/readme.md' }),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'contains', '# Test')),

	tc('M-023', 'Edit file, stage via SCM', 'P0', ['integration', 'editor', 'scm', 'stage'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m023.ts' }),
		step(SET_CONTENT, { content: 'staged content' }),
		step(SAVE),
		step(SCM_STAGE, { filePath: '/tmp/int-m023.ts' }),
	], stateV(SCM_CHANGES, { hasStaged: true })),

	tc('M-024', 'Open HTML file, set content, verify', 'P2', ['integration', 'editor', 'html'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m024.html' }),
		step(SET_CONTENT, { content: '<div>Hello</div>' }),
		step(SAVE),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'contains', '<div>Hello</div>')),

	tc('M-025', 'Create and delete file via explorer', 'P1', ['integration', 'explorer', 'lifecycle'], [
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m025.txt', content: 'temp' }),
		step(EXPLORE_TREE, {}, { capture: 'before' }),
		step(EXPLORE_DELETE, { path: '/tmp/int-m025.txt' }),
	], valueV('before', 'truthy', true)),

	tc('M-026', 'Open Python file, edit, save', 'P2', ['integration', 'editor', 'python'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m026.py' }),
		step(SET_CONTENT, { content: 'def main():\n    print("hello")' }),
		step(SAVE),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'contains', 'def main')),

	tc('M-027', 'Open file, save, take screenshot', 'P1', ['integration', 'editor', 'screenshot'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m027.ts' }),
		step(SET_CONTENT, { content: 'screenshot test content' }, { wait: 300 }),
		step(SAVE),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-028', 'Rapid file create-delete cycle', 'P2', ['integration', 'explorer', 'rapid'], [
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m028-1.txt', content: 'a' }),
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m028-2.txt', content: 'b' }),
		step(EXPLORE_DELETE, { path: '/tmp/int-m028-1.txt' }),
		step(EXPLORE_DELETE, { path: '/tmp/int-m028-2.txt' }),
	], stateV(EXPLORE_TREE, { success: true })),

	tc('M-029', 'Edit markdown file with code block', 'P2', ['integration', 'editor', 'markdown'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m029.md' }),
		step(SET_CONTENT, { content: '# Title\n```ts\nconst x = 1;\n```' }),
		step(SAVE),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'contains', '# Title')),

	tc('M-030', 'Full file lifecycle: create, open, edit, save, close, reopen', 'P0', ['integration', 'editor', 'lifecycle'], [
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m030.ts', content: 'initial' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m030.ts' }),
		step(SET_CONTENT, { content: 'updated' }),
		step(SAVE),
		step(CLOSE),
		step(OPEN_FILE, { filePath: '/tmp/int-m030.ts' }),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'contains', 'updated')),
];

// ===========================================================================
// M-031 to M-060 : Project + Conversation + Chat (30 tests)
// ===========================================================================

const projectChat: TestCase[] = [
	tc('M-031', 'Open settings then switch theme', 'P0', ['integration', 'settings', 'theme'], [
		step(SETTINGS_UI),
		step(THEME_LIST, {}, { capture: 'themes' }),
		step(THEME_SET, { theme: 'Default Dark+' }),
		step(THEME_GET, {}, { capture: 't' }),
	], valueV('t', 'contains', 'Dark')),

	tc('M-032', 'Set theme then take screenshot to verify', 'P0', ['integration', 'theme', 'screenshot'], [
		step(THEME_SET, { theme: 'Default Light+' }),
		step(SCREENSHOT, {}, { capture: 'shot', wait: 500 }),
		step(OCR, {}, { capture: 'text' }),
	], valueV('shot', 'truthy', true)),

	tc('M-033', 'Open settings JSON and edit a setting', 'P1', ['integration', 'settings', 'json'], [
		step(SETTINGS_JSON),
		step(SETTINGS_SET, { key: 'editor.wordWrap', value: 'on' }),
		step(SETTINGS_GET, { key: 'editor.wordWrap' }, { capture: 'v' }),
	], valueV('v', 'equals', 'on')),

	tc('M-034', 'Change font size then verify via settings', 'P1', ['integration', 'theme', 'font'], [
		step(FONT_SIZE, { size: 16 }),
		step(SETTINGS_GET, { key: 'editor.fontSize' }, { capture: 'fs' }),
	], valueV('fs', 'equals', 16)),

	tc('M-035', 'Change font family then verify', 'P1', ['integration', 'theme', 'font-family'], [
		step(FONT_FAMILY, { family: 'Fira Code' }),
		step(SETTINGS_GET, { key: 'editor.fontFamily' }, { capture: 'ff' }),
	], valueV('ff', 'contains', 'Fira Code')),

	tc('M-036', 'Set setting, reset, verify default restored', 'P0', ['integration', 'settings', 'reset'], [
		step(SETTINGS_SET, { key: 'editor.tabSize', value: 8 }),
		step(SETTINGS_GET, { key: 'editor.tabSize' }, { capture: 'before' }),
		step(SETTINGS_RESET, { key: 'editor.tabSize' }),
		step(SETTINGS_GET, { key: 'editor.tabSize' }, { capture: 'after' }),
	], valueV('after', 'equals', 4)),

	tc('M-037', 'Open explorer then settings in sequence', 'P1', ['integration', 'explorer', 'settings'], [
		step(EXPLORE_OPEN),
		step(SETTINGS_UI, {}, { wait: 300 }),
	], stateV(SETTINGS_GET, { success: true })),

	tc('M-038', 'Theme switch dark to light and back', 'P1', ['integration', 'theme', 'toggle'], [
		step(THEME_SET, { theme: 'Default Dark+' }),
		step(THEME_SET, { theme: 'Default Light+' }),
		step(THEME_SET, { theme: 'Default Dark+' }),
		step(THEME_GET, {}, { capture: 't' }),
	], valueV('t', 'contains', 'Dark')),

	tc('M-039', 'Set multiple settings in sequence', 'P1', ['integration', 'settings', 'batch'], [
		step(SETTINGS_SET, { key: 'editor.minimap.enabled', value: false }),
		step(SETTINGS_SET, { key: 'editor.lineNumbers', value: 'off' }),
		step(SETTINGS_GET, { key: 'editor.minimap.enabled' }, { capture: 'mm' }),
		step(SETTINGS_GET, { key: 'editor.lineNumbers' }, { capture: 'ln' }),
	], valueV('mm', 'equals', false)),

	tc('M-040', 'Open settings UI and screenshot', 'P2', ['integration', 'settings', 'screenshot'], [
		step(SETTINGS_UI, {}, { wait: 500 }),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-041', 'Set word wrap then open file to verify', 'P1', ['integration', 'settings', 'editor'], [
		step(SETTINGS_SET, { key: 'editor.wordWrap', value: 'on' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m041.ts' }),
		step(SET_CONTENT, { content: 'a '.repeat(200) }),
		step(SAVE),
	], stateV(SETTINGS_GET, { success: true })),

	tc('M-042', 'Font size change then screenshot OCR', 'P2', ['integration', 'font', 'ocr'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m042.ts' }),
		step(SET_CONTENT, { content: 'VISIBLE TEXT' }, { wait: 300 }),
		step(FONT_SIZE, { size: 24 }),
		step(SCREENSHOT, {}, { wait: 500 }),
		step(OCR, {}, { capture: 'text' }),
	], valueV('text', 'contains', 'VISIBLE')),

	tc('M-043', 'Reset all modified settings', 'P1', ['integration', 'settings', 'reset-batch'], [
		step(SETTINGS_SET, { key: 'editor.tabSize', value: 8 }),
		step(SETTINGS_SET, { key: 'editor.wordWrap', value: 'on' }),
		step(SETTINGS_RESET, { key: 'editor.tabSize' }),
		step(SETTINGS_RESET, { key: 'editor.wordWrap' }),
		step(SETTINGS_GET, { key: 'editor.tabSize' }, { capture: 'ts' }),
	], valueV('ts', 'equals', 4)),

	tc('M-044', 'Theme list then set first available', 'P2', ['integration', 'theme', 'list-set'], [
		step(THEME_LIST, {}, { capture: 'themes' }),
		step(THEME_SET, { theme: 'Default Dark+' }),
		step(THEME_GET, {}, { capture: 't' }),
	], valueV('t', 'truthy', true)),

	tc('M-045', 'Set invalid setting key gracefully', 'P2', ['integration', 'settings', 'error'], [
		failStep(SETTINGS_SET, { key: '', value: 'bad' }),
	], valueV('result', 'falsy', true)),

	tc('M-046', 'Open settings JSON then switch to UI', 'P2', ['integration', 'settings', 'switch'], [
		step(SETTINGS_JSON, {}, { wait: 300 }),
		step(SETTINGS_UI, {}, { wait: 300 }),
	], stateV(SETTINGS_GET, { success: true })),

	tc('M-047', 'Theme set then verify via settings get', 'P1', ['integration', 'theme', 'verify'], [
		step(THEME_SET, { theme: 'Default High Contrast' }),
		step(SETTINGS_GET, { key: 'workbench.colorTheme' }, { capture: 'theme' }),
	], valueV('theme', 'contains', 'High Contrast')),

	tc('M-048', 'Multiple font size changes', 'P2', ['integration', 'font', 'rapid'], [
		step(FONT_SIZE, { size: 12 }),
		step(FONT_SIZE, { size: 14 }),
		step(FONT_SIZE, { size: 16 }),
		step(SETTINGS_GET, { key: 'editor.fontSize' }, { capture: 'fs' }),
	], valueV('fs', 'equals', 16)),

	tc('M-049', 'Set boolean setting on and off', 'P2', ['integration', 'settings', 'toggle'], [
		step(SETTINGS_SET, { key: 'editor.minimap.enabled', value: true }),
		step(SETTINGS_SET, { key: 'editor.minimap.enabled', value: false }),
		step(SETTINGS_GET, { key: 'editor.minimap.enabled' }, { capture: 'v' }),
	], valueV('v', 'equals', false)),

	tc('M-050', 'Open file after theme switch', 'P1', ['integration', 'theme', 'editor'], [
		step(THEME_SET, { theme: 'Default Dark+' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m050.ts' }, { wait: 300 }),
		step(SET_CONTENT, { content: 'post-theme content' }),
		step(SAVE),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'contains', 'post-theme')),

	tc('M-051', 'Settings get multiple keys', 'P1', ['integration', 'settings', 'multi-get'], [
		step(SETTINGS_GET, { key: 'editor.fontSize' }, { capture: 'fs' }),
		step(SETTINGS_GET, { key: 'editor.tabSize' }, { capture: 'ts' }),
		step(SETTINGS_GET, { key: 'editor.wordWrap' }, { capture: 'ww' }),
	], valueV('fs', 'truthy', true)),

	tc('M-052', 'Theme get current before set', 'P2', ['integration', 'theme', 'get-set'], [
		step(THEME_GET, {}, { capture: 'before' }),
		step(THEME_SET, { theme: 'Default Light+' }),
		step(THEME_GET, {}, { capture: 'after' }),
	], valueV('after', 'contains', 'Light')),

	tc('M-053', 'Settings set string value', 'P2', ['integration', 'settings', 'string'], [
		step(SETTINGS_SET, { key: 'editor.cursorStyle', value: 'block' }),
		step(SETTINGS_GET, { key: 'editor.cursorStyle' }, { capture: 'v' }),
	], valueV('v', 'equals', 'block')),

	tc('M-054', 'Font family then font size combo', 'P2', ['integration', 'font', 'combo'], [
		step(FONT_FAMILY, { family: 'Menlo' }),
		step(FONT_SIZE, { size: 15 }),
		step(SETTINGS_GET, { key: 'editor.fontFamily' }, { capture: 'ff' }),
		step(SETTINGS_GET, { key: 'editor.fontSize' }, { capture: 'fs' }),
	], valueV('fs', 'equals', 15)),

	tc('M-055', 'Settings UI screenshot with OCR', 'P2', ['integration', 'settings', 'ocr'], [
		step(SETTINGS_UI, {}, { wait: 500 }),
		step(SCREENSHOT, {}, { wait: 300 }),
		step(OCR, {}, { capture: 'text' }),
	], valueV('text', 'truthy', true)),

	tc('M-056', 'Reset setting then verify default', 'P1', ['integration', 'settings', 'reset-verify'], [
		step(SETTINGS_SET, { key: 'editor.renderWhitespace', value: 'all' }),
		step(SETTINGS_RESET, { key: 'editor.renderWhitespace' }),
		step(SETTINGS_GET, { key: 'editor.renderWhitespace' }, { capture: 'v' }),
	], valueV('v', 'truthy', true)),

	tc('M-057', 'Theme list count check', 'P2', ['integration', 'theme', 'count'], [
		step(THEME_LIST, {}, { capture: 'themes' }),
	], valueV('themes', 'truthy', true)),

	tc('M-058', 'High contrast theme and screenshot', 'P2', ['integration', 'theme', 'hc-screenshot'], [
		step(THEME_SET, { theme: 'Default High Contrast' }, { wait: 300 }),
		step(SCREENSHOT, {}, { capture: 'shot' }),
		step(THEME_SET, { theme: 'Default Dark+' }),
	], valueV('shot', 'truthy', true)),

	tc('M-059', 'Settings open UI close then open JSON', 'P2', ['integration', 'settings', 'ui-json'], [
		step(SETTINGS_UI, {}, { wait: 200 }),
		step(CLOSE_ALL),
		step(SETTINGS_JSON, {}, { wait: 200 }),
	], stateV(SETTINGS_GET, { success: true })),

	tc('M-060', 'Full settings lifecycle: get, set, verify, reset, verify', 'P0', ['integration', 'settings', 'full'], [
		step(SETTINGS_GET, { key: 'editor.tabSize' }, { capture: 'orig' }),
		step(SETTINGS_SET, { key: 'editor.tabSize', value: 8 }),
		step(SETTINGS_GET, { key: 'editor.tabSize' }, { capture: 'changed' }),
		step(SETTINGS_RESET, { key: 'editor.tabSize' }),
		step(SETTINGS_GET, { key: 'editor.tabSize' }, { capture: 'reset' }),
	], valueV('changed', 'equals', 8)),
];

// ===========================================================================
// M-061 to M-080 : Theme + Screenshot + OCR (20 tests)
// ===========================================================================

const themeScreenshotOcr: TestCase[] = [
	tc('M-061', 'Screenshot full window', 'P0', ['integration', 'screenshot', 'full'], [
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-062', 'Set theme, screenshot, OCR verify', 'P0', ['integration', 'theme', 'ocr'], [
		step(THEME_SET, { theme: 'Default Light+' }),
		step(SETTINGS_UI, {}, { wait: 500 }),
		step(SCREENSHOT, {}, { capture: 'shot', wait: 300 }),
		step(OCR, {}, { capture: 'text' }),
	], valueV('text', 'truthy', true)),

	tc('M-063', 'Region screenshot of editor area', 'P1', ['integration', 'screenshot', 'region'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m063.ts' }),
		step(SET_CONTENT, { content: 'REGION_TEST_CONTENT' }, { wait: 300 }),
		step(REGION_SHOT, { x: 0, y: 0, width: 800, height: 600 }, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-064', 'Take screenshot then list screenshots', 'P1', ['integration', 'screenshot', 'list'], [
		step(SCREENSHOT, {}, { capture: 'shot' }),
		step(SHOT_LIST, {}, { capture: 'list' }),
	], valueV('list', 'truthy', true)),

	tc('M-065', 'OCR after setting large font', 'P1', ['integration', 'ocr', 'font'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m065.ts' }),
		step(SET_CONTENT, { content: 'BIG_TEXT_HERE' }, { wait: 300 }),
		step(FONT_SIZE, { size: 28 }),
		step(SCREENSHOT, {}, { wait: 500 }),
		step(OCR, {}, { capture: 'text' }),
	], valueV('text', 'contains', 'BIG_TEXT')),

	tc('M-066', 'Find text in screenshot', 'P1', ['integration', 'screenshot', 'find-text'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m066.ts' }),
		step(SET_CONTENT, { content: 'UNIQUE_MARKER_066' }, { wait: 500 }),
		step(SCREENSHOT, {}, { wait: 300 }),
		step(FIND_TEXT, { text: 'UNIQUE_MARKER' }, { capture: 'found' }),
	], valueV('found', 'truthy', true)),

	tc('M-067', 'Screenshot after dark theme', 'P1', ['integration', 'screenshot', 'dark'], [
		step(THEME_SET, { theme: 'Default Dark+' }, { wait: 300 }),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-068', 'Screenshot after light theme', 'P1', ['integration', 'screenshot', 'light'], [
		step(THEME_SET, { theme: 'Default Light+' }, { wait: 300 }),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-069', 'Multiple screenshots in sequence', 'P2', ['integration', 'screenshot', 'sequence'], [
		step(SCREENSHOT, {}, { capture: 'shot1' }),
		step(SCREENSHOT, {}, { capture: 'shot2' }),
		step(SCREENSHOT, {}, { capture: 'shot3' }),
	], valueV('shot3', 'truthy', true)),

	tc('M-070', 'OCR empty editor', 'P2', ['integration', 'ocr', 'empty'], [
		step(CLOSE_ALL),
		step(SCREENSHOT, {}, { wait: 300 }),
		step(OCR, {}, { capture: 'text' }),
	], valueV('text', 'truthy', true)),

	tc('M-071', 'Region screenshot small area', 'P2', ['integration', 'screenshot', 'small-region'], [
		step(REGION_SHOT, { x: 100, y: 100, width: 200, height: 200 }, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-072', 'Screenshot with high-contrast theme', 'P2', ['integration', 'screenshot', 'high-contrast'], [
		step(THEME_SET, { theme: 'Default High Contrast' }, { wait: 300 }),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-073', 'OCR settings page', 'P2', ['integration', 'ocr', 'settings'], [
		step(SETTINGS_UI, {}, { wait: 500 }),
		step(SCREENSHOT, {}, { wait: 300 }),
		step(OCR, {}, { capture: 'text' }),
	], valueV('text', 'contains', 'Settings')),

	tc('M-074', 'Find text that does not exist', 'P2', ['integration', 'find-text', 'not-found'], [
		step(SCREENSHOT, {}),
		step(FIND_TEXT, { text: 'ZZZNONEXISTENT999' }, { capture: 'found' }),
	], valueV('found', 'falsy', true)),

	tc('M-075', 'Screenshot after opening explorer', 'P2', ['integration', 'screenshot', 'explorer'], [
		step(EXPLORE_OPEN, {}, { wait: 300 }),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-076', 'OCR after opening debug panel', 'P2', ['integration', 'ocr', 'debug'], [
		step(DBG_OPEN, {}, { wait: 300 }),
		step(SCREENSHOT, {}, { wait: 300 }),
		step(OCR, {}, { capture: 'text' }),
	], valueV('text', 'truthy', true)),

	tc('M-077', 'Theme + font + screenshot combo', 'P1', ['integration', 'theme', 'font', 'screenshot'], [
		step(THEME_SET, { theme: 'Default Dark+' }),
		step(FONT_SIZE, { size: 20 }),
		step(OPEN_FILE, { filePath: '/tmp/int-m077.ts' }),
		step(SET_CONTENT, { content: 'COMBO_TEST' }, { wait: 300 }),
		step(SCREENSHOT, {}, { capture: 'shot', wait: 300 }),
		step(OCR, {}, { capture: 'text' }),
	], valueV('text', 'contains', 'COMBO')),

	tc('M-078', 'Screenshot list after multiple captures', 'P2', ['integration', 'screenshot', 'list-count'], [
		step(SCREENSHOT, {}),
		step(SCREENSHOT, {}),
		step(SHOT_LIST, {}, { capture: 'list' }),
	], valueV('list', 'truthy', true)),

	tc('M-079', 'Region screenshot full width', 'P2', ['integration', 'screenshot', 'full-width'], [
		step(REGION_SHOT, { x: 0, y: 0, width: 1920, height: 100 }, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-080', 'OCR after SCM panel open', 'P2', ['integration', 'ocr', 'scm'], [
		step(SCM_OPEN, {}, { wait: 300 }),
		step(SCREENSHOT, {}, { wait: 300 }),
		step(OCR, {}, { capture: 'text' }),
	], valueV('text', 'truthy', true)),
];

// ===========================================================================
// M-081 to M-100 : Terminal + Editor + Debug (20 tests)
// ===========================================================================

const termEditorDebug: TestCase[] = [
	tc('M-081', 'Create terminal and run echo', 'P0', ['integration', 'terminal', 'basic'], [
		step(TERM_CREATE, {}, { capture: 'tid' }),
		step(TERM_SEND, { command: 'echo hello' }, { wait: 500 }),
		step(TERM_OUTPUT, {}, { capture: 'out' }),
	], valueV('out', 'contains', 'hello')),

	tc('M-082', 'Terminal + editor side by side', 'P0', ['integration', 'terminal', 'editor'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m082.ts' }),
		step(SET_CONTENT, { content: 'console.log("test")' }),
		step(SAVE),
		step(TERM_CREATE, {}, { capture: 'tid' }),
		step(TERM_SEND, { command: 'echo m082' }, { wait: 500 }),
		step(TERM_OUTPUT, {}, { capture: 'out' }),
	], valueV('out', 'contains', 'm082')),

	tc('M-083', 'Open debug view then start session', 'P1', ['integration', 'debug', 'start'], [
		step(DBG_OPEN),
		step(DBG_START, { configuration: 'node' }, { capture: 'session', wait: 1000 }),
		step(DBG_STATE, {}, { capture: 'state' }),
	], valueV('state', 'truthy', true)),

	tc('M-084', 'Debug start then stop', 'P1', ['integration', 'debug', 'lifecycle'], [
		step(DBG_OPEN),
		step(DBG_START, { configuration: 'node' }, { wait: 1000 }),
		step(DBG_STOP),
		step(DBG_STATE, {}, { capture: 'state' }),
	], valueV('state', 'truthy', true)),

	tc('M-085', 'Terminal list after creating multiple', 'P1', ['integration', 'terminal', 'list'], [
		step(TERM_CREATE, { name: 'term-a' }),
		step(TERM_CREATE, { name: 'term-b' }),
		step(TERM_LIST, {}, { capture: 'list' }),
	], valueV('list', 'truthy', true)),

	tc('M-086', 'Terminal create, use, close', 'P1', ['integration', 'terminal', 'lifecycle'], [
		step(TERM_CREATE, {}, { capture: 'tid' }),
		step(TERM_SEND, { command: 'echo done' }, { wait: 500 }),
		step(TERM_CLOSE, {}),
	], stateV(TERM_LIST, { success: true })),

	tc('M-087', 'Open file, run in terminal, check output', 'P1', ['integration', 'terminal', 'run-file'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m087.sh' }),
		step(SET_CONTENT, { content: 'echo "script output"' }),
		step(SAVE),
		step(TERM_CREATE, {}),
		step(TERM_SEND, { command: 'bash /tmp/int-m087.sh' }, { wait: 1000 }),
		step(TERM_OUTPUT, {}, { capture: 'out' }),
	], valueV('out', 'contains', 'script output')),

	tc('M-088', 'Debug open then screenshot', 'P2', ['integration', 'debug', 'screenshot'], [
		step(DBG_OPEN, {}, { wait: 300 }),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-089', 'Terminal with long output', 'P2', ['integration', 'terminal', 'long-output'], [
		step(TERM_CREATE, {}),
		step(TERM_SEND, { command: 'for i in $(seq 1 50); do echo "line $i"; done' }, { wait: 2000 }),
		step(TERM_OUTPUT, {}, { capture: 'out' }),
	], valueV('out', 'contains', 'line 50')),

	tc('M-090', 'Editor + terminal + debug all open', 'P1', ['integration', 'multi-panel'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m090.ts' }),
		step(TERM_CREATE, {}),
		step(DBG_OPEN),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-091', 'Terminal send pwd command', 'P2', ['integration', 'terminal', 'pwd'], [
		step(TERM_CREATE, {}),
		step(TERM_SEND, { command: 'pwd' }, { wait: 500 }),
		step(TERM_OUTPUT, {}, { capture: 'out' }),
	], valueV('out', 'truthy', true)),

	tc('M-092', 'Create named terminal', 'P2', ['integration', 'terminal', 'named'], [
		step(TERM_CREATE, { name: 'my-term' }, { capture: 'tid' }),
		step(TERM_LIST, {}, { capture: 'list' }),
	], valueV('list', 'contains', 'my-term')),

	tc('M-093', 'Debug state when no session active', 'P2', ['integration', 'debug', 'idle'], [
		step(DBG_STATE, {}, { capture: 'state' }),
	], valueV('state', 'truthy', true)),

	tc('M-094', 'Terminal output before any command', 'P2', ['integration', 'terminal', 'empty-output'], [
		step(TERM_CREATE, {}),
		step(TERM_OUTPUT, {}, { capture: 'out' }),
	], valueV('out', 'truthy', true)),

	tc('M-095', 'Edit file then run node in terminal', 'P1', ['integration', 'editor', 'terminal', 'node'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m095.js' }),
		step(SET_CONTENT, { content: 'console.log("m095 output")' }),
		step(SAVE),
		step(TERM_CREATE, {}),
		step(TERM_SEND, { command: 'node /tmp/int-m095.js' }, { wait: 1000 }),
		step(TERM_OUTPUT, {}, { capture: 'out' }),
	], valueV('out', 'contains', 'm095 output')),

	tc('M-096', 'Open multiple terminals then close all', 'P2', ['integration', 'terminal', 'close-all'], [
		step(TERM_CREATE, { name: 'a' }),
		step(TERM_CREATE, { name: 'b' }),
		step(TERM_CREATE, { name: 'c' }),
		step(TERM_CLOSE, {}),
		step(TERM_CLOSE, {}),
		step(TERM_CLOSE, {}),
	], stateV(TERM_LIST, { success: true })),

	tc('M-097', 'Debug start with invalid config', 'P2', ['integration', 'debug', 'error'], [
		failStep(DBG_START, { configuration: 'nonexistent_config_xyz' }),
	], valueV('result', 'falsy', true)),

	tc('M-098', 'Terminal env variable check', 'P2', ['integration', 'terminal', 'env'], [
		step(TERM_CREATE, {}),
		step(TERM_SEND, { command: 'echo $HOME' }, { wait: 500 }),
		step(TERM_OUTPUT, {}, { capture: 'out' }),
	], valueV('out', 'truthy', true)),

	tc('M-099', 'Screenshot terminal panel', 'P2', ['integration', 'terminal', 'screenshot'], [
		step(TERM_CREATE, {}, { wait: 300 }),
		step(TERM_SEND, { command: 'echo screenshot_test' }, { wait: 500 }),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-100', 'Full debug workflow: open, start, state, stop', 'P0', ['integration', 'debug', 'full'], [
		step(DBG_OPEN),
		step(DBG_START, { configuration: 'node' }, { wait: 1000 }),
		step(DBG_STATE, {}, { capture: 'state' }),
		step(DBG_STOP),
	], valueV('state', 'truthy', true)),
];

// ===========================================================================
// M-101 to M-130 : Sidebar + Project Management (30 tests)
// ===========================================================================

const sidebarProject: TestCase[] = [
	tc('M-101', 'Open explorer sidebar', 'P0', ['integration', 'sidebar', 'explorer'], [
		step(EXPLORE_OPEN),
		step(EXPLORE_TREE, {}, { capture: 'tree' }),
	], valueV('tree', 'truthy', true)),

	tc('M-102', 'Switch between explorer and SCM', 'P0', ['integration', 'sidebar', 'switch'], [
		step(EXPLORE_OPEN, {}, { wait: 200 }),
		step(SCM_OPEN, {}, { wait: 200 }),
		step(EXPLORE_OPEN, {}, { wait: 200 }),
	], stateV(EXPLORE_TREE, { success: true })),

	tc('M-103', 'Explorer to debug to settings flow', 'P1', ['integration', 'sidebar', 'flow'], [
		step(EXPLORE_OPEN, {}, { wait: 200 }),
		step(DBG_OPEN, {}, { wait: 200 }),
		step(SETTINGS_UI, {}, { wait: 200 }),
	], stateV(SETTINGS_GET, { success: true })),

	tc('M-104', 'Create project structure via explorer', 'P0', ['integration', 'project', 'create'], [
		step(EXPLORE_CREATE_DIR, { path: '/tmp/int-m104-proj' }),
		step(EXPLORE_CREATE_DIR, { path: '/tmp/int-m104-proj/src' }),
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m104-proj/src/index.ts', content: 'export {}' }),
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m104-proj/package.json', content: '{"name":"test"}' }),
		step(EXPLORE_TREE, {}, { capture: 'tree' }),
	], valueV('tree', 'truthy', true)),

	tc('M-105', 'Navigate project files', 'P1', ['integration', 'project', 'navigate'], [
		step(EXPLORE_CREATE_DIR, { path: '/tmp/int-m105-proj/lib' }),
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m105-proj/lib/utils.ts', content: 'export const x = 1;' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m105-proj/lib/utils.ts' }),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'contains', 'export const x')),

	tc('M-106', 'Reveal file in explorer sidebar', 'P1', ['integration', 'sidebar', 'reveal'], [
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m106.ts', content: 'reveal' }),
		step(EXPLORE_REVEAL, { path: '/tmp/int-m106.ts' }),
	], stateV(EXPLORE_TREE, { success: true })),

	tc('M-107', 'SCM panel shows changes after file edit', 'P1', ['integration', 'sidebar', 'scm-changes'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m107.ts' }),
		step(SET_CONTENT, { content: 'scm change' }),
		step(SAVE),
		step(SCM_OPEN),
		step(SCM_CHANGES, {}, { capture: 'changes' }),
	], valueV('changes', 'truthy', true)),

	tc('M-108', 'Debug panel open and screenshot', 'P2', ['integration', 'sidebar', 'debug-shot'], [
		step(DBG_OPEN, {}, { wait: 300 }),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-109', 'Explorer create then rename project file', 'P1', ['integration', 'project', 'rename'], [
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m109-old.ts', content: 'data' }),
		step(EXPLORE_RENAME, { oldPath: '/tmp/int-m109-old.ts', newPath: '/tmp/int-m109-new.ts' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m109-new.ts' }),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'contains', 'data')),

	tc('M-110', 'Full project setup: dir, files, open, verify', 'P0', ['integration', 'project', 'full-setup'], [
		step(EXPLORE_CREATE_DIR, { path: '/tmp/int-m110-proj' }),
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m110-proj/main.ts', content: 'function main() {}' }),
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m110-proj/config.json', content: '{}' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m110-proj/main.ts' }),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'contains', 'function main')),

	tc('M-111', 'Explorer tree depth navigation', 'P1', ['integration', 'explorer', 'depth'], [
		step(EXPLORE_CREATE_DIR, { path: '/tmp/int-m111/a/b/c' }),
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m111/a/b/c/leaf.txt', content: 'leaf' }),
		step(EXPLORE_TREE, {}, { capture: 'tree' }),
	], valueV('tree', 'truthy', true)),

	tc('M-112', 'Open SCM then get branch', 'P1', ['integration', 'sidebar', 'branch'], [
		step(SCM_OPEN),
		step(SCM_BRANCH, {}, { capture: 'branch' }),
	], valueV('branch', 'truthy', true)),

	tc('M-113', 'Explorer delete folder', 'P1', ['integration', 'explorer', 'delete-dir'], [
		step(EXPLORE_CREATE_DIR, { path: '/tmp/int-m113-dir' }),
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m113-dir/file.txt', content: 'x' }),
		step(EXPLORE_DELETE, { path: '/tmp/int-m113-dir' }),
	], stateV(EXPLORE_TREE, { success: true })),

	tc('M-114', 'Switch sidebar panels rapidly', 'P2', ['integration', 'sidebar', 'rapid-switch'], [
		step(EXPLORE_OPEN),
		step(SCM_OPEN),
		step(DBG_OPEN),
		step(EXPLORE_OPEN),
		step(SCM_OPEN),
		step(DBG_OPEN),
	], stateV(DBG_STATE, { success: true })),

	tc('M-115', 'Create multiple files and list tree', 'P1', ['integration', 'project', 'multi-file'], [
		step(EXPLORE_CREATE_DIR, { path: '/tmp/int-m115-proj' }),
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m115-proj/a.ts', content: 'a' }),
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m115-proj/b.ts', content: 'b' }),
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m115-proj/c.ts', content: 'c' }),
		step(EXPLORE_TREE, {}, { capture: 'tree' }),
	], valueV('tree', 'truthy', true)),

	tc('M-116', 'Sidebar explorer after close all editors', 'P2', ['integration', 'sidebar', 'no-editors'], [
		step(CLOSE_ALL),
		step(EXPLORE_OPEN),
		step(EXPLORE_TREE, {}, { capture: 'tree' }),
	], valueV('tree', 'truthy', true)),

	tc('M-117', 'SCM stage then commit flow', 'P1', ['integration', 'scm', 'commit-flow'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m117.ts' }),
		step(SET_CONTENT, { content: 'commit me' }),
		step(SAVE),
		step(SCM_STAGE, { filePath: '/tmp/int-m117.ts' }),
		step(SCM_COMMIT, { message: 'test commit m117' }),
	], stateV(SCM_CHANGES, { success: true })),

	tc('M-118', 'Explorer and settings open together', 'P2', ['integration', 'sidebar', 'dual'], [
		step(EXPLORE_OPEN),
		step(SETTINGS_UI),
	], stateV(SETTINGS_GET, { success: true })),

	tc('M-119', 'Create project with README', 'P2', ['integration', 'project', 'readme'], [
		step(EXPLORE_CREATE_DIR, { path: '/tmp/int-m119-proj' }),
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m119-proj/README.md', content: '# My Project' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m119-proj/README.md' }),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'contains', '# My Project')),

	tc('M-120', 'Debug open, explorer open, screenshot', 'P2', ['integration', 'sidebar', 'multi-screenshot'], [
		step(DBG_OPEN, {}, { wait: 200 }),
		step(SCREENSHOT, {}, { capture: 'shot1' }),
		step(EXPLORE_OPEN, {}, { wait: 200 }),
		step(SCREENSHOT, {}, { capture: 'shot2' }),
	], valueV('shot2', 'truthy', true)),

	tc('M-121', 'Project file edit and SCM check', 'P1', ['integration', 'project', 'scm'], [
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m121.ts', content: 'v1' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m121.ts' }),
		step(SET_CONTENT, { content: 'v2' }),
		step(SAVE),
		step(SCM_CHANGES, {}, { capture: 'changes' }),
	], valueV('changes', 'truthy', true)),

	tc('M-122', 'Explorer workspace info', 'P2', ['integration', 'explorer', 'workspace'], [
		step(EXPLORE_OPEN),
		step(EXPLORE_TREE, {}, { capture: 'tree' }),
	], valueV('tree', 'truthy', true)),

	tc('M-123', 'Open settings after project creation', 'P2', ['integration', 'project', 'settings'], [
		step(EXPLORE_CREATE_DIR, { path: '/tmp/int-m123-proj' }),
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m123-proj/.vscode/settings.json', content: '{}' }),
		step(SETTINGS_UI),
	], stateV(SETTINGS_GET, { success: true })),

	tc('M-124', 'Sidebar navigation with terminal open', 'P2', ['integration', 'sidebar', 'terminal'], [
		step(TERM_CREATE, {}),
		step(EXPLORE_OPEN),
		step(SCM_OPEN),
		step(EXPLORE_OPEN),
	], stateV(EXPLORE_TREE, { success: true })),

	tc('M-125', 'Multiple file operations then tree', 'P1', ['integration', 'explorer', 'batch-ops'], [
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m125-a.ts', content: 'a' }),
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m125-b.ts', content: 'b' }),
		step(EXPLORE_RENAME, { oldPath: '/tmp/int-m125-a.ts', newPath: '/tmp/int-m125-aa.ts' }),
		step(EXPLORE_DELETE, { path: '/tmp/int-m125-b.ts' }),
		step(EXPLORE_TREE, {}, { capture: 'tree' }),
	], valueV('tree', 'truthy', true)),

	tc('M-126', 'Project with nested src and test dirs', 'P2', ['integration', 'project', 'structure'], [
		step(EXPLORE_CREATE_DIR, { path: '/tmp/int-m126-proj/src' }),
		step(EXPLORE_CREATE_DIR, { path: '/tmp/int-m126-proj/test' }),
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m126-proj/src/app.ts', content: 'app' }),
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m126-proj/test/app.test.ts', content: 'test' }),
	], stateV(EXPLORE_TREE, { success: true })),

	tc('M-127', 'SCM open with explorer visible', 'P2', ['integration', 'sidebar', 'overlay'], [
		step(EXPLORE_OPEN),
		step(SCM_OPEN),
		step(SCM_BRANCH, {}, { capture: 'branch' }),
	], valueV('branch', 'truthy', true)),

	tc('M-128', 'Explorer create file then stage', 'P1', ['integration', 'explorer', 'scm-stage'], [
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m128.ts', content: 'stage me' }),
		step(SCM_STAGE, { filePath: '/tmp/int-m128.ts' }),
	], stateV(SCM_CHANGES, { success: true })),

	tc('M-129', 'Full sidebar tour: all panels', 'P1', ['integration', 'sidebar', 'tour'], [
		step(EXPLORE_OPEN, {}, { wait: 200 }),
		step(SCM_OPEN, {}, { wait: 200 }),
		step(DBG_OPEN, {}, { wait: 200 }),
		step(SETTINGS_UI, {}, { wait: 200 }),
		step(EXPLORE_OPEN),
	], stateV(EXPLORE_TREE, { success: true })),

	tc('M-130', 'Create project, edit files, check tree', 'P0', ['integration', 'project', 'comprehensive'], [
		step(EXPLORE_CREATE_DIR, { path: '/tmp/int-m130-proj' }),
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m130-proj/index.ts', content: 'main' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m130-proj/index.ts' }),
		step(SET_CONTENT, { content: 'updated main' }),
		step(SAVE),
		step(EXPLORE_TREE, {}, { capture: 'tree' }),
	], valueV('tree', 'truthy', true)),
];

// ===========================================================================
// M-131 to M-150 : Window + Layout (20 tests)
// ===========================================================================

const windowLayout: TestCase[] = [
	tc('M-131', 'Open file then open settings side by side', 'P1', ['integration', 'layout', 'split'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m131.ts' }),
		step(SETTINGS_UI),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-132', 'Editor with terminal below', 'P0', ['integration', 'layout', 'editor-terminal'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m132.ts' }),
		step(SET_CONTENT, { content: 'layout test' }),
		step(TERM_CREATE, {}),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-133', 'Close all then open fresh layout', 'P1', ['integration', 'layout', 'fresh'], [
		step(CLOSE_ALL),
		step(OPEN_FILE, { filePath: '/tmp/int-m133.ts' }),
		step(SET_CONTENT, { content: 'fresh start' }),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'contains', 'fresh start')),

	tc('M-134', 'Multiple editors open at once', 'P1', ['integration', 'layout', 'multi-tab'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m134-a.ts' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m134-b.ts' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m134-c.ts' }),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-135', 'Settings JSON in editor area', 'P2', ['integration', 'layout', 'settings-json'], [
		step(SETTINGS_JSON),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-136', 'Explorer sidebar with editor and terminal', 'P1', ['integration', 'layout', 'triple'], [
		step(EXPLORE_OPEN),
		step(OPEN_FILE, { filePath: '/tmp/int-m136.ts' }),
		step(TERM_CREATE, {}),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-137', 'Debug panel with editor', 'P2', ['integration', 'layout', 'debug-editor'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m137.ts' }),
		step(DBG_OPEN),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-138', 'Maximize editor by closing sidebar panels', 'P2', ['integration', 'layout', 'maximize'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m138.ts' }),
		step(SET_CONTENT, { content: 'maximized view' }),
		step(CLOSE_ALL),
		step(OPEN_FILE, { filePath: '/tmp/int-m138.ts' }),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-139', 'SCM panel with terminal', 'P2', ['integration', 'layout', 'scm-terminal'], [
		step(SCM_OPEN),
		step(TERM_CREATE, {}),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-140', 'Full workspace layout: sidebar + editor + terminal', 'P0', ['integration', 'layout', 'full'], [
		step(EXPLORE_OPEN),
		step(OPEN_FILE, { filePath: '/tmp/int-m140.ts' }),
		step(SET_CONTENT, { content: 'workspace content' }),
		step(SAVE),
		step(TERM_CREATE, {}),
		step(TERM_SEND, { command: 'echo layout' }, { wait: 500 }),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-141', 'Open 5 editors tab switching', 'P2', ['integration', 'layout', 'many-tabs'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m141-1.ts' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m141-2.ts' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m141-3.ts' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m141-4.ts' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m141-5.ts' }),
	], stateV(GET_CONTENT, { success: true })),

	tc('M-142', 'Theme switch with full layout', 'P2', ['integration', 'layout', 'theme'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m142.ts' }),
		step(TERM_CREATE, {}),
		step(THEME_SET, { theme: 'Default Light+' }),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-143', 'Open settings UI and JSON alternating', 'P2', ['integration', 'layout', 'settings-alt'], [
		step(SETTINGS_UI, {}, { wait: 200 }),
		step(SETTINGS_JSON, {}, { wait: 200 }),
		step(SETTINGS_UI, {}, { wait: 200 }),
	], stateV(SETTINGS_GET, { success: true })),

	tc('M-144', 'Editor font size affects layout', 'P2', ['integration', 'layout', 'font-size'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m144.ts' }),
		step(SET_CONTENT, { content: 'font size layout test' }),
		step(FONT_SIZE, { size: 24 }),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-145', 'Terminal panel height after commands', 'P2', ['integration', 'layout', 'terminal-height'], [
		step(TERM_CREATE, {}),
		step(TERM_SEND, { command: 'echo line1' }, { wait: 300 }),
		step(TERM_SEND, { command: 'echo line2' }, { wait: 300 }),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-146', 'Close all then open debug', 'P2', ['integration', 'layout', 'debug-only'], [
		step(CLOSE_ALL),
		step(DBG_OPEN),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-147', 'Two editors plus explorer', 'P2', ['integration', 'layout', 'dual-editor'], [
		step(EXPLORE_OPEN),
		step(OPEN_FILE, { filePath: '/tmp/int-m147-a.ts' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m147-b.ts' }),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-148', 'Settings with high contrast theme', 'P2', ['integration', 'layout', 'hc-settings'], [
		step(THEME_SET, { theme: 'Default High Contrast' }),
		step(SETTINGS_UI, {}, { wait: 300 }),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-149', 'Full layout screenshot with OCR', 'P1', ['integration', 'layout', 'ocr'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m149.ts' }),
		step(SET_CONTENT, { content: 'LAYOUT_VERIFY_TEXT' }, { wait: 300 }),
		step(EXPLORE_OPEN),
		step(SCREENSHOT, {}, { wait: 500 }),
		step(OCR, {}, { capture: 'text' }),
	], valueV('text', 'contains', 'LAYOUT_VERIFY')),

	tc('M-150', 'Restore default layout after changes', 'P1', ['integration', 'layout', 'restore'], [
		step(CLOSE_ALL),
		step(THEME_SET, { theme: 'Default Dark+' }),
		step(FONT_SIZE, { size: 14 }),
		step(OPEN_FILE, { filePath: '/tmp/int-m150.ts' }),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),
];

// ===========================================================================
// M-151 to M-170 : Chaos / Stress (20 tests)
// ===========================================================================

const chaosStress: TestCase[] = [
	tc('M-151', 'Rapid open-close 10 files', 'P1', ['integration', 'chaos', 'rapid-open-close'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m151-1.ts' }),
		step(CLOSE),
		step(OPEN_FILE, { filePath: '/tmp/int-m151-2.ts' }),
		step(CLOSE),
		step(OPEN_FILE, { filePath: '/tmp/int-m151-3.ts' }),
		step(CLOSE),
		step(OPEN_FILE, { filePath: '/tmp/int-m151-4.ts' }),
		step(CLOSE),
		step(OPEN_FILE, { filePath: '/tmp/int-m151-5.ts' }),
		step(CLOSE),
	], stateV(GET_CONTENT, { success: true })),

	tc('M-152', 'Rapid theme switching 5 times', 'P1', ['integration', 'chaos', 'theme-flicker'], [
		step(THEME_SET, { theme: 'Default Dark+' }),
		step(THEME_SET, { theme: 'Default Light+' }),
		step(THEME_SET, { theme: 'Default High Contrast' }),
		step(THEME_SET, { theme: 'Default Dark+' }),
		step(THEME_SET, { theme: 'Default Light+' }),
		step(THEME_GET, {}, { capture: 't' }),
	], valueV('t', 'contains', 'Light')),

	tc('M-153', 'Create and delete 5 files rapidly', 'P1', ['integration', 'chaos', 'create-delete'], [
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m153-1.txt', content: '1' }),
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m153-2.txt', content: '2' }),
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m153-3.txt', content: '3' }),
		step(EXPLORE_DELETE, { path: '/tmp/int-m153-1.txt' }),
		step(EXPLORE_DELETE, { path: '/tmp/int-m153-2.txt' }),
		step(EXPLORE_DELETE, { path: '/tmp/int-m153-3.txt' }),
	], stateV(EXPLORE_TREE, { success: true })),

	tc('M-154', 'Multiple terminal creation burst', 'P1', ['integration', 'chaos', 'terminal-burst'], [
		step(TERM_CREATE, { name: 'burst-1' }),
		step(TERM_CREATE, { name: 'burst-2' }),
		step(TERM_CREATE, { name: 'burst-3' }),
		step(TERM_CREATE, { name: 'burst-4' }),
		step(TERM_LIST, {}, { capture: 'list' }),
	], valueV('list', 'truthy', true)),

	tc('M-155', 'Concurrent editor + terminal + explorer ops', 'P0', ['integration', 'chaos', 'concurrent'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m155.ts' }),
		step(TERM_CREATE, {}),
		step(EXPLORE_OPEN),
		step(SET_CONTENT, { content: 'concurrent test' }),
		step(SAVE),
		step(TERM_SEND, { command: 'echo concurrent' }, { wait: 500 }),
		step(EXPLORE_TREE, {}, { capture: 'tree' }),
	], valueV('tree', 'truthy', true)),

	tc('M-156', 'Rapid settings toggle', 'P2', ['integration', 'chaos', 'settings-toggle'], [
		step(SETTINGS_SET, { key: 'editor.minimap.enabled', value: true }),
		step(SETTINGS_SET, { key: 'editor.minimap.enabled', value: false }),
		step(SETTINGS_SET, { key: 'editor.minimap.enabled', value: true }),
		step(SETTINGS_SET, { key: 'editor.minimap.enabled', value: false }),
		step(SETTINGS_GET, { key: 'editor.minimap.enabled' }, { capture: 'v' }),
	], valueV('v', 'equals', false)),

	tc('M-157', 'Rapid font size changes', 'P2', ['integration', 'chaos', 'font-stress'], [
		step(FONT_SIZE, { size: 10 }),
		step(FONT_SIZE, { size: 20 }),
		step(FONT_SIZE, { size: 8 }),
		step(FONT_SIZE, { size: 30 }),
		step(FONT_SIZE, { size: 14 }),
		step(SETTINGS_GET, { key: 'editor.fontSize' }, { capture: 'fs' }),
	], valueV('fs', 'equals', 14)),

	tc('M-158', 'Screenshot burst', 'P2', ['integration', 'chaos', 'screenshot-burst'], [
		step(SCREENSHOT, {}),
		step(SCREENSHOT, {}),
		step(SCREENSHOT, {}),
		step(SCREENSHOT, {}),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-159', 'Sidebar rapid cycling', 'P2', ['integration', 'chaos', 'sidebar-cycle'], [
		step(EXPLORE_OPEN),
		step(SCM_OPEN),
		step(DBG_OPEN),
		step(EXPLORE_OPEN),
		step(SCM_OPEN),
		step(DBG_OPEN),
		step(EXPLORE_OPEN),
	], stateV(EXPLORE_TREE, { success: true })),

	tc('M-160', 'Open same file 5 times', 'P2', ['integration', 'chaos', 'duplicate-open'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m160.ts' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m160.ts' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m160.ts' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m160.ts' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m160.ts' }),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'truthy', true)),

	tc('M-161', 'Edit same file 10 times', 'P2', ['integration', 'chaos', 'rapid-edit'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m161.ts' }),
		step(SET_CONTENT, { content: 'v1' }),
		step(SET_CONTENT, { content: 'v2' }),
		step(SET_CONTENT, { content: 'v3' }),
		step(SET_CONTENT, { content: 'v4' }),
		step(SET_CONTENT, { content: 'v5' }),
		step(SET_CONTENT, { content: 'final' }),
		step(SAVE),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'contains', 'final')),

	tc('M-162', 'Multiple OCR calls in sequence', 'P2', ['integration', 'chaos', 'ocr-burst'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m162.ts' }),
		step(SET_CONTENT, { content: 'OCR_BURST' }, { wait: 300 }),
		step(SCREENSHOT, {}, { wait: 300 }),
		step(OCR, {}, { capture: 'text1' }),
		step(OCR, {}, { capture: 'text2' }),
		step(OCR, {}, { capture: 'text3' }),
	], valueV('text3', 'truthy', true)),

	tc('M-163', 'Create deep nested dirs then delete root', 'P2', ['integration', 'chaos', 'deep-delete'], [
		step(EXPLORE_CREATE_DIR, { path: '/tmp/int-m163/a/b/c/d' }),
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m163/a/b/c/d/file.txt', content: 'deep' }),
		step(EXPLORE_DELETE, { path: '/tmp/int-m163' }),
	], stateV(EXPLORE_TREE, { success: true })),

	tc('M-164', 'Terminal commands rapid fire', 'P2', ['integration', 'chaos', 'terminal-rapid'], [
		step(TERM_CREATE, {}),
		step(TERM_SEND, { command: 'echo 1' }),
		step(TERM_SEND, { command: 'echo 2' }),
		step(TERM_SEND, { command: 'echo 3' }),
		step(TERM_SEND, { command: 'echo 4' }),
		step(TERM_SEND, { command: 'echo 5' }, { wait: 1000 }),
		step(TERM_OUTPUT, {}, { capture: 'out' }),
	], valueV('out', 'contains', '5')),

	tc('M-165', 'Open file during theme switch', 'P2', ['integration', 'chaos', 'race'], [
		step(THEME_SET, { theme: 'Default Light+' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m165.ts' }),
		step(SET_CONTENT, { content: 'race condition test' }),
		step(SAVE),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'contains', 'race condition')),

	tc('M-166', 'Stress: settings set 10 different keys', 'P2', ['integration', 'chaos', 'settings-flood'], [
		step(SETTINGS_SET, { key: 'editor.tabSize', value: 2 }),
		step(SETTINGS_SET, { key: 'editor.insertSpaces', value: true }),
		step(SETTINGS_SET, { key: 'editor.wordWrap', value: 'on' }),
		step(SETTINGS_SET, { key: 'editor.minimap.enabled', value: false }),
		step(SETTINGS_SET, { key: 'editor.lineNumbers', value: 'on' }),
		step(SETTINGS_GET, { key: 'editor.tabSize' }, { capture: 'ts' }),
	], valueV('ts', 'equals', 2)),

	tc('M-167', 'Explorer + editor + SCM + screenshot', 'P1', ['integration', 'chaos', 'all-panels'], [
		step(EXPLORE_OPEN),
		step(OPEN_FILE, { filePath: '/tmp/int-m167.ts' }),
		step(SET_CONTENT, { content: 'chaos panel test' }),
		step(SAVE),
		step(SCM_OPEN),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true)),

	tc('M-168', 'Rename file while editor is open', 'P1', ['integration', 'chaos', 'rename-open'], [
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m168-a.ts', content: 'rename while open' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m168-a.ts' }),
		step(EXPLORE_RENAME, { oldPath: '/tmp/int-m168-a.ts', newPath: '/tmp/int-m168-b.ts' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m168-b.ts' }),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'contains', 'rename while open')),

	tc('M-169', 'Delete file that is open in editor', 'P1', ['integration', 'chaos', 'delete-open'], [
		step(EXPLORE_CREATE_FILE, { path: '/tmp/int-m169.ts', content: 'delete me' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m169.ts' }),
		step(EXPLORE_DELETE, { path: '/tmp/int-m169.ts' }),
	], stateV(EXPLORE_TREE, { success: true })),

	tc('M-170', 'Full chaos: all operations interleaved', 'P0', ['integration', 'chaos', 'full'], [
		step(THEME_SET, { theme: 'Default Dark+' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m170.ts' }),
		step(TERM_CREATE, {}),
		step(SET_CONTENT, { content: 'chaos final' }),
		step(SAVE),
		step(EXPLORE_OPEN),
		step(SCREENSHOT, {}, { capture: 'shot' }),
		step(TERM_SEND, { command: 'echo chaos' }, { wait: 500 }),
		step(SCM_OPEN),
		step(OCR, {}, { capture: 'text' }),
	], valueV('shot', 'truthy', true)),
];

// ===========================================================================
// M-171 to M-185 : Error Recovery (15 tests)
// ===========================================================================

const errorRecovery: TestCase[] = [
	tc('M-171', 'Open nonexistent file gracefully', 'P0', ['integration', 'error', 'file-not-found'], [
		failStep(OPEN_FILE, { filePath: '/tmp/nonexistent_m171_xyz.ts' }),
	], valueV('result', 'falsy', true)),

	tc('M-172', 'Delete nonexistent path gracefully', 'P1', ['integration', 'error', 'delete-missing'], [
		failStep(EXPLORE_DELETE, { path: '/tmp/nonexistent_m172_xyz' }),
	], valueV('result', 'falsy', true)),

	tc('M-173', 'Rename nonexistent file gracefully', 'P1', ['integration', 'error', 'rename-missing'], [
		failStep(EXPLORE_RENAME, { oldPath: '/tmp/nonexistent_m173', newPath: '/tmp/m173-new' }),
	], valueV('result', 'falsy', true)),

	tc('M-174', 'Set invalid theme gracefully', 'P1', ['integration', 'error', 'bad-theme'], [
		failStep(THEME_SET, { theme: 'Nonexistent Theme XYZ 999' }),
	], valueV('result', 'falsy', true)),

	tc('M-175', 'Get content with no editor open', 'P1', ['integration', 'error', 'no-editor'], [
		step(CLOSE_ALL),
		failStep(GET_CONTENT),
	], valueV('result', 'falsy', true)),

	tc('M-176', 'Save with no editor open', 'P1', ['integration', 'error', 'no-save'], [
		step(CLOSE_ALL),
		failStep(SAVE),
	], valueV('result', 'falsy', true)),

	tc('M-177', 'Close with no editor open', 'P2', ['integration', 'error', 'no-close'], [
		step(CLOSE_ALL),
		failStep(CLOSE),
	], valueV('result', 'falsy', true)),

	tc('M-178', 'Terminal send to nonexistent terminal', 'P1', ['integration', 'error', 'bad-terminal'], [
		failStep(TERM_SEND, { terminalId: 'nonexistent_999', command: 'echo fail' }),
	], valueV('result', 'falsy', true)),

	tc('M-179', 'Debug stop with no active session', 'P2', ['integration', 'error', 'debug-no-session'], [
		failStep(DBG_STOP),
	], valueV('result', 'falsy', true)),

	tc('M-180', 'SCM stage nonexistent file', 'P2', ['integration', 'error', 'stage-missing'], [
		failStep(SCM_STAGE, { filePath: '/tmp/nonexistent_m180.ts' }),
	], valueV('result', 'falsy', true)),

	tc('M-181', 'Set font size to negative', 'P2', ['integration', 'error', 'bad-font-size'], [
		failStep(FONT_SIZE, { size: -5 }),
	], valueV('result', 'falsy', true)),

	tc('M-182', 'Create file at invalid path', 'P2', ['integration', 'error', 'bad-path'], [
		failStep(EXPLORE_CREATE_FILE, { path: '', content: 'bad' }),
	], valueV('result', 'falsy', true)),

	tc('M-183', 'Recover after error: open valid file', 'P0', ['integration', 'error', 'recovery'], [
		failStep(OPEN_FILE, { filePath: '/tmp/nonexistent_m183.ts' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m183-ok.ts' }),
		step(SET_CONTENT, { content: 'recovered' }),
		step(SAVE),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'contains', 'recovered')),

	tc('M-184', 'Recover after bad theme: set valid theme', 'P1', ['integration', 'error', 'theme-recovery'], [
		failStep(THEME_SET, { theme: 'Bad Theme' }),
		step(THEME_SET, { theme: 'Default Dark+' }),
		step(THEME_GET, {}, { capture: 't' }),
	], valueV('t', 'contains', 'Dark')),

	tc('M-185', 'Recover after terminal error: create new', 'P1', ['integration', 'error', 'terminal-recovery'], [
		failStep(TERM_SEND, { terminalId: 'bad', command: 'fail' }),
		step(TERM_CREATE, {}, { capture: 'tid' }),
		step(TERM_SEND, { command: 'echo recovered' }, { wait: 500 }),
		step(TERM_OUTPUT, {}, { capture: 'out' }),
	], valueV('out', 'contains', 'recovered')),
];

// ===========================================================================
// M-186 to M-200 : Performance (15 tests)
// ===========================================================================

const performance: TestCase[] = [
	tc('M-186', 'Open file under 2s', 'P0', ['integration', 'perf', 'open-speed'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m186.ts' }),
		step(GET_CONTENT, {}, { capture: 'c' }),
	], valueV('c', 'truthy', true), { timeoutMs: 2000 }),

	tc('M-187', 'Screenshot under 3s', 'P0', ['integration', 'perf', 'screenshot-speed'], [
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true), { timeoutMs: 3000 }),

	tc('M-188', 'Theme switch under 2s', 'P1', ['integration', 'perf', 'theme-speed'], [
		step(THEME_SET, { theme: 'Default Light+' }),
		step(THEME_GET, {}, { capture: 't' }),
	], valueV('t', 'truthy', true), { timeoutMs: 2000 }),

	tc('M-189', 'Terminal create under 2s', 'P1', ['integration', 'perf', 'terminal-speed'], [
		step(TERM_CREATE, {}, { capture: 'tid' }),
	], valueV('tid', 'truthy', true), { timeoutMs: 2000 }),

	tc('M-190', 'Settings get under 1s', 'P1', ['integration', 'perf', 'settings-speed'], [
		step(SETTINGS_GET, { key: 'editor.fontSize' }, { capture: 'v' }),
	], valueV('v', 'truthy', true), { timeoutMs: 1000 }),

	tc('M-191', 'Explorer tree under 3s', 'P1', ['integration', 'perf', 'tree-speed'], [
		step(EXPLORE_OPEN),
		step(EXPLORE_TREE, {}, { capture: 'tree' }),
	], valueV('tree', 'truthy', true), { timeoutMs: 3000 }),

	tc('M-192', 'OCR extraction under 5s', 'P1', ['integration', 'perf', 'ocr-speed'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m192.ts' }),
		step(SET_CONTENT, { content: 'PERF_OCR_TEST' }, { wait: 300 }),
		step(SCREENSHOT, {}),
		step(OCR, {}, { capture: 'text' }),
	], valueV('text', 'truthy', true), { timeoutMs: 5000 }),

	tc('M-193', 'File save under 1s', 'P0', ['integration', 'perf', 'save-speed'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m193.ts' }),
		step(SET_CONTENT, { content: 'perf save' }),
		step(SAVE),
	], stateV(GET_CONTENT, { success: true }), { timeoutMs: 1000 }),

	tc('M-194', 'SCM changes under 3s', 'P2', ['integration', 'perf', 'scm-speed'], [
		step(SCM_OPEN),
		step(SCM_CHANGES, {}, { capture: 'changes' }),
	], valueV('changes', 'truthy', true), { timeoutMs: 3000 }),

	tc('M-195', 'Debug open under 2s', 'P2', ['integration', 'perf', 'debug-speed'], [
		step(DBG_OPEN),
		step(DBG_STATE, {}, { capture: 'state' }),
	], valueV('state', 'truthy', true), { timeoutMs: 2000 }),

	tc('M-196', 'Settings set under 1s', 'P1', ['integration', 'perf', 'settings-set-speed'], [
		step(SETTINGS_SET, { key: 'editor.tabSize', value: 4 }),
		step(SETTINGS_GET, { key: 'editor.tabSize' }, { capture: 'v' }),
	], valueV('v', 'equals', 4), { timeoutMs: 1000 }),

	tc('M-197', 'Font size change under 1s', 'P2', ['integration', 'perf', 'font-speed'], [
		step(FONT_SIZE, { size: 14 }),
		step(SETTINGS_GET, { key: 'editor.fontSize' }, { capture: 'fs' }),
	], valueV('fs', 'equals', 14), { timeoutMs: 1000 }),

	tc('M-198', 'Close all editors under 2s', 'P2', ['integration', 'perf', 'close-speed'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m198-a.ts' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m198-b.ts' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m198-c.ts' }),
		step(CLOSE_ALL),
	], stateV(GET_CONTENT, { success: true }), { timeoutMs: 2000 }),

	tc('M-199', 'Full workflow under 10s', 'P0', ['integration', 'perf', 'e2e-speed'], [
		step(OPEN_FILE, { filePath: '/tmp/int-m199.ts' }),
		step(SET_CONTENT, { content: 'e2e perf' }),
		step(SAVE),
		step(TERM_CREATE, {}),
		step(TERM_SEND, { command: 'echo perf' }, { wait: 500 }),
		step(SCREENSHOT, {}, { capture: 'shot' }),
	], valueV('shot', 'truthy', true), { timeoutMs: 10000 }),

	tc('M-200', 'Complete integration gauntlet under 15s', 'P0', ['integration', 'perf', 'gauntlet'], [
		step(THEME_SET, { theme: 'Default Dark+' }),
		step(OPEN_FILE, { filePath: '/tmp/int-m200.ts' }),
		step(SET_CONTENT, { content: 'GAUNTLET_FINAL' }),
		step(SAVE),
		step(EXPLORE_OPEN),
		step(TERM_CREATE, {}),
		step(TERM_SEND, { command: 'echo gauntlet' }, { wait: 500 }),
		step(SCREENSHOT, {}, { capture: 'shot' }),
		step(OCR, {}, { capture: 'text' }),
		step(SCM_OPEN),
		step(SETTINGS_GET, { key: 'editor.fontSize' }, { capture: 'fs' }),
	], valueV('text', 'contains', 'GAUNTLET'), { timeoutMs: 15000 }),
];

// ===========================================================================
// Export
// ===========================================================================

export const integrationTests: TestCase[] = [
	...openEditSave,
	...projectChat,
	...themeScreenshotOcr,
	...termEditorDebug,
	...sidebarProject,
	...windowLayout,
	...chaosStress,
	...errorRecovery,
	...performance,
];
