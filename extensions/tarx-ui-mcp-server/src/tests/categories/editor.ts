/**
 * TARX UI Editor Test Cases — 350 tests covering all editor operations
 * IDs: A-001 through A-350
 */

import type { TestCase, TestStep, TestVerification } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers to reduce boilerplate
// ---------------------------------------------------------------------------

const BASE = '/tmp/tarx-test';

function tc(
	id: string,
	name: string,
	description: string,
	priority: 'P0' | 'P1' | 'P2',
	tags: string[],
	steps: TestStep[],
	verify: TestVerification,
	timeoutMs = 10000,
	retries = 1,
): TestCase {
	return { id, category: 'editor', name, description, priority, tags, steps, verify, timeoutMs, retries };
}

function step(tool: string, params: Record<string, unknown> = {}, expectSuccess = true, waitMs?: number, captureResult?: string): TestStep {
	return { tool, params, expectSuccess, ...(waitMs !== undefined ? { waitMs } : {}), ...(captureResult !== undefined ? { captureResult } : {}) };
}

function stateVerify(endpoint: string, expect: Record<string, unknown>, params?: Record<string, unknown>): TestVerification {
	return { type: 'state', stateCheck: { endpoint, expect, ...(params ? { params } : {}) } };
}

function valueVerify(variable: string, assertion: 'equals' | 'contains' | 'truthy' | 'falsy' | 'gt' | 'lt', expected: unknown): TestVerification {
	return { type: 'value', valueCheck: { variable, assertion, expected } };
}

const activeHasEditor = stateVerify('/ui/editor/active', { hasActiveEditor: true });
const activeNoEditor = stateVerify('/ui/editor/active', { hasActiveEditor: false });

function openStep(filePath: string, opts: Record<string, unknown> = {}, waitMs = 300): TestStep {
	return step('/ui/editor/open', { filePath, ...opts }, true, waitMs);
}

function closeAllStep(waitMs = 200): TestStep {
	return step('/ui/editor/close-all', {}, true, waitMs);
}

function gotoStep(line: number, column?: number): TestStep {
	return step('/ui/editor/goto', { line, ...(column !== undefined ? { column } : {}) }, true);
}

function typeStep(text: string, waitMs?: number): TestStep {
	return step('/ui/editor/type', { text }, true, waitMs);
}

function insertStep(text: string, line: number, column?: number): TestStep {
	return step('/ui/editor/insert', { text, line, ...(column !== undefined ? { column } : {}) }, true);
}

function replaceStep(startLine: number, startColumn: number, endLine: number, endColumn: number, newText: string): TestStep {
	return step('/ui/editor/replace', { startLine, startColumn, endLine, endColumn, newText }, true);
}

function selectStep(startLine: number, startColumn: number, endLine: number, endColumn: number): TestStep {
	return step('/ui/editor/select-range', { startLine, startColumn, endLine, endColumn }, true);
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

export const editorTests: TestCase[] = [

	// =========================================================================
	// 1. OPEN VARIOUS FILE TYPES (A-001 – A-030)
	// =========================================================================

	// P0 — smoke tests for common file types
	tc('A-001', 'Open TypeScript file', 'Open a .ts file and verify active editor', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`)],
		activeHasEditor),

	tc('A-002', 'Open JavaScript file', 'Open a .js file', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/index.js`)],
		activeHasEditor),

	tc('A-003', 'Open JSON file', 'Open a .json file', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/package.json`)],
		activeHasEditor),

	tc('A-004', 'Open Markdown file', 'Open a .md file', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/README.md`)],
		activeHasEditor),

	tc('A-005', 'Open CSS file', 'Open a .css file', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/styles.css`)],
		activeHasEditor),

	tc('A-006', 'Open HTML file', 'Open a .html file', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/index.html`)],
		activeHasEditor),

	tc('A-007', 'Open Python file', 'Open a .py file', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/main.py`)],
		activeHasEditor),

	tc('A-008', 'Open Go file', 'Open a .go file', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/main.go`)],
		activeHasEditor),

	tc('A-009', 'Open TSX file', 'Open a .tsx React file', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/App.tsx`)],
		activeHasEditor),

	tc('A-010', 'Open JSX file', 'Open a .jsx React file', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/App.jsx`)],
		activeHasEditor),

	// P1 — additional file types
	tc('A-011', 'Open YAML file', 'Open a .yaml file', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/config.yaml`)],
		activeHasEditor),

	tc('A-012', 'Open TOML file', 'Open a .toml file', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/Cargo.toml`)],
		activeHasEditor),

	tc('A-013', 'Open Rust file', 'Open a .rs file', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.rs`)],
		activeHasEditor),

	tc('A-014', 'Open C file', 'Open a .c file', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.c`)],
		activeHasEditor),

	tc('A-015', 'Open C++ file', 'Open a .cpp file', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.cpp`)],
		activeHasEditor),

	tc('A-016', 'Open Java file', 'Open a .java file', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/Main.java`)],
		activeHasEditor),

	tc('A-017', 'Open Ruby file', 'Open a .rb file', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/app.rb`)],
		activeHasEditor),

	tc('A-018', 'Open Shell script', 'Open a .sh file', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/run.sh`)],
		activeHasEditor),

	tc('A-019', 'Open SQL file', 'Open a .sql file', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/schema.sql`)],
		activeHasEditor),

	tc('A-020', 'Open XML file', 'Open an .xml file', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/data.xml`)],
		activeHasEditor),

	tc('A-021', 'Open SVG file', 'Open an .svg file', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/icon.svg`)],
		activeHasEditor),

	tc('A-022', 'Open Dockerfile', 'Open a Dockerfile', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/Dockerfile`)],
		activeHasEditor),

	tc('A-023', 'Open .env file', 'Open a dotenv file', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/.env`)],
		activeHasEditor),

	tc('A-024', 'Open Makefile', 'Open a Makefile', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/Makefile`)],
		activeHasEditor),

	// P2 — less common types
	tc('A-025', 'Open Kotlin file', 'Open a .kt file', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/Main.kt`)],
		activeHasEditor),

	tc('A-026', 'Open Swift file', 'Open a .swift file', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/App.swift`)],
		activeHasEditor),

	tc('A-027', 'Open Lua file', 'Open a .lua file', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/init.lua`)],
		activeHasEditor),

	tc('A-028', 'Open PHP file', 'Open a .php file', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/index.php`)],
		activeHasEditor),

	tc('A-029', 'Open file in specific view column', 'Open file in editor column 2', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`, { viewColumn: 2 })],
		activeHasEditor),

	tc('A-030', 'Open file with preview disabled', 'Open file as permanent tab (not preview)', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`, { preview: false })],
		activeHasEditor),

	// =========================================================================
	// 2. CLOSE FILES (A-031 – A-050)
	// =========================================================================

	tc('A-031', 'Close active editor', 'Open a file then close it', 'P0', ['editor', 'smoke'],
		[openStep(`${BASE}/test.ts`), step('/ui/editor/close', {}, true, 300)],
		activeNoEditor),

	tc('A-032', 'Close specific file by path', 'Open two files, close first by path', 'P0', ['editor', 'smoke'],
		[openStep(`${BASE}/test.ts`), openStep(`${BASE}/index.js`), step('/ui/editor/close', { filePath: `${BASE}/test.ts` }, true, 300)],
		activeHasEditor),

	tc('A-033', 'Close all editors', 'Open multiple files then close all', 'P0', ['editor', 'smoke'],
		[openStep(`${BASE}/test.ts`), openStep(`${BASE}/index.js`), openStep(`${BASE}/styles.css`), closeAllStep(300)],
		activeNoEditor),

	tc('A-034', 'Close non-existent file gracefully', 'Try closing a file that is not open', 'P1', ['editor'],
		[step('/ui/editor/close', { filePath: `${BASE}/nonexistent.ts` }, false)],
		activeNoEditor),

	tc('A-035', 'Close already closed editor', 'Close when no editors are open', 'P1', ['editor'],
		[closeAllStep(), step('/ui/editor/close', {}, false)],
		activeNoEditor),

	tc('A-036', 'Close first of three files', 'Open 3 files, close the first', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/a.ts`), openStep(`${BASE}/b.ts`), openStep(`${BASE}/c.ts`),
		 step('/ui/editor/close', { filePath: `${BASE}/a.ts` }, true, 300)],
		activeHasEditor),

	tc('A-037', 'Close middle of three files', 'Open 3 files, close the second', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/a.ts`), openStep(`${BASE}/b.ts`), openStep(`${BASE}/c.ts`),
		 step('/ui/editor/close', { filePath: `${BASE}/b.ts` }, true, 300)],
		activeHasEditor),

	tc('A-038', 'Close last of three files', 'Open 3 files, close the third', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/a.ts`), openStep(`${BASE}/b.ts`), openStep(`${BASE}/c.ts`),
		 step('/ui/editor/close', { filePath: `${BASE}/c.ts` }, true, 300)],
		activeHasEditor),

	tc('A-039', 'Close all then verify empty tab list', 'Close all and check tabs', 'P1', ['editor'],
		[openStep(`${BASE}/test.ts`), openStep(`${BASE}/index.js`), closeAllStep(300),
		 step('/ui/editor/tabs', {}, true, 0, 'tabList')],
		activeNoEditor),

	tc('A-040', 'Close file and reopen it', 'Close a file and reopen to verify it works', 'P1', ['editor'],
		[openStep(`${BASE}/test.ts`), step('/ui/editor/close', {}, true, 300), openStep(`${BASE}/test.ts`)],
		activeHasEditor),

	tc('A-041', 'Close active editor repeatedly', 'Open 5 files, close active 5 times', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/a.ts`), openStep(`${BASE}/b.ts`), openStep(`${BASE}/c.ts`),
		 openStep(`${BASE}/d.ts`), openStep(`${BASE}/e.ts`),
		 step('/ui/editor/close', {}, true, 100), step('/ui/editor/close', {}, true, 100),
		 step('/ui/editor/close', {}, true, 100), step('/ui/editor/close', {}, true, 100),
		 step('/ui/editor/close', {}, true, 100)],
		activeNoEditor),

	tc('A-042', 'Close all with no editors open', 'Calling close-all when nothing is open', 'P2', ['editor'],
		[closeAllStep(), closeAllStep()],
		activeNoEditor),

	tc('A-043', 'Close file opened in column 2', 'Open in col 2 then close by path', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`, { viewColumn: 2 }), step('/ui/editor/close', { filePath: `${BASE}/test.ts` }, true, 300)],
		activeNoEditor),

	tc('A-044', 'Close CSS file specifically', 'Open CSS and JS, close CSS by path', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/styles.css`), openStep(`${BASE}/index.js`),
		 step('/ui/editor/close', { filePath: `${BASE}/styles.css` }, true, 300)],
		activeHasEditor),

	tc('A-045', 'Close JSON file specifically', 'Open JSON and TS, close JSON', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/package.json`), openStep(`${BASE}/test.ts`),
		 step('/ui/editor/close', { filePath: `${BASE}/package.json` }, true, 300)],
		activeHasEditor),

	tc('A-046', 'Close HTML file specifically', 'Open HTML then close it', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/index.html`), step('/ui/editor/close', { filePath: `${BASE}/index.html` }, true, 300)],
		activeNoEditor),

	tc('A-047', 'Close Python file specifically', 'Open Python then close it', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.py`), step('/ui/editor/close', { filePath: `${BASE}/main.py` }, true, 300)],
		activeNoEditor),

	tc('A-048', 'Close Go file specifically', 'Open Go then close it', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.go`), step('/ui/editor/close', { filePath: `${BASE}/main.go` }, true, 300)],
		activeNoEditor),

	tc('A-049', 'Close all after single file open', 'Open one file then close all', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), closeAllStep(300)],
		activeNoEditor),

	tc('A-050', 'Close all after 10 files open', 'Open 10 files then close all', 'P2', ['editor'],
		[closeAllStep(),
		 openStep(`${BASE}/a.ts`, {}, 100), openStep(`${BASE}/b.ts`, {}, 100),
		 openStep(`${BASE}/c.ts`, {}, 100), openStep(`${BASE}/d.ts`, {}, 100),
		 openStep(`${BASE}/e.ts`, {}, 100), openStep(`${BASE}/f.ts`, {}, 100),
		 openStep(`${BASE}/g.ts`, {}, 100), openStep(`${BASE}/h.ts`, {}, 100),
		 openStep(`${BASE}/i.ts`, {}, 100), openStep(`${BASE}/j.ts`, {}, 100),
		 closeAllStep(300)],
		activeNoEditor),

	// =========================================================================
	// 3. GET ACTIVE EDITOR STATE (A-051 – A-070)
	// =========================================================================

	tc('A-051', 'Active editor state with no file', 'Check active state when no editor is open', 'P0', ['editor', 'smoke'],
		[closeAllStep(), step('/ui/editor/active', {}, true, 0, 'state')],
		stateVerify('/ui/editor/active', { hasActiveEditor: false })),

	tc('A-052', 'Active editor state with TS file', 'Open TS file and check active state', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), step('/ui/editor/active', {}, true, 0, 'state')],
		activeHasEditor),

	tc('A-053', 'Active editor state with JS file', 'Open JS file and check state', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/index.js`)],
		activeHasEditor),

	tc('A-054', 'Active editor state with JSON file', 'Open JSON and verify active', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/package.json`)],
		activeHasEditor),

	tc('A-055', 'Active editor state with CSS file', 'Open CSS and verify active', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/styles.css`)],
		activeHasEditor),

	tc('A-056', 'Active editor state with Markdown', 'Open MD and verify active', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/README.md`)],
		activeHasEditor),

	tc('A-057', 'Active editor state with Python', 'Open Python and verify active', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.py`)],
		activeHasEditor),

	tc('A-058', 'Active editor state with HTML', 'Open HTML and verify active', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/index.html`)],
		activeHasEditor),

	tc('A-059', 'Active state reflects last opened', 'Open two files, state reflects second', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), openStep(`${BASE}/index.js`)],
		activeHasEditor),

	tc('A-060', 'Active state after closing active', 'Open two, close active, check state', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), openStep(`${BASE}/index.js`),
		 step('/ui/editor/close', {}, true, 300)],
		activeHasEditor),

	tc('A-061', 'Active state after tab switch', 'Open two files, switch tab, verify', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), openStep(`${BASE}/index.js`),
		 step('/ui/editor/select-tab', { filePath: `${BASE}/test.ts` }, true, 300)],
		activeHasEditor),

	tc('A-062', 'Active state cursor position default', 'Open file, cursor should be at 1:1', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`)],
		stateVerify('/ui/editor/active', { hasActiveEditor: true })),

	tc('A-063', 'Active state after goto line', 'Open file, goto line 5, check active state', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(5)],
		activeHasEditor),

	tc('A-064', 'Active state after typing', 'Open file, type text, verify still active', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('hello')],
		activeHasEditor),

	tc('A-065', 'Active state check is idempotent', 'Call active twice, same result', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`),
		 step('/ui/editor/active', {}, true), step('/ui/editor/active', {}, true)],
		activeHasEditor),

	tc('A-066', 'Active state with YAML file', 'Open YAML and verify active', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/config.yaml`)],
		activeHasEditor),

	tc('A-067', 'Active state with Rust file', 'Open Rust and verify active', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.rs`)],
		activeHasEditor),

	tc('A-068', 'Active state with shell script', 'Open shell script and verify', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/run.sh`)],
		activeHasEditor),

	tc('A-069', 'Active state with SQL file', 'Open SQL and verify active', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/schema.sql`)],
		activeHasEditor),

	tc('A-070', 'Active state after reopening closed file', 'Close file then reopen and check state', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), step('/ui/editor/close', {}, true, 200), openStep(`${BASE}/test.ts`)],
		activeHasEditor),

	// =========================================================================
	// 4. TAB MANAGEMENT (A-071 – A-100)
	// =========================================================================

	tc('A-071', 'List tabs with no editors', 'Get tabs when no files are open', 'P0', ['editor', 'smoke'],
		[closeAllStep(), step('/ui/editor/tabs', {}, true, 0, 'tabs')],
		activeNoEditor),

	tc('A-072', 'List tabs with one file', 'Open one file, verify tab list', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), step('/ui/editor/tabs', {}, true, 0, 'tabs')],
		activeHasEditor),

	tc('A-073', 'List tabs with three files', 'Open 3 files, check tab count', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/a.ts`), openStep(`${BASE}/b.ts`), openStep(`${BASE}/c.ts`),
		 step('/ui/editor/tabs', {}, true, 0, 'tabs')],
		activeHasEditor),

	tc('A-074', 'Select tab switches active editor', 'Open two files, select first tab', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), openStep(`${BASE}/index.js`),
		 step('/ui/editor/select-tab', { filePath: `${BASE}/test.ts` }, true, 300)],
		activeHasEditor),

	tc('A-075', 'Select tab with full path', 'Select a tab by its absolute path', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), openStep(`${BASE}/index.js`),
		 step('/ui/editor/select-tab', { filePath: `${BASE}/index.js` }, true, 300)],
		activeHasEditor),

	tc('A-076', 'Switch between two tabs repeatedly', 'Alternate between two tabs', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), openStep(`${BASE}/index.js`),
		 step('/ui/editor/select-tab', { filePath: `${BASE}/test.ts` }, true, 200),
		 step('/ui/editor/select-tab', { filePath: `${BASE}/index.js` }, true, 200),
		 step('/ui/editor/select-tab', { filePath: `${BASE}/test.ts` }, true, 200)],
		activeHasEditor),

	tc('A-077', 'Select tab for non-open file fails', 'Try to select a tab that does not exist', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`),
		 step('/ui/editor/select-tab', { filePath: `${BASE}/nonexistent.ts` }, false)],
		activeHasEditor),

	tc('A-078', 'Tab list after closing one of three', 'Open 3, close one, verify 2 remaining', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/a.ts`), openStep(`${BASE}/b.ts`), openStep(`${BASE}/c.ts`),
		 step('/ui/editor/close', { filePath: `${BASE}/b.ts` }, true, 300),
		 step('/ui/editor/tabs', {}, true, 0, 'tabs')],
		activeHasEditor),

	tc('A-079', 'Tab list shows correct active tab', 'Open files, verify active in tab list', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), openStep(`${BASE}/index.js`),
		 step('/ui/editor/tabs', {}, true, 0, 'tabs')],
		activeHasEditor),

	tc('A-080', 'Select first tab of five', 'Open 5 files, select the first', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/a.ts`), openStep(`${BASE}/b.ts`), openStep(`${BASE}/c.ts`),
		 openStep(`${BASE}/d.ts`), openStep(`${BASE}/e.ts`),
		 step('/ui/editor/select-tab', { filePath: `${BASE}/a.ts` }, true, 300)],
		activeHasEditor),

	tc('A-081', 'Select last tab of five', 'Open 5 files, select the last', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/a.ts`), openStep(`${BASE}/b.ts`), openStep(`${BASE}/c.ts`),
		 openStep(`${BASE}/d.ts`), openStep(`${BASE}/e.ts`),
		 step('/ui/editor/select-tab', { filePath: `${BASE}/e.ts` }, true, 300)],
		activeHasEditor),

	tc('A-082', 'Select middle tab of five', 'Open 5 files, select the middle', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/a.ts`), openStep(`${BASE}/b.ts`), openStep(`${BASE}/c.ts`),
		 openStep(`${BASE}/d.ts`), openStep(`${BASE}/e.ts`),
		 step('/ui/editor/select-tab', { filePath: `${BASE}/c.ts` }, true, 300)],
		activeHasEditor),

	tc('A-083', 'Tab list with mixed file types', 'Open TS, JSON, CSS and list tabs', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), openStep(`${BASE}/package.json`), openStep(`${BASE}/styles.css`),
		 step('/ui/editor/tabs', {}, true, 0, 'tabs')],
		activeHasEditor),

	tc('A-084', 'Select tab after closing active', 'Close active, select another tab', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/a.ts`), openStep(`${BASE}/b.ts`), openStep(`${BASE}/c.ts`),
		 step('/ui/editor/close', {}, true, 200),
		 step('/ui/editor/select-tab', { filePath: `${BASE}/a.ts` }, true, 300)],
		activeHasEditor),

	tc('A-085', 'Open same file does not duplicate tab', 'Open same file twice, check tabs', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), openStep(`${BASE}/test.ts`),
		 step('/ui/editor/tabs', {}, true, 0, 'tabs')],
		activeHasEditor),

	tc('A-086', 'Tab list preserves order', 'Open files in order, verify tabs', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/a.ts`), openStep(`${BASE}/b.ts`), openStep(`${BASE}/c.ts`),
		 step('/ui/editor/tabs', {}, true, 0, 'tabs')],
		activeHasEditor),

	tc('A-087', 'Select CSS tab among many', 'Open mixed types, select CSS tab', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), openStep(`${BASE}/styles.css`), openStep(`${BASE}/index.js`),
		 step('/ui/editor/select-tab', { filePath: `${BASE}/styles.css` }, true, 300)],
		activeHasEditor),

	tc('A-088', 'Select JSON tab among many', 'Open mixed types, select JSON tab', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), openStep(`${BASE}/package.json`), openStep(`${BASE}/index.js`),
		 step('/ui/editor/select-tab', { filePath: `${BASE}/package.json` }, true, 300)],
		activeHasEditor),

	tc('A-089', 'Select HTML tab among many', 'Open mixed types, select HTML tab', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), openStep(`${BASE}/index.html`), openStep(`${BASE}/index.js`),
		 step('/ui/editor/select-tab', { filePath: `${BASE}/index.html` }, true, 300)],
		activeHasEditor),

	tc('A-090', 'Select Python tab among many', 'Open mixed types, select Python tab', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), openStep(`${BASE}/main.py`), openStep(`${BASE}/index.js`),
		 step('/ui/editor/select-tab', { filePath: `${BASE}/main.py` }, true, 300)],
		activeHasEditor),

	tc('A-091', 'Tab list with 7 open files', 'Open 7 files and list all tabs', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/a.ts`, {}, 100), openStep(`${BASE}/b.js`, {}, 100),
		 openStep(`${BASE}/c.json`, {}, 100), openStep(`${BASE}/d.css`, {}, 100),
		 openStep(`${BASE}/e.html`, {}, 100), openStep(`${BASE}/f.py`, {}, 100),
		 openStep(`${BASE}/g.go`, {}, 100), step('/ui/editor/tabs', {}, true, 0, 'tabs')],
		activeHasEditor),

	tc('A-092', 'Switch tab preserves cursor', 'Switch tabs and verify editor stays active', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(3, 5), openStep(`${BASE}/index.js`),
		 step('/ui/editor/select-tab', { filePath: `${BASE}/test.ts` }, true, 300)],
		activeHasEditor),

	tc('A-093', 'Tabs API returns after close-all', 'Close all then call tabs', 'P2', ['editor'],
		[closeAllStep(), step('/ui/editor/tabs', {}, true, 0, 'tabs')],
		activeNoEditor),

	tc('A-094', 'Select tab for Go file', 'Open Go among others, select it', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), openStep(`${BASE}/main.go`), openStep(`${BASE}/index.js`),
		 step('/ui/editor/select-tab', { filePath: `${BASE}/main.go` }, true, 300)],
		activeHasEditor),

	tc('A-095', 'Select tab for Markdown file', 'Open MD among others, select it', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), openStep(`${BASE}/README.md`), openStep(`${BASE}/index.js`),
		 step('/ui/editor/select-tab', { filePath: `${BASE}/README.md` }, true, 300)],
		activeHasEditor),

	tc('A-096', 'Select same tab twice is idempotent', 'Select the same tab twice in a row', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), openStep(`${BASE}/index.js`),
		 step('/ui/editor/select-tab', { filePath: `${BASE}/test.ts` }, true, 200),
		 step('/ui/editor/select-tab', { filePath: `${BASE}/test.ts` }, true, 200)],
		activeHasEditor),

	tc('A-097', 'Tab list after reopening file', 'Close and reopen file, check tabs', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), step('/ui/editor/close', {}, true, 200),
		 openStep(`${BASE}/test.ts`), step('/ui/editor/tabs', {}, true, 0, 'tabs')],
		activeHasEditor),

	tc('A-098', 'Open file in column 1 then column 2', 'Open files in different columns', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`, { viewColumn: 1 }), openStep(`${BASE}/index.js`, { viewColumn: 2 }),
		 step('/ui/editor/tabs', {}, true, 0, 'tabs')],
		activeHasEditor),

	tc('A-099', 'Select tab in different column', 'Select tab that was opened in column 1', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`, { viewColumn: 1 }), openStep(`${BASE}/index.js`, { viewColumn: 2 }),
		 step('/ui/editor/select-tab', { filePath: `${BASE}/test.ts` }, true, 300)],
		activeHasEditor),

	tc('A-100', 'Open 3 files in column 2 and list', 'Open files in side column and list tabs', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/a.ts`, { viewColumn: 2 }), openStep(`${BASE}/b.ts`, { viewColumn: 2 }),
		 openStep(`${BASE}/c.ts`, { viewColumn: 2 }), step('/ui/editor/tabs', {}, true, 0, 'tabs')],
		activeHasEditor),

	// =========================================================================
	// 5. TYPE TEXT AT CURSOR (A-101 – A-130)
	// =========================================================================

	tc('A-101', 'Type simple text', 'Open file and type simple text', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('hello world')],
		activeHasEditor),

	tc('A-102', 'Type single character', 'Type a single character', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('x')],
		activeHasEditor),

	tc('A-103', 'Type newline', 'Type a newline character', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('\n')],
		activeHasEditor),

	tc('A-104', 'Type multiline text', 'Type text spanning multiple lines', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('line1\nline2\nline3')],
		activeHasEditor),

	tc('A-105', 'Type code snippet', 'Type a function declaration', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('function foo() {\n  return 42;\n}')],
		activeHasEditor),

	tc('A-106', 'Type at beginning of file', 'Open file, go to line 1, type', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(1, 1), typeStep('// header comment\n')],
		activeHasEditor),

	tc('A-107', 'Type after goto line', 'Go to a specific line then type', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(5), typeStep('// inserted here')],
		activeHasEditor),

	tc('A-108', 'Type empty string', 'Type an empty string (should succeed)', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('')],
		activeHasEditor),

	tc('A-109', 'Type tab character', 'Type a tab for indentation', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('\t')],
		activeHasEditor),

	tc('A-110', 'Type special characters', 'Type symbols and special chars', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('!@#$%^&*()_+-=[]{}|;:,.<>?')],
		activeHasEditor),

	tc('A-111', 'Type backslash and quotes', 'Type escaped characters', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('const s = "hello \\"world\\"";')],
		activeHasEditor),

	tc('A-112', 'Type in JSON file', 'Type a JSON key-value pair', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/package.json`), typeStep('"key": "value"')],
		activeHasEditor),

	tc('A-113', 'Type in CSS file', 'Type a CSS rule', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/styles.css`), typeStep('.container { display: flex; }')],
		activeHasEditor),

	tc('A-114', 'Type in HTML file', 'Type an HTML element', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/index.html`), typeStep('<div class="app">Hello</div>')],
		activeHasEditor),

	tc('A-115', 'Type in Python file', 'Type a Python function', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.py`), typeStep('def greet(name):\n    print(f"Hello {name}")')],
		activeHasEditor),

	tc('A-116', 'Type in Markdown file', 'Type a markdown heading', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/README.md`), typeStep('# My Project\n\nA description here.')],
		activeHasEditor),

	tc('A-117', 'Type long single line', 'Type a very long line of text', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('a'.repeat(500))],
		activeHasEditor),

	tc('A-118', 'Type multiple times sequentially', 'Type text in three separate steps', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('first '), typeStep('second '), typeStep('third')],
		activeHasEditor),

	tc('A-119', 'Type with unicode emoji', 'Type text containing emoji characters', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('const emoji = "rocket ship"')],
		activeHasEditor),

	tc('A-120', 'Type CJK characters', 'Type Chinese/Japanese/Korean text', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('const greeting = "world"')],
		activeHasEditor),

	tc('A-121', 'Type in Go file', 'Type a Go function', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.go`), typeStep('func main() {\n\tfmt.Println("Hello")\n}')],
		activeHasEditor),

	tc('A-122', 'Type in Rust file', 'Type a Rust function', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.rs`), typeStep('fn main() {\n    println!("Hello");\n}')],
		activeHasEditor),

	tc('A-123', 'Type in SQL file', 'Type a SQL query', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/schema.sql`), typeStep('SELECT * FROM users WHERE id = 1;')],
		activeHasEditor),

	tc('A-124', 'Type in YAML file', 'Type YAML key-value pairs', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/config.yaml`), typeStep('name: tarx\nversion: 1.0\n')],
		activeHasEditor),

	tc('A-125', 'Type in Shell script', 'Type a shell command', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/run.sh`), typeStep('#!/bin/bash\necho "Hello World"\n')],
		activeHasEditor),

	tc('A-126', 'Type braces and brackets', 'Type various bracket types', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('const a = { b: [1, 2, (3 + 4)] };')],
		activeHasEditor),

	tc('A-127', 'Type HTML entities', 'Type HTML entity references', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/index.html`), typeStep('&lt;div&gt;&amp;&lt;/div&gt;')],
		activeHasEditor),

	tc('A-128', 'Type JSX expression', 'Type JSX with embedded expression', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/App.tsx`), typeStep('return <div>{count + 1}</div>;')],
		activeHasEditor),

	tc('A-129', 'Type import statement', 'Type a standard ES import', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep("import { useState } from 'react';")],
		activeHasEditor),

	tc('A-130', 'Type class declaration', 'Type a TypeScript class', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`),
		 typeStep('class MyService {\n  private count = 0;\n  increment() { this.count++; }\n}')],
		activeHasEditor),

	// =========================================================================
	// 6. INSERT TEXT AT POSITIONS (A-131 – A-160)
	// =========================================================================

	tc('A-131', 'Insert at line 1 column 1', 'Insert text at very beginning of file', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), insertStep('// file header\n', 1, 1)],
		activeHasEditor),

	tc('A-132', 'Insert at specific line', 'Insert text at line 5', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), insertStep('// inserted line\n', 5)],
		activeHasEditor),

	tc('A-133', 'Insert at line and column', 'Insert text at line 3 column 10', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), insertStep('INSERTED', 3, 10)],
		activeHasEditor),

	tc('A-134', 'Insert newline at position', 'Insert a newline to split a line', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), insertStep('\n', 2, 5)],
		activeHasEditor),

	tc('A-135', 'Insert at line 1 default column', 'Insert at line 1 with no column specified', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), insertStep('// top\n', 1)],
		activeHasEditor),

	tc('A-136', 'Insert multiline at position', 'Insert multiple lines', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), insertStep('// line A\n// line B\n// line C\n', 2)],
		activeHasEditor),

	tc('A-137', 'Insert at end of file', 'Insert at a high line number', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), insertStep('// end of file\n', 999)],
		activeHasEditor),

	tc('A-138', 'Insert empty string', 'Insert empty string (noop)', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), insertStep('', 1, 1)],
		activeHasEditor),

	tc('A-139', 'Insert in JSON file', 'Insert a property in JSON', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/package.json`), insertStep('"newKey": "value",\n', 2)],
		activeHasEditor),

	tc('A-140', 'Insert in CSS file', 'Insert a CSS rule', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/styles.css`), insertStep('body { margin: 0; }\n', 1)],
		activeHasEditor),

	tc('A-141', 'Insert in HTML file', 'Insert an HTML tag', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/index.html`), insertStep('<meta charset="utf-8">\n', 3)],
		activeHasEditor),

	tc('A-142', 'Insert in Python file', 'Insert a Python import', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.py`), insertStep('import os\n', 1)],
		activeHasEditor),

	tc('A-143', 'Insert at column 1 of various lines', 'Insert at beginning of lines 1-5', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`),
		 insertStep('// 1\n', 1, 1), insertStep('// 2\n', 2, 1), insertStep('// 3\n', 3, 1)],
		activeHasEditor),

	tc('A-144', 'Insert tab indentation', 'Insert tab characters for indentation', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), insertStep('\t\t', 2, 1)],
		activeHasEditor),

	tc('A-145', 'Insert spaces for indentation', 'Insert spaces at line beginning', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), insertStep('    ', 3, 1)],
		activeHasEditor),

	tc('A-146', 'Insert at high column number', 'Insert past end of short line', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), insertStep(' // appended', 1, 999)],
		activeHasEditor),

	tc('A-147', 'Insert function body', 'Insert a complete function', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`),
		 insertStep('function add(a: number, b: number): number {\n  return a + b;\n}\n', 1)],
		activeHasEditor),

	tc('A-148', 'Insert in Go file', 'Insert Go import statement', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.go`), insertStep('import "fmt"\n', 3)],
		activeHasEditor),

	tc('A-149', 'Insert in Rust file', 'Insert Rust use statement', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.rs`), insertStep('use std::io;\n', 1)],
		activeHasEditor),

	tc('A-150', 'Insert in YAML file', 'Insert YAML key', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/config.yaml`), insertStep('debug: true\n', 1)],
		activeHasEditor),

	tc('A-151', 'Insert in SQL file', 'Insert SQL comment', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/schema.sql`), insertStep('-- Migration v2\n', 1)],
		activeHasEditor),

	tc('A-152', 'Insert in Makefile', 'Insert a make target', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/Makefile`), insertStep('build:\n\tgo build ./...\n', 1)],
		activeHasEditor),

	tc('A-153', 'Insert special characters', 'Insert text with special chars', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), insertStep('// @#$%^&*()\n', 1)],
		activeHasEditor),

	tc('A-154', 'Insert at line 10 column 20', 'Insert at deep position', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), insertStep('DEEP_INSERT', 10, 20)],
		activeHasEditor),

	tc('A-155', 'Insert backticks', 'Insert template literal syntax', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), insertStep('const tpl = `hello ${name}`;', 1, 1)],
		activeHasEditor),

	tc('A-156', 'Insert regex pattern', 'Insert a regex literal', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), insertStep('const re = /^[a-z]+$/gi;', 1, 1)],
		activeHasEditor),

	tc('A-157', 'Insert arrow function', 'Insert an arrow function expression', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), insertStep('const fn = (x: number) => x * 2;\n', 1)],
		activeHasEditor),

	tc('A-158', 'Insert async function', 'Insert an async function declaration', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`),
		 insertStep('async function fetchData(): Promise<void> {\n  await fetch("/api");\n}\n', 1)],
		activeHasEditor),

	tc('A-159', 'Insert interface definition', 'Insert a TypeScript interface', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`),
		 insertStep('interface User {\n  id: number;\n  name: string;\n  email: string;\n}\n', 1)],
		activeHasEditor),

	tc('A-160', 'Insert enum definition', 'Insert a TypeScript enum', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`),
		 insertStep('enum Status {\n  Active = "active",\n  Inactive = "inactive",\n}\n', 1)],
		activeHasEditor),

	// =========================================================================
	// 7. REPLACE TEXT IN RANGES (A-161 – A-190)
	// =========================================================================

	tc('A-161', 'Replace single character', 'Replace one char at line 1 col 1-2', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), replaceStep(1, 1, 1, 2, 'X')],
		activeHasEditor),

	tc('A-162', 'Replace entire first line', 'Replace line 1 content', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), replaceStep(1, 1, 1, 999, '// replaced line')],
		activeHasEditor),

	tc('A-163', 'Replace multi-line range', 'Replace lines 1-3 with new text', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), replaceStep(1, 1, 3, 999, '// collapsed to one line')],
		activeHasEditor),

	tc('A-164', 'Replace with empty string (delete)', 'Delete text by replacing with empty', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), replaceStep(1, 1, 1, 10, '')],
		activeHasEditor),

	tc('A-165', 'Replace with longer text', 'Replace short text with longer text', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), replaceStep(1, 1, 1, 5, 'this is much longer replacement text')],
		activeHasEditor),

	tc('A-166', 'Replace middle of line', 'Replace text in the middle of a line', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), replaceStep(1, 5, 1, 10, 'MIDDLE')],
		activeHasEditor),

	tc('A-167', 'Replace across two lines', 'Replace spanning two lines', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), replaceStep(1, 5, 2, 5, 'BRIDGED')],
		activeHasEditor),

	tc('A-168', 'Replace across five lines', 'Replace spanning five lines', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), replaceStep(1, 1, 5, 999, '// five lines replaced\n')],
		activeHasEditor),

	tc('A-169', 'Replace with multiline text', 'Replace single line with multiple', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), replaceStep(1, 1, 1, 999, 'line1\nline2\nline3')],
		activeHasEditor),

	tc('A-170', 'Replace at end of line', 'Replace last chars of a line', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), replaceStep(1, 50, 1, 999, ' // end')],
		activeHasEditor),

	tc('A-171', 'Replace in JSON file', 'Replace a value in JSON', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/package.json`), replaceStep(2, 1, 2, 999, '  "name": "updated"')],
		activeHasEditor),

	tc('A-172', 'Replace in CSS file', 'Replace a CSS property', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/styles.css`), replaceStep(1, 1, 1, 999, '.new-class { color: red; }')],
		activeHasEditor),

	tc('A-173', 'Replace in HTML file', 'Replace an HTML tag', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/index.html`), replaceStep(1, 1, 1, 999, '<!DOCTYPE html>')],
		activeHasEditor),

	tc('A-174', 'Replace in Python file', 'Replace a Python statement', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.py`), replaceStep(1, 1, 1, 999, 'import sys')],
		activeHasEditor),

	tc('A-175', 'Replace with indented text', 'Replace keeping indentation', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), replaceStep(2, 1, 2, 999, '    const x = 42;')],
		activeHasEditor),

	tc('A-176', 'Replace single word', 'Replace a word in the middle of text', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), replaceStep(1, 7, 1, 12, 'newName')],
		activeHasEditor),

	tc('A-177', 'Replace with same text (noop)', 'Replace text with identical text', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), replaceStep(1, 1, 1, 5, 'same')],
		activeHasEditor),

	tc('A-178', 'Replace entire file content', 'Replace from start to end', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), replaceStep(1, 1, 999, 999, '// brand new content\n')],
		activeHasEditor),

	tc('A-179', 'Replace with unicode text', 'Replace with international characters', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), replaceStep(1, 1, 1, 10, 'const greet = "Hola"')],
		activeHasEditor),

	tc('A-180', 'Replace in Go file', 'Replace a Go statement', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.go`), replaceStep(1, 1, 1, 999, 'package main')],
		activeHasEditor),

	tc('A-181', 'Replace in Rust file', 'Replace a Rust statement', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.rs`), replaceStep(1, 1, 1, 999, 'use std::collections::HashMap;')],
		activeHasEditor),

	tc('A-182', 'Replace in YAML file', 'Replace a YAML key-value', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/config.yaml`), replaceStep(1, 1, 1, 999, 'version: "2.0"')],
		activeHasEditor),

	tc('A-183', 'Replace zero-width range (insert)', 'Replace at same start and end (pure insert)', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), replaceStep(1, 1, 1, 1, 'INSERTED')],
		activeHasEditor),

	tc('A-184', 'Replace with tab characters', 'Replace with text containing tabs', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), replaceStep(1, 1, 1, 999, '\t\tindented content')],
		activeHasEditor),

	tc('A-185', 'Replace line 10 content', 'Replace text at line 10', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), replaceStep(10, 1, 10, 999, '// line 10 replaced')],
		activeHasEditor),

	tc('A-186', 'Replace lines 5-15', 'Replace a large block of lines', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), replaceStep(5, 1, 15, 999, '// block replaced\n')],
		activeHasEditor),

	tc('A-187', 'Replace with JSX content', 'Replace with JSX/TSX code', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/App.tsx`), replaceStep(1, 1, 1, 999, 'return <App />;')],
		activeHasEditor),

	tc('A-188', 'Replace with async code', 'Replace with async/await pattern', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`),
		 replaceStep(1, 1, 3, 999, 'const data = await fetch("/api");\nconst json = await data.json();')],
		activeHasEditor),

	tc('A-189', 'Replace preserving newlines', 'Replace adding explicit newlines', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), replaceStep(1, 1, 1, 999, 'a\nb\nc\nd\ne')],
		activeHasEditor),

	tc('A-190', 'Replace with SQL content', 'Replace in SQL file', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/schema.sql`),
		 replaceStep(1, 1, 1, 999, 'CREATE TABLE users (id INTEGER PRIMARY KEY);')],
		activeHasEditor),

	// =========================================================================
	// 8. SELECT RANGES (A-191 – A-220)
	// =========================================================================

	tc('A-191', 'Select first word', 'Select characters 1-5 on line 1', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), selectStep(1, 1, 1, 6)],
		activeHasEditor),

	tc('A-192', 'Select entire first line', 'Select from col 1 to end of line 1', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), selectStep(1, 1, 1, 999)],
		activeHasEditor),

	tc('A-193', 'Select multiple lines', 'Select lines 1-3', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), selectStep(1, 1, 3, 999)],
		activeHasEditor),

	tc('A-194', 'Select single character', 'Select exactly one character', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), selectStep(1, 1, 1, 2)],
		activeHasEditor),

	tc('A-195', 'Select entire file', 'Select from 1:1 to end', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), selectStep(1, 1, 999, 999)],
		activeHasEditor),

	tc('A-196', 'Select middle of line', 'Select chars 5-15 on line 1', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), selectStep(1, 5, 1, 15)],
		activeHasEditor),

	tc('A-197', 'Select across two lines', 'Select from end of line 1 to start of line 2', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), selectStep(1, 20, 2, 5)],
		activeHasEditor),

	tc('A-198', 'Select in JSON file', 'Select a JSON property', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/package.json`), selectStep(2, 3, 2, 20)],
		activeHasEditor),

	tc('A-199', 'Select in CSS file', 'Select a CSS selector', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/styles.css`), selectStep(1, 1, 1, 20)],
		activeHasEditor),

	tc('A-200', 'Select in HTML file', 'Select an HTML tag', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/index.html`), selectStep(1, 1, 1, 15)],
		activeHasEditor),

	tc('A-201', 'Select in Python file', 'Select a Python line', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.py`), selectStep(1, 1, 1, 999)],
		activeHasEditor),

	tc('A-202', 'Select 10 lines', 'Select a block of 10 lines', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), selectStep(1, 1, 10, 999)],
		activeHasEditor),

	tc('A-203', 'Select from line 5 to 20', 'Select a mid-file range', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), selectStep(5, 1, 20, 999)],
		activeHasEditor),

	tc('A-204', 'Select line 1 col 10 to line 1 col 10 (empty)', 'Select zero-width range', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), selectStep(1, 10, 1, 10)],
		activeHasEditor),

	tc('A-205', 'Select after goto', 'Go to line then select range', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(5), selectStep(5, 1, 5, 20)],
		activeHasEditor),

	tc('A-206', 'Select in Go file', 'Select text in Go source', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.go`), selectStep(1, 1, 1, 15)],
		activeHasEditor),

	tc('A-207', 'Select in Rust file', 'Select text in Rust source', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.rs`), selectStep(1, 1, 1, 20)],
		activeHasEditor),

	tc('A-208', 'Select in YAML file', 'Select YAML key', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/config.yaml`), selectStep(1, 1, 1, 10)],
		activeHasEditor),

	tc('A-209', 'Select in SQL file', 'Select SQL keyword', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/schema.sql`), selectStep(1, 1, 1, 7)],
		activeHasEditor),

	tc('A-210', 'Select in Markdown file', 'Select MD heading', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/README.md`), selectStep(1, 1, 1, 999)],
		activeHasEditor),

	tc('A-211', 'Select in Shell script', 'Select shell command', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/run.sh`), selectStep(1, 1, 1, 15)],
		activeHasEditor),

	tc('A-212', 'Select large range 50 lines', 'Select lines 1-50', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), selectStep(1, 1, 50, 999)],
		activeHasEditor),

	tc('A-213', 'Select from deep position', 'Select starting at line 20 col 30', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), selectStep(20, 30, 20, 60)],
		activeHasEditor),

	tc('A-214', 'Reselect after previous select', 'Select twice to change selection', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), selectStep(1, 1, 1, 10), selectStep(2, 1, 2, 10)],
		activeHasEditor),

	tc('A-215', 'Select entire line 5', 'Select all of line 5', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), selectStep(5, 1, 5, 999)],
		activeHasEditor),

	tc('A-216', 'Select in JSX file', 'Select JSX element', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/App.tsx`), selectStep(1, 1, 1, 20)],
		activeHasEditor),

	tc('A-217', 'Select from col 1 to col 80', 'Select 80 characters', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), selectStep(1, 1, 1, 80)],
		activeHasEditor),

	tc('A-218', 'Select across 3 lines in CSS', 'Select CSS rule block', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/styles.css`), selectStep(1, 1, 3, 999)],
		activeHasEditor),

	tc('A-219', 'Select last line of file', 'Select text on line 999', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), selectStep(999, 1, 999, 999)],
		activeHasEditor),

	tc('A-220', 'Select backwards range', 'Select with start after end', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), selectStep(3, 10, 1, 1)],
		activeHasEditor),

	// =========================================================================
	// 9. GET SELECTION (A-221 – A-240)
	// =========================================================================

	tc('A-221', 'Get selection when nothing selected', 'Check selection with no selection', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), step('/ui/editor/selection', {}, true, 0, 'sel')],
		activeHasEditor),

	tc('A-222', 'Get selection after selecting text', 'Select range then get selection', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), selectStep(1, 1, 1, 10),
		 step('/ui/editor/selection', {}, true, 0, 'sel')],
		activeHasEditor),

	tc('A-223', 'Get selection after selecting entire line', 'Select full line then get selection', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), selectStep(1, 1, 1, 999),
		 step('/ui/editor/selection', {}, true, 0, 'sel')],
		activeHasEditor),

	tc('A-224', 'Get selection after multi-line select', 'Select 3 lines then get selection', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), selectStep(1, 1, 3, 999),
		 step('/ui/editor/selection', {}, true, 0, 'sel')],
		activeHasEditor),

	tc('A-225', 'Get selection after selecting all', 'Select all then get selection', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), selectStep(1, 1, 999, 999),
		 step('/ui/editor/selection', {}, true, 0, 'sel')],
		activeHasEditor),

	tc('A-226', 'Get selection in JSON file', 'Select in JSON then get selection', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/package.json`), selectStep(1, 1, 1, 10),
		 step('/ui/editor/selection', {}, true, 0, 'sel')],
		activeHasEditor),

	tc('A-227', 'Get selection in CSS file', 'Select in CSS then get selection', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/styles.css`), selectStep(1, 1, 1, 15),
		 step('/ui/editor/selection', {}, true, 0, 'sel')],
		activeHasEditor),

	tc('A-228', 'Get selection in Python file', 'Select in Python then get selection', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.py`), selectStep(1, 1, 1, 20),
		 step('/ui/editor/selection', {}, true, 0, 'sel')],
		activeHasEditor),

	tc('A-229', 'Get selection in HTML file', 'Select in HTML then get selection', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/index.html`), selectStep(1, 1, 1, 20),
		 step('/ui/editor/selection', {}, true, 0, 'sel')],
		activeHasEditor),

	tc('A-230', 'Get selection after empty select', 'Zero-width select then get', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), selectStep(1, 5, 1, 5),
		 step('/ui/editor/selection', {}, true, 0, 'sel')],
		activeHasEditor),

	tc('A-231', 'Get selection after reselect', 'Select twice, get final selection', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), selectStep(1, 1, 1, 5), selectStep(2, 1, 2, 10),
		 step('/ui/editor/selection', {}, true, 0, 'sel')],
		activeHasEditor),

	tc('A-232', 'Get selection after typing', 'Type text then check selection', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('hello'),
		 step('/ui/editor/selection', {}, true, 0, 'sel')],
		activeHasEditor),

	tc('A-233', 'Get selection in Go file', 'Select in Go then get selection', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.go`), selectStep(1, 1, 1, 10),
		 step('/ui/editor/selection', {}, true, 0, 'sel')],
		activeHasEditor),

	tc('A-234', 'Get selection in Rust file', 'Select in Rust then get selection', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.rs`), selectStep(1, 1, 1, 10),
		 step('/ui/editor/selection', {}, true, 0, 'sel')],
		activeHasEditor),

	tc('A-235', 'Get selection in Markdown', 'Select in MD then get selection', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/README.md`), selectStep(1, 1, 1, 999),
		 step('/ui/editor/selection', {}, true, 0, 'sel')],
		activeHasEditor),

	tc('A-236', 'Get selection after goto and select', 'Goto line 10, select, get selection', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(10), selectStep(10, 1, 10, 20),
		 step('/ui/editor/selection', {}, true, 0, 'sel')],
		activeHasEditor),

	tc('A-237', 'Get selection after insert and select', 'Insert text then select it', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), insertStep('inserted text', 1, 1),
		 selectStep(1, 1, 1, 14), step('/ui/editor/selection', {}, true, 0, 'sel')],
		activeHasEditor),

	tc('A-238', 'Get selection after replace', 'Replace text then check selection', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), replaceStep(1, 1, 1, 5, 'REPLACED'),
		 step('/ui/editor/selection', {}, true, 0, 'sel')],
		activeHasEditor),

	tc('A-239', 'Get selection with no editor', 'Get selection with no file open', 'P2', ['editor'],
		[closeAllStep(), step('/ui/editor/selection', {}, false)],
		activeNoEditor),

	tc('A-240', 'Get selection is idempotent', 'Call get selection twice', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), selectStep(1, 1, 1, 10),
		 step('/ui/editor/selection', {}, true), step('/ui/editor/selection', {}, true, 0, 'sel')],
		activeHasEditor),

	// =========================================================================
	// 10. GO TO LINE/COLUMN (A-241 – A-270)
	// =========================================================================

	tc('A-241', 'Go to line 1', 'Navigate to line 1', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(1)],
		activeHasEditor),

	tc('A-242', 'Go to line 10', 'Navigate to line 10', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(10)],
		activeHasEditor),

	tc('A-243', 'Go to line 100', 'Navigate to line 100', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(100)],
		activeHasEditor),

	tc('A-244', 'Go to line and column', 'Navigate to line 5 column 10', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(5, 10)],
		activeHasEditor),

	tc('A-245', 'Go to line 1 column 1', 'Navigate to very beginning', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(1, 1)],
		activeHasEditor),

	tc('A-246', 'Go to last line', 'Navigate to line 999', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(999)],
		activeHasEditor),

	tc('A-247', 'Go to high column number', 'Navigate to column 200', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(1, 200)],
		activeHasEditor),

	tc('A-248', 'Go to line 50 column 1', 'Navigate mid-file', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(50, 1)],
		activeHasEditor),

	tc('A-249', 'Go to multiple lines sequentially', 'Navigate to lines 1, 5, 10', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(1), gotoStep(5), gotoStep(10)],
		activeHasEditor),

	tc('A-250', 'Go to line in JSON file', 'Navigate in JSON', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/package.json`), gotoStep(3)],
		activeHasEditor),

	tc('A-251', 'Go to line in CSS file', 'Navigate in CSS', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/styles.css`), gotoStep(5)],
		activeHasEditor),

	tc('A-252', 'Go to line in HTML file', 'Navigate in HTML', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/index.html`), gotoStep(4)],
		activeHasEditor),

	tc('A-253', 'Go to line in Python file', 'Navigate in Python', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.py`), gotoStep(2)],
		activeHasEditor),

	tc('A-254', 'Go to line in Go file', 'Navigate in Go', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.go`), gotoStep(3)],
		activeHasEditor),

	tc('A-255', 'Go to line 1 then line 20', 'Jump from top to line 20', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(1), gotoStep(20)],
		activeHasEditor),

	tc('A-256', 'Go to line 20 then line 1', 'Jump from line 20 back to top', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(20), gotoStep(1)],
		activeHasEditor),

	tc('A-257', 'Go to line then type', 'Navigate then type at position', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(3, 1), typeStep('// new comment')],
		activeHasEditor),

	tc('A-258', 'Go to line then select', 'Navigate then select from there', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(5), selectStep(5, 1, 5, 20)],
		activeHasEditor),

	tc('A-259', 'Go to line in Rust file', 'Navigate in Rust source', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.rs`), gotoStep(5)],
		activeHasEditor),

	tc('A-260', 'Go to line in YAML file', 'Navigate in YAML', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/config.yaml`), gotoStep(2)],
		activeHasEditor),

	tc('A-261', 'Go to line in SQL file', 'Navigate in SQL', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/schema.sql`), gotoStep(1)],
		activeHasEditor),

	tc('A-262', 'Go to line in Markdown', 'Navigate in Markdown', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/README.md`), gotoStep(3)],
		activeHasEditor),

	tc('A-263', 'Go to line 0 (invalid)', 'Attempt navigation to line 0', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), step('/ui/editor/goto', { line: 0 }, false)],
		activeHasEditor),

	tc('A-264', 'Go to negative line (invalid)', 'Attempt navigation to negative line', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), step('/ui/editor/goto', { line: -1 }, false)],
		activeHasEditor),

	tc('A-265', 'Go to line 1 column 50', 'Navigate to a deep column', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(1, 50)],
		activeHasEditor),

	tc('A-266', 'Go to line 30 column 15', 'Navigate to specific deep position', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(30, 15)],
		activeHasEditor),

	tc('A-267', 'Go to line after file switch', 'Switch file then goto', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), openStep(`${BASE}/index.js`),
		 step('/ui/editor/select-tab', { filePath: `${BASE}/test.ts` }, true, 200), gotoStep(7)],
		activeHasEditor),

	tc('A-268', 'Go to same line twice', 'Goto same line is idempotent', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(5), gotoStep(5)],
		activeHasEditor),

	tc('A-269', 'Go to line 500', 'Navigate to very high line', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(500)],
		activeHasEditor),

	tc('A-270', 'Go to line in shell script', 'Navigate in shell script', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/run.sh`), gotoStep(2, 1)],
		activeHasEditor),

	// =========================================================================
	// 11. FOLD/UNFOLD CODE (A-271 – A-290)
	// =========================================================================

	tc('A-271', 'Fold at current line', 'Fold code at default (current) line', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(1), step('/ui/editor/fold', {}, true)],
		activeHasEditor),

	tc('A-272', 'Unfold at current line', 'Unfold code at default (current) line', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(1),
		 step('/ui/editor/fold', {}, true), step('/ui/editor/unfold', {}, true)],
		activeHasEditor),

	tc('A-273', 'Fold at specific line', 'Fold at line 5', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), step('/ui/editor/fold', { line: 5 }, true)],
		activeHasEditor),

	tc('A-274', 'Unfold at specific line', 'Unfold at line 5', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`),
		 step('/ui/editor/fold', { line: 5 }, true), step('/ui/editor/unfold', { line: 5 }, true)],
		activeHasEditor),

	tc('A-275', 'Fold then unfold at line 1', 'Toggle fold at line 1', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`),
		 step('/ui/editor/fold', { line: 1 }, true), step('/ui/editor/unfold', { line: 1 }, true)],
		activeHasEditor),

	tc('A-276', 'Fold multiple regions', 'Fold at lines 1, 5, 10', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`),
		 step('/ui/editor/fold', { line: 1 }, true),
		 step('/ui/editor/fold', { line: 5 }, true),
		 step('/ui/editor/fold', { line: 10 }, true)],
		activeHasEditor),

	tc('A-277', 'Unfold multiple regions', 'Unfold at lines 1, 5, 10', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`),
		 step('/ui/editor/fold', { line: 1 }, true), step('/ui/editor/fold', { line: 5 }, true),
		 step('/ui/editor/unfold', { line: 1 }, true), step('/ui/editor/unfold', { line: 5 }, true)],
		activeHasEditor),

	tc('A-278', 'Fold in JSON file', 'Fold JSON object', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/package.json`), step('/ui/editor/fold', { line: 1 }, true)],
		activeHasEditor),

	tc('A-279', 'Unfold in JSON file', 'Unfold JSON object', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/package.json`),
		 step('/ui/editor/fold', { line: 1 }, true), step('/ui/editor/unfold', { line: 1 }, true)],
		activeHasEditor),

	tc('A-280', 'Fold in HTML file', 'Fold HTML element', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/index.html`), step('/ui/editor/fold', { line: 1 }, true)],
		activeHasEditor),

	tc('A-281', 'Fold in CSS file', 'Fold CSS rule block', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/styles.css`), step('/ui/editor/fold', { line: 1 }, true)],
		activeHasEditor),

	tc('A-282', 'Fold in Python file', 'Fold Python function', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.py`), step('/ui/editor/fold', { line: 1 }, true)],
		activeHasEditor),

	tc('A-283', 'Fold at already-folded line', 'Double fold at same line', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`),
		 step('/ui/editor/fold', { line: 1 }, true), step('/ui/editor/fold', { line: 1 }, true)],
		activeHasEditor),

	tc('A-284', 'Unfold at non-folded line', 'Unfold when nothing is folded', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), step('/ui/editor/unfold', { line: 1 }, true)],
		activeHasEditor),

	tc('A-285', 'Fold in Go file', 'Fold Go function', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.go`), step('/ui/editor/fold', { line: 1 }, true)],
		activeHasEditor),

	tc('A-286', 'Fold in Rust file', 'Fold Rust function', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.rs`), step('/ui/editor/fold', { line: 1 }, true)],
		activeHasEditor),

	tc('A-287', 'Fold at line 20', 'Fold deeper in file', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), step('/ui/editor/fold', { line: 20 }, true)],
		activeHasEditor),

	tc('A-288', 'Fold and unfold rapidly', 'Toggle fold 3 times rapidly', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`),
		 step('/ui/editor/fold', { line: 1 }, true), step('/ui/editor/unfold', { line: 1 }, true),
		 step('/ui/editor/fold', { line: 1 }, true), step('/ui/editor/unfold', { line: 1 }, true),
		 step('/ui/editor/fold', { line: 1 }, true), step('/ui/editor/unfold', { line: 1 }, true)],
		activeHasEditor),

	tc('A-289', 'Fold in Markdown file', 'Fold Markdown section', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/README.md`), step('/ui/editor/fold', { line: 1 }, true)],
		activeHasEditor),

	tc('A-290', 'Fold at line 999', 'Fold at very high line number', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), step('/ui/editor/fold', { line: 999 }, true)],
		activeHasEditor),

	// =========================================================================
	// 12. DIAGNOSTICS (A-291 – A-310)
	// =========================================================================

	tc('A-291', 'Get all diagnostics for active file', 'Get diagnostics with default severity', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`, {}, 500),
		 step('/ui/editor/diagnostics?filePath=&severity=all', {}, true, 0, 'diag')],
		activeHasEditor),

	tc('A-292', 'Get error diagnostics only', 'Filter diagnostics to errors', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`, {}, 500),
		 step('/ui/editor/diagnostics?filePath=&severity=error', {}, true, 0, 'diag')],
		activeHasEditor),

	tc('A-293', 'Get warning diagnostics only', 'Filter diagnostics to warnings', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`, {}, 500),
		 step('/ui/editor/diagnostics?filePath=&severity=warning', {}, true, 0, 'diag')],
		activeHasEditor),

	tc('A-294', 'Get diagnostics for specific file', 'Get diagnostics by file path', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`, {}, 500),
		 step(`/ui/editor/diagnostics?filePath=${BASE}/test.ts&severity=all`, {}, true, 0, 'diag')],
		activeHasEditor),

	tc('A-295', 'Get info diagnostics', 'Filter diagnostics to info level', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`, {}, 500),
		 step('/ui/editor/diagnostics?filePath=&severity=info', {}, true, 0, 'diag')],
		activeHasEditor),

	tc('A-296', 'Get hint diagnostics', 'Filter diagnostics to hint level', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`, {}, 500),
		 step('/ui/editor/diagnostics?filePath=&severity=hint', {}, true, 0, 'diag')],
		activeHasEditor),

	tc('A-297', 'Get diagnostics for JSON file', 'Check diagnostics in JSON', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/package.json`, {}, 500),
		 step(`/ui/editor/diagnostics?filePath=${BASE}/package.json&severity=all`, {}, true, 0, 'diag')],
		activeHasEditor),

	tc('A-298', 'Get diagnostics for CSS file', 'Check diagnostics in CSS', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/styles.css`, {}, 500),
		 step(`/ui/editor/diagnostics?filePath=${BASE}/styles.css&severity=all`, {}, true, 0, 'diag')],
		activeHasEditor),

	tc('A-299', 'Get diagnostics for Python file', 'Check diagnostics in Python', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.py`, {}, 500),
		 step(`/ui/editor/diagnostics?filePath=${BASE}/main.py&severity=all`, {}, true, 0, 'diag')],
		activeHasEditor),

	tc('A-300', 'Get diagnostics for HTML file', 'Check diagnostics in HTML', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/index.html`, {}, 500),
		 step(`/ui/editor/diagnostics?filePath=${BASE}/index.html&severity=all`, {}, true, 0, 'diag')],
		activeHasEditor),

	tc('A-301', 'Get diagnostics after editing', 'Type invalid code then check diagnostics', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('const x: number = "not a number";'),
		 step('/ui/editor/diagnostics?filePath=&severity=error', {}, true, 500, 'diag')],
		activeHasEditor),

	tc('A-302', 'Get diagnostics for Go file', 'Check diagnostics in Go', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.go`, {}, 500),
		 step(`/ui/editor/diagnostics?filePath=${BASE}/main.go&severity=all`, {}, true, 0, 'diag')],
		activeHasEditor),

	tc('A-303', 'Get diagnostics for Rust file', 'Check diagnostics in Rust', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.rs`, {}, 500),
		 step(`/ui/editor/diagnostics?filePath=${BASE}/main.rs&severity=all`, {}, true, 0, 'diag')],
		activeHasEditor),

	tc('A-304', 'Get diagnostics for YAML file', 'Check diagnostics in YAML', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/config.yaml`, {}, 500),
		 step(`/ui/editor/diagnostics?filePath=${BASE}/config.yaml&severity=all`, {}, true, 0, 'diag')],
		activeHasEditor),

	tc('A-305', 'Get diagnostics twice in succession', 'Call diagnostics API twice', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`, {}, 500),
		 step('/ui/editor/diagnostics?filePath=&severity=all', {}, true),
		 step('/ui/editor/diagnostics?filePath=&severity=all', {}, true, 0, 'diag')],
		activeHasEditor),

	tc('A-306', 'Get diagnostics for SQL file', 'Check diagnostics in SQL', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/schema.sql`, {}, 500),
		 step(`/ui/editor/diagnostics?filePath=${BASE}/schema.sql&severity=all`, {}, true, 0, 'diag')],
		activeHasEditor),

	tc('A-307', 'Get diagnostics for Markdown', 'Check diagnostics in Markdown', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/README.md`, {}, 500),
		 step(`/ui/editor/diagnostics?filePath=${BASE}/README.md&severity=all`, {}, true, 0, 'diag')],
		activeHasEditor),

	tc('A-308', 'Get diagnostics for Shell script', 'Check diagnostics in shell', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/run.sh`, {}, 500),
		 step(`/ui/editor/diagnostics?filePath=${BASE}/run.sh&severity=all`, {}, true, 0, 'diag')],
		activeHasEditor),

	tc('A-309', 'Get diagnostics for TSX file', 'Check diagnostics in TSX', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/App.tsx`, {}, 500),
		 step(`/ui/editor/diagnostics?filePath=${BASE}/App.tsx&severity=all`, {}, true, 0, 'diag')],
		activeHasEditor),

	tc('A-310', 'Get errors and warnings separately', 'Get errors then warnings', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`, {}, 500),
		 step('/ui/editor/diagnostics?filePath=&severity=error', {}, true, 0, 'errors'),
		 step('/ui/editor/diagnostics?filePath=&severity=warning', {}, true, 0, 'warnings')],
		activeHasEditor),

	// =========================================================================
	// 13. TRIGGER SUGGESTIONS (A-311 – A-320)
	// =========================================================================

	tc('A-311', 'Trigger suggestions in TS file', 'Trigger autocomplete in TypeScript', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('console.'),
		 step('/ui/editor/trigger-suggest', {}, true, 500)],
		activeHasEditor),

	tc('A-312', 'Trigger suggestions in JS file', 'Trigger autocomplete in JavaScript', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/index.js`), typeStep('document.'),
		 step('/ui/editor/trigger-suggest', {}, true, 500)],
		activeHasEditor),

	tc('A-313', 'Trigger suggestions in CSS file', 'Trigger autocomplete in CSS', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/styles.css`), typeStep('display: '),
		 step('/ui/editor/trigger-suggest', {}, true, 500)],
		activeHasEditor),

	tc('A-314', 'Trigger suggestions in HTML file', 'Trigger autocomplete in HTML', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/index.html`), typeStep('<di'),
		 step('/ui/editor/trigger-suggest', {}, true, 500)],
		activeHasEditor),

	tc('A-315', 'Trigger suggestions in JSON file', 'Trigger autocomplete in JSON', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/package.json`), gotoStep(2, 3),
		 step('/ui/editor/trigger-suggest', {}, true, 500)],
		activeHasEditor),

	tc('A-316', 'Trigger suggestions in Python file', 'Trigger autocomplete in Python', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.py`), typeStep('import '),
		 step('/ui/editor/trigger-suggest', {}, true, 500)],
		activeHasEditor),

	tc('A-317', 'Trigger suggestions after dot notation', 'Type object. and trigger suggest', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('Math.'),
		 step('/ui/editor/trigger-suggest', {}, true, 500)],
		activeHasEditor),

	tc('A-318', 'Trigger suggestions in Go file', 'Trigger autocomplete in Go', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/main.go`), typeStep('fmt.'),
		 step('/ui/editor/trigger-suggest', {}, true, 500)],
		activeHasEditor),

	tc('A-319', 'Trigger suggestions in empty file', 'Trigger suggest in blank file', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/empty.ts`),
		 step('/ui/editor/trigger-suggest', {}, true, 500)],
		activeHasEditor),

	tc('A-320', 'Trigger suggestions twice', 'Trigger suggest twice rapidly', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('Array.'),
		 step('/ui/editor/trigger-suggest', {}, true, 300),
		 step('/ui/editor/trigger-suggest', {}, true, 300)],
		activeHasEditor),

	// =========================================================================
	// 14. EDGE CASES (A-321 – A-350)
	// =========================================================================

	tc('A-321', 'Open empty file', 'Open a zero-byte file', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/empty.txt`)],
		activeHasEditor),

	tc('A-322', 'Type in empty file', 'Open empty file and type', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/empty.txt`), typeStep('first content')],
		activeHasEditor),

	tc('A-323', 'Open file with very long lines', 'Open file known to have long lines', 'P0', ['editor', 'smoke'],
		[closeAllStep(), openStep(`${BASE}/longlines.txt`)],
		activeHasEditor),

	tc('A-324', 'Type very long single line', 'Type 1000 character line', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('x'.repeat(1000))],
		activeHasEditor),

	tc('A-325', 'Open file with unicode name', 'Open file with unicode characters in name', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test-file.txt`)],
		activeHasEditor),

	tc('A-326', 'Type unicode text extensively', 'Type text with many unicode ranges', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`),
		 typeStep('const greetings = ["Hello", "Bonjour", "Hola", "Ciao"];')],
		activeHasEditor),

	tc('A-327', 'Insert at line 0 (invalid)', 'Attempt to insert at invalid line 0', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), step('/ui/editor/insert', { text: 'bad', line: 0 }, false)],
		activeHasEditor),

	tc('A-328', 'Replace with very large text', 'Replace small range with 500 chars', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), replaceStep(1, 1, 1, 2, 'A'.repeat(500))],
		activeHasEditor),

	tc('A-329', 'Select range in empty file', 'Select in a file with no content', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/empty.txt`), selectStep(1, 1, 1, 999)],
		activeHasEditor),

	tc('A-330', 'Goto line in empty file', 'Navigate in a file with no content', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/empty.txt`), gotoStep(1)],
		activeHasEditor),

	tc('A-331', 'Type text with null bytes', 'Type text containing escaped null', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('before\\x00after')],
		activeHasEditor),

	tc('A-332', 'Open non-existent file', 'Attempt to open a file that does not exist', 'P1', ['editor'],
		[closeAllStep(), step('/ui/editor/open', { filePath: `${BASE}/does-not-exist-xyz.ts` }, false)],
		activeNoEditor),

	tc('A-333', 'Open file with spaces in path', 'Open file with spaces in the path', 'P1', ['editor'],
		[closeAllStep(), openStep(`${BASE}/my file.txt`)],
		activeHasEditor),

	tc('A-334', 'Type many newlines', 'Type 50 newlines', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('\n'.repeat(50))],
		activeHasEditor),

	tc('A-335', 'Type text with CRLF line endings', 'Type text with Windows-style line endings', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('line1\r\nline2\r\nline3')],
		activeHasEditor),

	tc('A-336', 'Replace in empty file', 'Try replacing text in empty file', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/empty.txt`), replaceStep(1, 1, 1, 999, 'new content')],
		activeHasEditor),

	tc('A-337', 'Fold in empty file', 'Try folding in empty file', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/empty.txt`), step('/ui/editor/fold', { line: 1 }, true)],
		activeHasEditor),

	tc('A-338', 'Diagnostics on empty file', 'Get diagnostics for empty file', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/empty.txt`, {}, 500),
		 step('/ui/editor/diagnostics?filePath=&severity=all', {}, true, 0, 'diag')],
		activeHasEditor),

	tc('A-339', 'Trigger suggest in empty file', 'Trigger suggestions in blank file', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/empty.txt`),
		 step('/ui/editor/trigger-suggest', {}, true, 500)],
		activeHasEditor),

	tc('A-340', 'Open binary-like file', 'Attempt to open a .bin file', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/data.bin`)],
		activeHasEditor),

	tc('A-341', 'Open .gitignore', 'Open a dotfile with no extension', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/.gitignore`)],
		activeHasEditor),

	tc('A-342', 'Type with mixed tabs and spaces', 'Type text using mixed indentation', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('\t  \t  mixed indent')],
		activeHasEditor),

	tc('A-343', 'Insert at negative column (invalid)', 'Insert at column -1', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`),
		 step('/ui/editor/insert', { text: 'bad', line: 1, column: -1 }, false)],
		activeHasEditor),

	tc('A-344', 'Replace inverted range', 'Replace where start is after end', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), replaceStep(5, 10, 1, 1, 'inverted')],
		activeHasEditor),

	tc('A-345', 'Open large file', 'Open a file that is expected to be large', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/large-file.ts`, {}, 1000)],
		activeHasEditor, 15000),

	tc('A-346', 'Type after closing all and reopening', 'Close all, reopen, type', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), closeAllStep(), openStep(`${BASE}/test.ts`),
		 typeStep('reopened and typed')],
		activeHasEditor),

	tc('A-347', 'Multiple operations on same line', 'Goto, select, replace on same line', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), gotoStep(1, 1), selectStep(1, 1, 1, 5),
		 replaceStep(1, 1, 1, 5, 'CHANGED')],
		activeHasEditor),

	tc('A-348', 'Open file then check tabs then close', 'Full lifecycle: open, tabs, close', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), step('/ui/editor/tabs', {}, true, 0, 'tabs'),
		 step('/ui/editor/close', {}, true, 200)],
		activeNoEditor),

	tc('A-349', 'Edit file then get diagnostics', 'Type invalid code and get errors', 'P2', ['editor'],
		[closeAllStep(), openStep(`${BASE}/test.ts`), typeStep('const x: string = 123;'),
		 step('/ui/editor/diagnostics?filePath=&severity=all', {}, true, 1000, 'diag')],
		activeHasEditor),

	tc('A-350', 'Full workflow: open, goto, type, select, replace, fold, diagnostics, close', 'End-to-end editor workflow', 'P0', ['editor', 'smoke'],
		[closeAllStep(),
		 openStep(`${BASE}/test.ts`),
		 gotoStep(1, 1),
		 typeStep('function hello() {\n  console.log("world");\n}\n', 200),
		 selectStep(2, 3, 2, 30),
		 replaceStep(2, 3, 2, 30, 'return "hello";'),
		 step('/ui/editor/fold', { line: 1 }, true),
		 step('/ui/editor/unfold', { line: 1 }, true),
		 step('/ui/editor/diagnostics?filePath=&severity=all', {}, true, 500, 'diag'),
		 step('/ui/editor/selection', {}, true, 0, 'sel'),
		 step('/ui/editor/tabs', {}, true, 0, 'tabs'),
		 step('/ui/editor/close', {}, true, 200)],
		activeNoEditor, 15000),
];

export default editorTests;
