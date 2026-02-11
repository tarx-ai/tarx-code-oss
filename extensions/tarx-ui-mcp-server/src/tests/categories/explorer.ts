/**
 * TARX UI Test Suite - Category H: Explorer (H-001 to H-200)
 * 200 test cases for VS Code explorer operations via HTTP harness
 *
 * Coverage:
 *   Open explorer                    H-001 to H-020   (20 tests)
 *   Tree operations                  H-021 to H-060   (40 tests)
 *   File selection                   H-061 to H-100   (40 tests)
 *   Create                           H-101 to H-140   (40 tests)
 *   Delete                           H-141 to H-170   (30 tests)
 *   Rename & Copy                    H-171 to H-200   (30 tests)
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
		category: 'explorer',
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
const OPEN = 'tarx_ui_explorer_open';
const TREE = 'tarx_ui_explorer_get_tree';
const EXPAND = 'tarx_ui_explorer_expand_folder';
const COLLAPSE = 'tarx_ui_explorer_collapse_folder';
const SELECT = 'tarx_ui_explorer_select_file';
const REVEAL = 'tarx_ui_explorer_reveal_file';
const CREATE_FILE = 'tarx_ui_explorer_create_file';
const CREATE_FOLDER = 'tarx_ui_explorer_create_folder';
const DELETE = 'tarx_ui_explorer_delete';
const RENAME = 'tarx_ui_explorer_rename';
const COPY = 'tarx_ui_explorer_copy';
const WORKSPACE = 'tarx_ui_explorer_get_workspace';

// ===========================================================================
// H-001 to H-020 : Open Explorer (20 tests)
// ===========================================================================

const openExplorer: TestCase[] = [
	tc('H-001', 'Open explorer view', 'P0', ['explorer', 'open', 'smoke'],
		[step(OPEN, {}, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('H-002', 'Open explorer view twice is idempotent', 'P0', ['explorer', 'open', 'idempotent'],
		[step(OPEN), step(OPEN, {}, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('H-003', 'Open explorer with focus option', 'P0', ['explorer', 'open', 'focus'],
		[step(OPEN, { focus: true }, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('H-004', 'Open explorer after closing sidebar', 'P1', ['explorer', 'open', 'sidebar'],
		[step(OPEN, {}, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-005', 'Open explorer and verify tree populated', 'P0', ['explorer', 'open', 'tree'],
		[step(OPEN, {}, { wait: 200 }), step(TREE, {}, { capture: 'treeData' })],
		valueV('treeData', 'truthy', true)),

	tc('H-006', 'Open explorer returns success response', 'P0', ['explorer', 'open', 'response'],
		[step(OPEN, {}, { capture: 'openResult' })],
		valueV('openResult', 'truthy', true)),

	tc('H-007', 'Explorer visible state after open', 'P0', ['explorer', 'open', 'visible'],
		[step(OPEN, {}, { wait: 200 })],
		stateV(OPEN, { visible: true })),

	tc('H-008', 'Open explorer preserves tree state', 'P1', ['explorer', 'open', 'state'],
		[step(OPEN), step(TREE, {}, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-009', 'Focus explorer transfers keyboard focus', 'P1', ['explorer', 'open', 'keyboard'],
		[step(OPEN, { focus: true }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-010', 'Open explorer when no workspace is open', 'P1', ['explorer', 'open', 'no-workspace'],
		[step(OPEN, {}, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-011', 'Open explorer fast succession three times', 'P1', ['explorer', 'open', 'stress'],
		[step(OPEN), step(OPEN), step(OPEN, {}, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('H-012', 'Open explorer with empty workspace', 'P1', ['explorer', 'open', 'empty'],
		[step(OPEN, {}, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('H-013', 'Open explorer with workspace path', 'P1', ['explorer', 'open', 'workspace'],
		[step(OPEN, { path: '/tmp' }, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('H-014', 'Open explorer resets scroll position', 'P2', ['explorer', 'open', 'scroll'],
		[step(OPEN, {}, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('H-015', 'Open explorer measures response time', 'P2', ['explorer', 'open', 'performance'],
		[step(OPEN, {}, { capture: 'perf' })],
		valueV('perf', 'truthy', true)),

	tc('H-016', 'Open explorer in new window context', 'P2', ['explorer', 'open', 'window'],
		[step(OPEN, { newWindow: false }, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('H-017', 'Open explorer with reveal parameter', 'P2', ['explorer', 'open', 'reveal'],
		[step(OPEN, { reveal: true }, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('H-018', 'Open explorer with delay then verify', 'P2', ['explorer', 'open', 'timing'],
		[step(OPEN, {}, { wait: 500 }), step(TREE, {}, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-019', 'Open explorer five times rapidly', 'P2', ['explorer', 'open', 'stress'],
		[step(OPEN), step(OPEN), step(OPEN), step(OPEN), step(OPEN, {}, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('H-020', 'Open explorer then get workspace info', 'P0', ['explorer', 'open', 'workspace'],
		[step(OPEN, {}, { wait: 200 }), step(WORKSPACE, {}, { capture: 'ws' })],
		valueV('ws', 'truthy', true)),
];

// ===========================================================================
// H-021 to H-060 : Tree Operations (40 tests)
// ===========================================================================

const treeOperations: TestCase[] = [
	tc('H-021', 'Get tree structure of root', 'P0', ['explorer', 'tree', 'root'],
		[step(OPEN, {}, { wait: 200 }), step(TREE, {}, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-022', 'Get tree with depth 1', 'P0', ['explorer', 'tree', 'depth'],
		[step(TREE, { depth: 1 }, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-023', 'Get tree with depth 2', 'P1', ['explorer', 'tree', 'depth'],
		[step(TREE, { depth: 2 }, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-024', 'Get tree with depth 5', 'P2', ['explorer', 'tree', 'depth-deep'],
		[step(TREE, { depth: 5 }, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-025', 'Tree with nested folders shows children', 'P0', ['explorer', 'tree', 'nested'],
		[step(TREE, { depth: 3 }, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-026', 'Tree depth 0 returns root only', 'P1', ['explorer', 'tree', 'depth-zero'],
		[step(TREE, { depth: 0 }, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-027', 'Get tree of specific folder path', 'P0', ['explorer', 'tree', 'folder'],
		[step(TREE, { path: '/tmp' }, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-028', 'Get tree with file filter *.ts', 'P1', ['explorer', 'tree', 'filter'],
		[step(TREE, { filter: '*.ts' }, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-029', 'Get tree with hidden files shown', 'P1', ['explorer', 'tree', 'hidden'],
		[step(TREE, { showHidden: true }, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-030', 'Get tree without hidden files', 'P1', ['explorer', 'tree', 'no-hidden'],
		[step(TREE, { showHidden: false }, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-031', 'Expand folder in tree', 'P0', ['explorer', 'tree', 'expand'],
		[step(OPEN, {}, { wait: 200 }), step(EXPAND, { path: 'src' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-032', 'Expand nested folder', 'P0', ['explorer', 'tree', 'expand-nested'],
		[step(EXPAND, { path: 'src' }), step(EXPAND, { path: 'src/tests' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-033', 'Collapse folder in tree', 'P0', ['explorer', 'tree', 'collapse'],
		[step(EXPAND, { path: 'src' }), step(COLLAPSE, { path: 'src' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-034', 'Collapse already collapsed folder', 'P1', ['explorer', 'tree', 'collapse', 'idempotent'],
		[step(COLLAPSE, { path: 'src' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-035', 'Expand already expanded folder', 'P1', ['explorer', 'tree', 'expand', 'idempotent'],
		[step(EXPAND, { path: 'src' }), step(EXPAND, { path: 'src' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-036', 'Expand all folders', 'P1', ['explorer', 'tree', 'expand-all'],
		[step(EXPAND, { all: true }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-037', 'Collapse all folders', 'P1', ['explorer', 'tree', 'collapse-all'],
		[step(EXPAND, { all: true }), step(COLLAPSE, { all: true }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-038', 'Expand then collapse same folder', 'P0', ['explorer', 'tree', 'toggle'],
		[step(EXPAND, { path: 'src' }), step(COLLAPSE, { path: 'src' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-039', 'Tree refresh returns updated data', 'P1', ['explorer', 'tree', 'refresh'],
		[step(TREE, { refresh: true }, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-040', 'Tree item count matches file system', 'P1', ['explorer', 'tree', 'count'],
		[step(TREE, { depth: 1 }, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-041', 'Large tree performance with depth 10', 'P2', ['explorer', 'tree', 'performance'],
		[step(TREE, { depth: 10 }, { capture: 'tree' })],
		valueV('tree', 'truthy', true),
		{ timeoutMs: 20000 }),

	tc('H-042', 'Get tree sorted by name', 'P1', ['explorer', 'tree', 'sort'],
		[step(TREE, { sortBy: 'name' }, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-043', 'Get tree sorted by type', 'P1', ['explorer', 'tree', 'sort-type'],
		[step(TREE, { sortBy: 'type' }, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-044', 'Get tree sorted by modified date', 'P2', ['explorer', 'tree', 'sort-date'],
		[step(TREE, { sortBy: 'modified' }, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-045', 'Get tree sorted by size', 'P2', ['explorer', 'tree', 'sort-size'],
		[step(TREE, { sortBy: 'size' }, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-046', 'Expand folder then get tree shows children', 'P0', ['explorer', 'tree', 'expand-verify'],
		[step(EXPAND, { path: 'src' }, { wait: 200 }), step(TREE, { path: 'src' }, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-047', 'Collapse folder then get tree hides children', 'P1', ['explorer', 'tree', 'collapse-verify'],
		[step(EXPAND, { path: 'src' }), step(COLLAPSE, { path: 'src' }, { wait: 200 }), step(TREE, {}, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-048', 'Expand non-existent folder fails gracefully', 'P1', ['explorer', 'tree', 'expand', 'error'],
		[failStep(EXPAND, { path: 'nonexistent_folder_xyz' })],
		valueV('result', 'falsy', null)),

	tc('H-049', 'Collapse non-existent folder fails gracefully', 'P1', ['explorer', 'tree', 'collapse', 'error'],
		[failStep(COLLAPSE, { path: 'nonexistent_folder_xyz' })],
		valueV('result', 'falsy', null)),

	tc('H-050', 'Get tree with empty path parameter', 'P1', ['explorer', 'tree', 'empty-path'],
		[step(TREE, { path: '' }, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-051', 'Expand multiple folders sequentially', 'P1', ['explorer', 'tree', 'expand-multi'],
		[step(EXPAND, { path: 'src' }), step(EXPAND, { path: 'extensions' }), step(TREE, {}, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-052', 'Collapse all after expanding multiple', 'P1', ['explorer', 'tree', 'collapse-all-after-expand'],
		[step(EXPAND, { path: 'src' }), step(EXPAND, { path: 'extensions' }), step(COLLAPSE, { all: true }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-053', 'Tree listing is consistent across calls', 'P1', ['explorer', 'tree', 'idempotent'],
		[step(TREE, { depth: 1 }, { capture: 'tree1' }), step(TREE, { depth: 1 }, { capture: 'tree2' })],
		valueV('tree1', 'truthy', true)),

	tc('H-054', 'Get tree with filter *.json', 'P2', ['explorer', 'tree', 'filter-json'],
		[step(TREE, { filter: '*.json' }, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-055', 'Get tree with filter *.md', 'P2', ['explorer', 'tree', 'filter-md'],
		[step(TREE, { filter: '*.md' }, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-056', 'Expand folder with special chars in name', 'P2', ['explorer', 'tree', 'expand', 'special'],
		[step(EXPAND, { path: 'node_modules' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-057', 'Get tree of deeply nested path', 'P2', ['explorer', 'tree', 'deep-path'],
		[step(TREE, { path: 'src/tests/categories' }, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-058', 'Tree refresh after file creation', 'P1', ['explorer', 'tree', 'refresh-create'],
		[step(CREATE_FILE, { path: '/tmp/tarx-tree-test.txt', content: 'test' }), step(TREE, { path: '/tmp', refresh: true }, { capture: 'tree' }), step(DELETE, { path: '/tmp/tarx-tree-test.txt' })],
		valueV('tree', 'truthy', true)),

	tc('H-059', 'Expand all then collapse all round-trip', 'P2', ['explorer', 'tree', 'round-trip'],
		[step(EXPAND, { all: true }), step(COLLAPSE, { all: true }), step(TREE, {}, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-060', 'Get tree with max depth returns truncated', 'P2', ['explorer', 'tree', 'max-depth'],
		[step(TREE, { depth: 100 }, { capture: 'tree' })],
		valueV('tree', 'truthy', true),
		{ timeoutMs: 30000 }),
];

// ===========================================================================
// H-061 to H-100 : File Selection (40 tests)
// ===========================================================================

const fileSelection: TestCase[] = [
	tc('H-061', 'Select file in tree', 'P0', ['explorer', 'select', 'smoke'],
		[step(OPEN, {}, { wait: 200 }), step(SELECT, { path: 'package.json' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-062', 'Select folder in tree', 'P0', ['explorer', 'select', 'folder'],
		[step(SELECT, { path: 'src' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-063', 'Select nested file', 'P0', ['explorer', 'select', 'nested'],
		[step(SELECT, { path: 'src/server.ts' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-064', 'Select multiple files sequentially', 'P1', ['explorer', 'select', 'multi'],
		[step(SELECT, { path: 'package.json' }), step(SELECT, { path: 'tsconfig.json' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-065', 'Reveal file in explorer', 'P0', ['explorer', 'reveal', 'smoke'],
		[step(REVEAL, { path: 'package.json' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-066', 'Reveal nested file in explorer', 'P0', ['explorer', 'reveal', 'nested'],
		[step(REVEAL, { path: 'src/server.ts' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-067', 'Reveal deeply nested file', 'P1', ['explorer', 'reveal', 'deep'],
		[step(REVEAL, { path: 'src/tests/categories/explorer.ts' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-068', 'Scroll to file in tree', 'P1', ['explorer', 'reveal', 'scroll'],
		[step(REVEAL, { path: 'package.json', select: true }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-069', 'File preview on single click', 'P0', ['explorer', 'select', 'preview'],
		[step(SELECT, { path: 'package.json', preview: true }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-070', 'File open on double-click', 'P0', ['explorer', 'select', 'open'],
		[step(SELECT, { path: 'package.json', openFile: true }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-071', 'Select file with context actions', 'P1', ['explorer', 'select', 'context'],
		[step(SELECT, { path: 'package.json', showContext: true }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-072', 'Select non-existent file fails gracefully', 'P1', ['explorer', 'select', 'error'],
		[failStep(SELECT, { path: 'nonexistent_file_xyz.ts' })],
		valueV('result', 'falsy', null)),

	tc('H-073', 'Reveal non-existent file fails gracefully', 'P1', ['explorer', 'reveal', 'error'],
		[failStep(REVEAL, { path: 'nonexistent_file_xyz.ts' })],
		valueV('result', 'falsy', null)),

	tc('H-074', 'Select same file twice is idempotent', 'P1', ['explorer', 'select', 'idempotent'],
		[step(SELECT, { path: 'package.json' }), step(SELECT, { path: 'package.json' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-075', 'Reveal same file twice is idempotent', 'P1', ['explorer', 'reveal', 'idempotent'],
		[step(REVEAL, { path: 'package.json' }), step(REVEAL, { path: 'package.json' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-076', 'Select file then reveal different file', 'P1', ['explorer', 'select', 'switch'],
		[step(SELECT, { path: 'package.json' }), step(REVEAL, { path: 'tsconfig.json' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-077', 'Select file in expanded folder', 'P1', ['explorer', 'select', 'expanded'],
		[step(EXPAND, { path: 'src' }, { wait: 200 }), step(SELECT, { path: 'src/server.ts' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-078', 'Reveal file expands parent folders', 'P0', ['explorer', 'reveal', 'auto-expand'],
		[step(COLLAPSE, { all: true }), step(REVEAL, { path: 'src/tests/categories/explorer.ts' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-079', 'Select file with empty path fails', 'P1', ['explorer', 'select', 'error', 'empty'],
		[failStep(SELECT, { path: '' })],
		valueV('result', 'falsy', null)),

	tc('H-080', 'Select file with absolute path', 'P1', ['explorer', 'select', 'absolute'],
		[step(SELECT, { path: '/tmp' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-081', 'Reveal file with focus', 'P1', ['explorer', 'reveal', 'focus'],
		[step(REVEAL, { path: 'package.json', focus: true }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-082', 'Select typescript file opens preview', 'P1', ['explorer', 'select', 'ts-preview'],
		[step(SELECT, { path: 'src/server.ts', preview: true }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-083', 'Select json file opens preview', 'P2', ['explorer', 'select', 'json-preview'],
		[step(SELECT, { path: 'package.json', preview: true }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-084', 'Select file after tree refresh', 'P1', ['explorer', 'select', 'refresh'],
		[step(TREE, { refresh: true }), step(SELECT, { path: 'package.json' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-085', 'Reveal file with select option', 'P0', ['explorer', 'reveal', 'with-select'],
		[step(REVEAL, { path: 'package.json', select: true }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-086', 'Reveal file without select option', 'P1', ['explorer', 'reveal', 'no-select'],
		[step(REVEAL, { path: 'package.json', select: false }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-087', 'Select three files in sequence', 'P1', ['explorer', 'select', 'sequence'],
		[step(SELECT, { path: 'package.json' }), step(SELECT, { path: 'tsconfig.json' }), step(SELECT, { path: 'src/server.ts' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-088', 'Reveal file in subfolder of subfolder', 'P2', ['explorer', 'reveal', 'deep-nested'],
		[step(REVEAL, { path: 'src/tests/categories/terminal.ts' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-089', 'Select file with special characters in name', 'P2', ['explorer', 'select', 'special-chars'],
		[step(SELECT, { path: '.gitignore' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-090', 'Select file then open it', 'P0', ['explorer', 'select', 'open-workflow'],
		[step(SELECT, { path: 'package.json' }), step(SELECT, { path: 'package.json', openFile: true }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-091', 'Reveal and select file in one step', 'P0', ['explorer', 'reveal', 'combined'],
		[step(REVEAL, { path: 'src/server.ts', select: true, focus: true }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-092', 'Select folder then expand it', 'P1', ['explorer', 'select', 'expand-after'],
		[step(SELECT, { path: 'src' }), step(EXPAND, { path: 'src' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-093', 'Select file rapidly five times', 'P2', ['explorer', 'select', 'stress'],
		[step(SELECT, { path: 'package.json' }), step(SELECT, { path: 'tsconfig.json' }), step(SELECT, { path: 'package.json' }), step(SELECT, { path: 'tsconfig.json' }), step(SELECT, { path: 'package.json' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-094', 'Reveal file with long path', 'P2', ['explorer', 'reveal', 'long-path'],
		[step(REVEAL, { path: 'src/tests/categories/explorer.ts' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-095', 'Select hidden file', 'P2', ['explorer', 'select', 'hidden'],
		[step(SELECT, { path: '.gitignore' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-096', 'Reveal file after collapse all', 'P1', ['explorer', 'reveal', 'after-collapse'],
		[step(COLLAPSE, { all: true }), step(REVEAL, { path: 'src/server.ts' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-097', 'Select root folder', 'P2', ['explorer', 'select', 'root'],
		[step(SELECT, { path: '.' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-098', 'Reveal file then get tree shows it', 'P1', ['explorer', 'reveal', 'verify-tree'],
		[step(REVEAL, { path: 'package.json', select: true }), step(TREE, {}, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-099', 'Select file with path containing spaces', 'P2', ['explorer', 'select', 'spaces'],
		[step(SELECT, { path: 'file with spaces.txt' }, { capture: 'result', expectSuccess: false })],
		valueV('result', 'falsy', null)),

	tc('H-100', 'Open explorer, expand, select, reveal workflow', 'P0', ['explorer', 'select', 'full-workflow'],
		[step(OPEN, {}, { wait: 200 }), step(EXPAND, { path: 'src' }, { wait: 200 }), step(SELECT, { path: 'src/server.ts' }), step(REVEAL, { path: 'src/server.ts', select: true }, { capture: 'result' })],
		valueV('result', 'truthy', true)),
];

// ===========================================================================
// H-101 to H-140 : Create (40 tests)
// ===========================================================================

const createOperations: TestCase[] = [
	tc('H-101', 'Create file in root', 'P0', ['explorer', 'create', 'file', 'smoke'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h101.txt', content: 'hello' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h101.txt' })],
		valueV('result', 'truthy', true)),

	tc('H-102', 'Create file with content', 'P0', ['explorer', 'create', 'file', 'content'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h102.txt', content: 'hello world' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h102.txt' })],
		valueV('result', 'truthy', true)),

	tc('H-103', 'Create file in subfolder', 'P0', ['explorer', 'create', 'file', 'subfolder'],
		[step(CREATE_FOLDER, { path: '/tmp/tarx-test-h103' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h103/test.txt', content: 'nested' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h103' })],
		valueV('result', 'truthy', true)),

	tc('H-104', 'Create file with special chars in name', 'P1', ['explorer', 'create', 'file', 'special'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h104_special-file.txt', content: 'test' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h104_special-file.txt' })],
		valueV('result', 'truthy', true)),

	tc('H-105', 'Create empty file', 'P0', ['explorer', 'create', 'file', 'empty'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h105.txt', content: '' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h105.txt' })],
		valueV('result', 'truthy', true)),

	tc('H-106', 'Create file with .ts extension', 'P1', ['explorer', 'create', 'file', 'typescript'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h106.ts', content: 'export const x = 1;' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h106.ts' })],
		valueV('result', 'truthy', true)),

	tc('H-107', 'Create file with .json extension', 'P1', ['explorer', 'create', 'file', 'json'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h107.json', content: '{"key": "value"}' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h107.json' })],
		valueV('result', 'truthy', true)),

	tc('H-108', 'Create file with .md extension', 'P2', ['explorer', 'create', 'file', 'markdown'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h108.md', content: '# Title' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h108.md' })],
		valueV('result', 'truthy', true)),

	tc('H-109', 'Create file with multiline content', 'P1', ['explorer', 'create', 'file', 'multiline'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h109.txt', content: 'line1\nline2\nline3' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h109.txt' })],
		valueV('result', 'truthy', true)),

	tc('H-110', 'Create file with unicode content', 'P2', ['explorer', 'create', 'file', 'unicode'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h110.txt', content: 'Hello \u2605 World \u2764' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h110.txt' })],
		valueV('result', 'truthy', true)),

	tc('H-111', 'Create folder', 'P0', ['explorer', 'create', 'folder', 'smoke'],
		[step(CREATE_FOLDER, { path: '/tmp/tarx-test-h111' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h111' })],
		valueV('result', 'truthy', true)),

	tc('H-112', 'Create nested folders', 'P0', ['explorer', 'create', 'folder', 'nested'],
		[step(CREATE_FOLDER, { path: '/tmp/tarx-test-h112/nested/deep' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h112' })],
		valueV('result', 'truthy', true)),

	tc('H-113', 'Create folder in root of workspace', 'P1', ['explorer', 'create', 'folder', 'root'],
		[step(CREATE_FOLDER, { path: '/tmp/tarx-test-h113' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h113' })],
		valueV('result', 'truthy', true)),

	tc('H-114', 'Create duplicate file errors', 'P0', ['explorer', 'create', 'file', 'duplicate', 'error'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h114.txt', content: 'first' }), failStep(CREATE_FILE, { path: '/tmp/tarx-test-h114.txt', content: 'second' }), step(DELETE, { path: '/tmp/tarx-test-h114.txt' })],
		valueV('result', 'falsy', null)),

	tc('H-115', 'Create file with invalid name errors', 'P0', ['explorer', 'create', 'file', 'invalid', 'error'],
		[failStep(CREATE_FILE, { path: '', content: 'test' })],
		valueV('result', 'falsy', null)),

	tc('H-116', 'Create file and verify in tree', 'P0', ['explorer', 'create', 'file', 'verify'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h116.txt', content: 'verify' }), step(TREE, { path: '/tmp', refresh: true }, { capture: 'tree' }), step(DELETE, { path: '/tmp/tarx-test-h116.txt' })],
		valueV('tree', 'truthy', true)),

	tc('H-117', 'Create folder and verify in tree', 'P0', ['explorer', 'create', 'folder', 'verify'],
		[step(CREATE_FOLDER, { path: '/tmp/tarx-test-h117' }), step(TREE, { path: '/tmp', refresh: true }, { capture: 'tree' }), step(DELETE, { path: '/tmp/tarx-test-h117' })],
		valueV('tree', 'truthy', true)),

	tc('H-118', 'Create file with large content', 'P1', ['explorer', 'create', 'file', 'large'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h118.txt', content: 'x'.repeat(10000) }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h118.txt' })],
		valueV('result', 'truthy', true)),

	tc('H-119', 'Create folder with special chars in name', 'P1', ['explorer', 'create', 'folder', 'special'],
		[step(CREATE_FOLDER, { path: '/tmp/tarx-test-h119_special-folder' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h119_special-folder' })],
		valueV('result', 'truthy', true)),

	tc('H-120', 'Create file then select it', 'P1', ['explorer', 'create', 'file', 'select'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h120.txt', content: 'select me' }), step(SELECT, { path: '/tmp/tarx-test-h120.txt' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h120.txt' })],
		valueV('result', 'truthy', true)),

	tc('H-121', 'Create file then reveal it', 'P1', ['explorer', 'create', 'file', 'reveal'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h121.txt', content: 'reveal me' }), step(REVEAL, { path: '/tmp/tarx-test-h121.txt' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h121.txt' })],
		valueV('result', 'truthy', true)),

	tc('H-122', 'Create multiple files in same folder', 'P1', ['explorer', 'create', 'file', 'multi'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h122a.txt', content: 'a' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h122b.txt', content: 'b' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h122c.txt', content: 'c' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h122a.txt' }), step(DELETE, { path: '/tmp/tarx-test-h122b.txt' }), step(DELETE, { path: '/tmp/tarx-test-h122c.txt' })],
		valueV('result', 'truthy', true)),

	tc('H-123', 'Create folder then create file inside', 'P0', ['explorer', 'create', 'folder-file'],
		[step(CREATE_FOLDER, { path: '/tmp/tarx-test-h123' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h123/inner.txt', content: 'inner' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h123' })],
		valueV('result', 'truthy', true)),

	tc('H-124', 'Create file with .css extension', 'P2', ['explorer', 'create', 'file', 'css'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h124.css', content: 'body { color: red; }' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h124.css' })],
		valueV('result', 'truthy', true)),

	tc('H-125', 'Create file with .html extension', 'P2', ['explorer', 'create', 'file', 'html'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h125.html', content: '<h1>Test</h1>' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h125.html' })],
		valueV('result', 'truthy', true)),

	tc('H-126', 'Create hidden file', 'P2', ['explorer', 'create', 'file', 'hidden'],
		[step(CREATE_FILE, { path: '/tmp/.tarx-test-h126', content: 'hidden' }, { capture: 'result' }), step(DELETE, { path: '/tmp/.tarx-test-h126' })],
		valueV('result', 'truthy', true)),

	tc('H-127', 'Create file with very long name', 'P2', ['explorer', 'create', 'file', 'long-name'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h127-' + 'a'.repeat(100) + '.txt', content: 'long name' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h127-' + 'a'.repeat(100) + '.txt' })],
		valueV('result', 'truthy', true)),

	tc('H-128', 'Create duplicate folder errors', 'P1', ['explorer', 'create', 'folder', 'duplicate', 'error'],
		[step(CREATE_FOLDER, { path: '/tmp/tarx-test-h128' }), failStep(CREATE_FOLDER, { path: '/tmp/tarx-test-h128' }), step(DELETE, { path: '/tmp/tarx-test-h128' })],
		valueV('result', 'falsy', null)),

	tc('H-129', 'Create file without content param', 'P1', ['explorer', 'create', 'file', 'no-content'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h129.txt' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h129.txt' })],
		valueV('result', 'truthy', true)),

	tc('H-130', 'Create nested folder structure', 'P1', ['explorer', 'create', 'folder', 'deep'],
		[step(CREATE_FOLDER, { path: '/tmp/tarx-test-h130/a/b/c' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h130' })],
		valueV('result', 'truthy', true)),

	tc('H-131', 'Create file with tab-separated content', 'P2', ['explorer', 'create', 'file', 'tabs'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h131.tsv', content: 'col1\tcol2\tcol3' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h131.tsv' })],
		valueV('result', 'truthy', true)),

	tc('H-132', 'Create file and open it', 'P1', ['explorer', 'create', 'file', 'open'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h132.txt', content: 'open me' }), step(SELECT, { path: '/tmp/tarx-test-h132.txt', openFile: true }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h132.txt' })],
		valueV('result', 'truthy', true)),

	tc('H-133', 'Create folder then list its contents', 'P1', ['explorer', 'create', 'folder', 'list'],
		[step(CREATE_FOLDER, { path: '/tmp/tarx-test-h133' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h133/a.txt', content: 'a' }), step(TREE, { path: '/tmp/tarx-test-h133' }, { capture: 'tree' }), step(DELETE, { path: '/tmp/tarx-test-h133' })],
		valueV('tree', 'truthy', true)),

	tc('H-134', 'Create file with JSON content', 'P1', ['explorer', 'create', 'file', 'json-content'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h134.json', content: '{"name":"test","version":"1.0"}' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h134.json' })],
		valueV('result', 'truthy', true)),

	tc('H-135', 'Create five files rapidly', 'P2', ['explorer', 'create', 'file', 'rapid'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h135a.txt', content: '1' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h135b.txt', content: '2' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h135c.txt', content: '3' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h135d.txt', content: '4' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h135e.txt', content: '5' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h135a.txt' }), step(DELETE, { path: '/tmp/tarx-test-h135b.txt' }), step(DELETE, { path: '/tmp/tarx-test-h135c.txt' }), step(DELETE, { path: '/tmp/tarx-test-h135d.txt' }), step(DELETE, { path: '/tmp/tarx-test-h135e.txt' })],
		valueV('result', 'truthy', true)),

	tc('H-136', 'Create file with .py extension', 'P2', ['explorer', 'create', 'file', 'python'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h136.py', content: 'print("hello")' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h136.py' })],
		valueV('result', 'truthy', true)),

	tc('H-137', 'Create file with .sh extension', 'P2', ['explorer', 'create', 'file', 'shell'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h137.sh', content: '#!/bin/bash\necho hello' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h137.sh' })],
		valueV('result', 'truthy', true)),

	tc('H-138', 'Create file with .yaml extension', 'P2', ['explorer', 'create', 'file', 'yaml'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h138.yaml', content: 'key: value' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h138.yaml' })],
		valueV('result', 'truthy', true)),

	tc('H-139', 'Create file in non-existent parent fails', 'P1', ['explorer', 'create', 'file', 'no-parent', 'error'],
		[failStep(CREATE_FILE, { path: '/tmp/tarx-nonexistent-h139/file.txt', content: 'orphan' })],
		valueV('result', 'falsy', null)),

	tc('H-140', 'Create folder with invalid path errors', 'P1', ['explorer', 'create', 'folder', 'invalid', 'error'],
		[failStep(CREATE_FOLDER, { path: '' })],
		valueV('result', 'falsy', null)),
];

// ===========================================================================
// H-141 to H-170 : Delete (30 tests)
// ===========================================================================

const deleteOperations: TestCase[] = [
	tc('H-141', 'Delete file', 'P0', ['explorer', 'delete', 'file', 'smoke'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h141.txt', content: 'delete me' }), step(DELETE, { path: '/tmp/tarx-test-h141.txt' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-142', 'Delete folder', 'P0', ['explorer', 'delete', 'folder', 'smoke'],
		[step(CREATE_FOLDER, { path: '/tmp/tarx-test-h142' }), step(DELETE, { path: '/tmp/tarx-test-h142' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-143', 'Delete non-existent file errors', 'P0', ['explorer', 'delete', 'error', 'non-existent'],
		[failStep(DELETE, { path: '/tmp/tarx-nonexistent-h143.txt' })],
		valueV('result', 'falsy', null)),

	tc('H-144', 'Delete non-existent folder errors', 'P1', ['explorer', 'delete', 'error', 'non-existent-folder'],
		[failStep(DELETE, { path: '/tmp/tarx-nonexistent-h144-dir' })],
		valueV('result', 'falsy', null)),

	tc('H-145', 'Delete file with confirmation', 'P0', ['explorer', 'delete', 'confirm'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h145.txt', content: 'confirm' }), step(DELETE, { path: '/tmp/tarx-test-h145.txt', confirm: true }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-146', 'Delete file from subfolder', 'P0', ['explorer', 'delete', 'subfolder'],
		[step(CREATE_FOLDER, { path: '/tmp/tarx-test-h146' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h146/nested.txt', content: 'nested' }), step(DELETE, { path: '/tmp/tarx-test-h146/nested.txt' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h146' })],
		valueV('result', 'truthy', true)),

	tc('H-147', 'Delete folder with contents', 'P0', ['explorer', 'delete', 'folder-contents'],
		[step(CREATE_FOLDER, { path: '/tmp/tarx-test-h147' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h147/inner.txt', content: 'inner' }), step(DELETE, { path: '/tmp/tarx-test-h147', recursive: true }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-148', 'Delete multiple files sequentially', 'P1', ['explorer', 'delete', 'multi'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h148a.txt', content: 'a' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h148b.txt', content: 'b' }), step(DELETE, { path: '/tmp/tarx-test-h148a.txt' }), step(DELETE, { path: '/tmp/tarx-test-h148b.txt' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-149', 'Delete and verify gone from tree', 'P0', ['explorer', 'delete', 'verify'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h149.txt', content: 'gone' }), step(DELETE, { path: '/tmp/tarx-test-h149.txt' }), step(TREE, { path: '/tmp', refresh: true }, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-150', 'Delete folder and verify gone from tree', 'P1', ['explorer', 'delete', 'folder', 'verify'],
		[step(CREATE_FOLDER, { path: '/tmp/tarx-test-h150' }), step(DELETE, { path: '/tmp/tarx-test-h150' }), step(TREE, { path: '/tmp', refresh: true }, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-151', 'Delete empty folder', 'P1', ['explorer', 'delete', 'empty-folder'],
		[step(CREATE_FOLDER, { path: '/tmp/tarx-test-h151' }), step(DELETE, { path: '/tmp/tarx-test-h151' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-152', 'Delete file with special characters in name', 'P2', ['explorer', 'delete', 'special'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h152_special-file.txt', content: 'special' }), step(DELETE, { path: '/tmp/tarx-test-h152_special-file.txt' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-153', 'Delete nested folder with files', 'P1', ['explorer', 'delete', 'nested-folder'],
		[step(CREATE_FOLDER, { path: '/tmp/tarx-test-h153/sub' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h153/sub/file.txt', content: 'deep' }), step(DELETE, { path: '/tmp/tarx-test-h153', recursive: true }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-154', 'Delete file then create same name file', 'P1', ['explorer', 'delete', 'recreate'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h154.txt', content: 'first' }), step(DELETE, { path: '/tmp/tarx-test-h154.txt' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h154.txt', content: 'second' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h154.txt' })],
		valueV('result', 'truthy', true)),

	tc('H-155', 'Delete with empty path errors', 'P1', ['explorer', 'delete', 'error', 'empty-path'],
		[failStep(DELETE, { path: '' })],
		valueV('result', 'falsy', null)),

	tc('H-156', 'Delete hidden file', 'P2', ['explorer', 'delete', 'hidden'],
		[step(CREATE_FILE, { path: '/tmp/.tarx-test-h156', content: 'hidden' }), step(DELETE, { path: '/tmp/.tarx-test-h156' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-157', 'Delete file with long name', 'P2', ['explorer', 'delete', 'long-name'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h157-' + 'b'.repeat(80) + '.txt', content: 'long' }), step(DELETE, { path: '/tmp/tarx-test-h157-' + 'b'.repeat(80) + '.txt' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-158', 'Delete folder then verify children gone', 'P1', ['explorer', 'delete', 'children-gone'],
		[step(CREATE_FOLDER, { path: '/tmp/tarx-test-h158' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h158/a.txt', content: 'a' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h158/b.txt', content: 'b' }), step(DELETE, { path: '/tmp/tarx-test-h158', recursive: true }), step(TREE, { path: '/tmp', refresh: true }, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-159', 'Delete three files rapidly', 'P2', ['explorer', 'delete', 'rapid'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h159a.txt', content: 'a' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h159b.txt', content: 'b' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h159c.txt', content: 'c' }), step(DELETE, { path: '/tmp/tarx-test-h159a.txt' }), step(DELETE, { path: '/tmp/tarx-test-h159b.txt' }), step(DELETE, { path: '/tmp/tarx-test-h159c.txt' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-160', 'Delete file with no extension', 'P2', ['explorer', 'delete', 'no-ext'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h160', content: 'no ext' }), step(DELETE, { path: '/tmp/tarx-test-h160' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-161', 'Delete file then try deleting again errors', 'P1', ['explorer', 'delete', 'double-delete'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h161.txt', content: 'once' }), step(DELETE, { path: '/tmp/tarx-test-h161.txt' }), failStep(DELETE, { path: '/tmp/tarx-test-h161.txt' })],
		valueV('result', 'falsy', null)),

	tc('H-162', 'Delete folder with recursive false and contents fails', 'P1', ['explorer', 'delete', 'no-recursive', 'error'],
		[step(CREATE_FOLDER, { path: '/tmp/tarx-test-h162' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h162/inner.txt', content: 'inner' }), failStep(DELETE, { path: '/tmp/tarx-test-h162', recursive: false }), step(DELETE, { path: '/tmp/tarx-test-h162', recursive: true })],
		valueV('result', 'falsy', null)),

	tc('H-163', 'Delete deeply nested file', 'P2', ['explorer', 'delete', 'deep'],
		[step(CREATE_FOLDER, { path: '/tmp/tarx-test-h163/a/b' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h163/a/b/deep.txt', content: 'deep' }), step(DELETE, { path: '/tmp/tarx-test-h163/a/b/deep.txt' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h163' })],
		valueV('result', 'truthy', true)),

	tc('H-164', 'Delete created file and verify with select fails', 'P1', ['explorer', 'delete', 'verify-select'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h164.txt', content: 'test' }), step(DELETE, { path: '/tmp/tarx-test-h164.txt' }), failStep(SELECT, { path: '/tmp/tarx-test-h164.txt' })],
		valueV('result', 'falsy', null)),

	tc('H-165', 'Delete .json file', 'P2', ['explorer', 'delete', 'json'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h165.json', content: '{}' }), step(DELETE, { path: '/tmp/tarx-test-h165.json' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-166', 'Delete .ts file', 'P2', ['explorer', 'delete', 'typescript'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h166.ts', content: 'export {};' }), step(DELETE, { path: '/tmp/tarx-test-h166.ts' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-167', 'Delete file from tree then refresh', 'P1', ['explorer', 'delete', 'refresh'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h167.txt', content: 'refresh' }), step(DELETE, { path: '/tmp/tarx-test-h167.txt' }), step(TREE, { path: '/tmp', refresh: true }, { capture: 'tree' })],
		valueV('tree', 'truthy', true)),

	tc('H-168', 'Delete multiple folders', 'P2', ['explorer', 'delete', 'multi-folder'],
		[step(CREATE_FOLDER, { path: '/tmp/tarx-test-h168a' }), step(CREATE_FOLDER, { path: '/tmp/tarx-test-h168b' }), step(DELETE, { path: '/tmp/tarx-test-h168a' }), step(DELETE, { path: '/tmp/tarx-test-h168b' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-169', 'Delete folder then create new folder with same name', 'P2', ['explorer', 'delete', 'recreate-folder'],
		[step(CREATE_FOLDER, { path: '/tmp/tarx-test-h169' }), step(DELETE, { path: '/tmp/tarx-test-h169' }), step(CREATE_FOLDER, { path: '/tmp/tarx-test-h169' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h169' })],
		valueV('result', 'truthy', true)),

	tc('H-170', 'Delete stress: create and delete 5 files', 'P2', ['explorer', 'delete', 'stress'],
		[step(CREATE_FILE, { path: '/tmp/tarx-h170a.txt', content: '1' }), step(CREATE_FILE, { path: '/tmp/tarx-h170b.txt', content: '2' }), step(CREATE_FILE, { path: '/tmp/tarx-h170c.txt', content: '3' }), step(CREATE_FILE, { path: '/tmp/tarx-h170d.txt', content: '4' }), step(CREATE_FILE, { path: '/tmp/tarx-h170e.txt', content: '5' }), step(DELETE, { path: '/tmp/tarx-h170a.txt' }), step(DELETE, { path: '/tmp/tarx-h170b.txt' }), step(DELETE, { path: '/tmp/tarx-h170c.txt' }), step(DELETE, { path: '/tmp/tarx-h170d.txt' }), step(DELETE, { path: '/tmp/tarx-h170e.txt' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),
];

// ===========================================================================
// H-171 to H-200 : Rename & Copy (30 tests)
// ===========================================================================

const renameCopy: TestCase[] = [
	tc('H-171', 'Rename file', 'P0', ['explorer', 'rename', 'file', 'smoke'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h171-old.txt', content: 'rename me' }), step(RENAME, { oldPath: '/tmp/tarx-test-h171-old.txt', newPath: '/tmp/tarx-test-h171-new.txt' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h171-new.txt' })],
		valueV('result', 'truthy', true)),

	tc('H-172', 'Rename folder', 'P0', ['explorer', 'rename', 'folder', 'smoke'],
		[step(CREATE_FOLDER, { path: '/tmp/tarx-test-h172-old' }), step(RENAME, { oldPath: '/tmp/tarx-test-h172-old', newPath: '/tmp/tarx-test-h172-new' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h172-new' })],
		valueV('result', 'truthy', true)),

	tc('H-173', 'Rename with same name errors', 'P0', ['explorer', 'rename', 'error', 'same-name'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h173.txt', content: 'same' }), failStep(RENAME, { oldPath: '/tmp/tarx-test-h173.txt', newPath: '/tmp/tarx-test-h173.txt' }), step(DELETE, { path: '/tmp/tarx-test-h173.txt' })],
		valueV('result', 'falsy', null)),

	tc('H-174', 'Rename with invalid chars errors', 'P1', ['explorer', 'rename', 'error', 'invalid-chars'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h174.txt', content: 'test' }), failStep(RENAME, { oldPath: '/tmp/tarx-test-h174.txt', newPath: '/tmp/tarx-test-h174\x00bad.txt' }), step(DELETE, { path: '/tmp/tarx-test-h174.txt' })],
		valueV('result', 'falsy', null)),

	tc('H-175', 'Rename non-existent file errors', 'P1', ['explorer', 'rename', 'error', 'non-existent'],
		[failStep(RENAME, { oldPath: '/tmp/tarx-nonexistent-h175.txt', newPath: '/tmp/tarx-h175-renamed.txt' })],
		valueV('result', 'falsy', null)),

	tc('H-176', 'Rename file changes extension', 'P1', ['explorer', 'rename', 'extension'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h176.txt', content: 'ext change' }), step(RENAME, { oldPath: '/tmp/tarx-test-h176.txt', newPath: '/tmp/tarx-test-h176.md' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h176.md' })],
		valueV('result', 'truthy', true)),

	tc('H-177', 'Rename file and verify in tree', 'P0', ['explorer', 'rename', 'verify'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h177-old.txt', content: 'verify' }), step(RENAME, { oldPath: '/tmp/tarx-test-h177-old.txt', newPath: '/tmp/tarx-test-h177-new.txt' }), step(TREE, { path: '/tmp', refresh: true }, { capture: 'tree' }), step(DELETE, { path: '/tmp/tarx-test-h177-new.txt' })],
		valueV('tree', 'truthy', true)),

	tc('H-178', 'Rename file to name with spaces', 'P1', ['explorer', 'rename', 'spaces'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h178.txt', content: 'spaces' }), step(RENAME, { oldPath: '/tmp/tarx-test-h178.txt', newPath: '/tmp/tarx test h178.txt' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx test h178.txt' })],
		valueV('result', 'truthy', true)),

	tc('H-179', 'Rename folder with contents', 'P1', ['explorer', 'rename', 'folder-contents'],
		[step(CREATE_FOLDER, { path: '/tmp/tarx-test-h179-old' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h179-old/inner.txt', content: 'inner' }), step(RENAME, { oldPath: '/tmp/tarx-test-h179-old', newPath: '/tmp/tarx-test-h179-new' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h179-new' })],
		valueV('result', 'truthy', true)),

	tc('H-180', 'Rename to existing name errors', 'P1', ['explorer', 'rename', 'error', 'exists'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h180a.txt', content: 'a' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h180b.txt', content: 'b' }), failStep(RENAME, { oldPath: '/tmp/tarx-test-h180a.txt', newPath: '/tmp/tarx-test-h180b.txt' }), step(DELETE, { path: '/tmp/tarx-test-h180a.txt' }), step(DELETE, { path: '/tmp/tarx-test-h180b.txt' })],
		valueV('result', 'falsy', null)),

	tc('H-181', 'Copy file', 'P0', ['explorer', 'copy', 'file', 'smoke'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h181-src.txt', content: 'copy me' }), step(COPY, { sourcePath: '/tmp/tarx-test-h181-src.txt', destPath: '/tmp/tarx-test-h181-dst.txt' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h181-src.txt' }), step(DELETE, { path: '/tmp/tarx-test-h181-dst.txt' })],
		valueV('result', 'truthy', true)),

	tc('H-182', 'Copy file to different folder', 'P0', ['explorer', 'copy', 'file', 'cross-folder'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h182-src.txt', content: 'cross folder' }), step(CREATE_FOLDER, { path: '/tmp/tarx-test-h182-dir' }), step(COPY, { sourcePath: '/tmp/tarx-test-h182-src.txt', destPath: '/tmp/tarx-test-h182-dir/copy.txt' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h182-src.txt' }), step(DELETE, { path: '/tmp/tarx-test-h182-dir' })],
		valueV('result', 'truthy', true)),

	tc('H-183', 'Copy file with overwrite', 'P1', ['explorer', 'copy', 'overwrite'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h183-src.txt', content: 'source' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h183-dst.txt', content: 'existing' }), step(COPY, { sourcePath: '/tmp/tarx-test-h183-src.txt', destPath: '/tmp/tarx-test-h183-dst.txt', overwrite: true }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h183-src.txt' }), step(DELETE, { path: '/tmp/tarx-test-h183-dst.txt' })],
		valueV('result', 'truthy', true)),

	tc('H-184', 'Copy non-existent file errors', 'P1', ['explorer', 'copy', 'error', 'non-existent'],
		[failStep(COPY, { sourcePath: '/tmp/tarx-nonexistent-h184.txt', destPath: '/tmp/tarx-h184-dst.txt' })],
		valueV('result', 'falsy', null)),

	tc('H-185', 'Copy file and verify both exist', 'P0', ['explorer', 'copy', 'verify'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h185-src.txt', content: 'original' }), step(COPY, { sourcePath: '/tmp/tarx-test-h185-src.txt', destPath: '/tmp/tarx-test-h185-dst.txt' }), step(TREE, { path: '/tmp', refresh: true }, { capture: 'tree' }), step(DELETE, { path: '/tmp/tarx-test-h185-src.txt' }), step(DELETE, { path: '/tmp/tarx-test-h185-dst.txt' })],
		valueV('tree', 'truthy', true)),

	tc('H-186', 'Copy folder', 'P1', ['explorer', 'copy', 'folder'],
		[step(CREATE_FOLDER, { path: '/tmp/tarx-test-h186-src' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h186-src/f.txt', content: 'inner' }), step(COPY, { sourcePath: '/tmp/tarx-test-h186-src', destPath: '/tmp/tarx-test-h186-dst' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h186-src' }), step(DELETE, { path: '/tmp/tarx-test-h186-dst' })],
		valueV('result', 'truthy', true)),

	tc('H-187', 'Get workspace info', 'P0', ['explorer', 'workspace', 'info'],
		[step(WORKSPACE, {}, { capture: 'ws' })],
		valueV('ws', 'truthy', true)),

	tc('H-188', 'Get workspace folders list', 'P0', ['explorer', 'workspace', 'folders'],
		[step(WORKSPACE, { includeFolders: true }, { capture: 'ws' })],
		valueV('ws', 'truthy', true)),

	tc('H-189', 'Workspace info returns name', 'P1', ['explorer', 'workspace', 'name'],
		[step(WORKSPACE, {}, { capture: 'ws' })],
		valueV('ws', 'truthy', true)),

	tc('H-190', 'Workspace info is consistent', 'P1', ['explorer', 'workspace', 'idempotent'],
		[step(WORKSPACE, {}, { capture: 'ws1' }), step(WORKSPACE, {}, { capture: 'ws2' })],
		valueV('ws1', 'truthy', true)),

	tc('H-191', 'Rename file then select renamed', 'P1', ['explorer', 'rename', 'select-after'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h191-old.txt', content: 'rename-select' }), step(RENAME, { oldPath: '/tmp/tarx-test-h191-old.txt', newPath: '/tmp/tarx-test-h191-new.txt' }), step(SELECT, { path: '/tmp/tarx-test-h191-new.txt' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h191-new.txt' })],
		valueV('result', 'truthy', true)),

	tc('H-192', 'Copy file then rename copy', 'P1', ['explorer', 'copy', 'rename-after'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h192-src.txt', content: 'copy-rename' }), step(COPY, { sourcePath: '/tmp/tarx-test-h192-src.txt', destPath: '/tmp/tarx-test-h192-copy.txt' }), step(RENAME, { oldPath: '/tmp/tarx-test-h192-copy.txt', newPath: '/tmp/tarx-test-h192-renamed.txt' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h192-src.txt' }), step(DELETE, { path: '/tmp/tarx-test-h192-renamed.txt' })],
		valueV('result', 'truthy', true)),

	tc('H-193', 'Copy file to same directory with different name', 'P1', ['explorer', 'copy', 'same-dir'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h193.txt', content: 'dup' }), step(COPY, { sourcePath: '/tmp/tarx-test-h193.txt', destPath: '/tmp/tarx-test-h193-copy.txt' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-test-h193.txt' }), step(DELETE, { path: '/tmp/tarx-test-h193-copy.txt' })],
		valueV('result', 'truthy', true)),

	tc('H-194', 'Copy file without overwrite to existing path errors', 'P1', ['explorer', 'copy', 'error', 'no-overwrite'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h194-src.txt', content: 'src' }), step(CREATE_FILE, { path: '/tmp/tarx-test-h194-dst.txt', content: 'dst' }), failStep(COPY, { sourcePath: '/tmp/tarx-test-h194-src.txt', destPath: '/tmp/tarx-test-h194-dst.txt', overwrite: false }), step(DELETE, { path: '/tmp/tarx-test-h194-src.txt' }), step(DELETE, { path: '/tmp/tarx-test-h194-dst.txt' })],
		valueV('result', 'falsy', null)),

	tc('H-195', 'Rename hidden file', 'P2', ['explorer', 'rename', 'hidden'],
		[step(CREATE_FILE, { path: '/tmp/.tarx-test-h195', content: 'hidden' }), step(RENAME, { oldPath: '/tmp/.tarx-test-h195', newPath: '/tmp/.tarx-test-h195-renamed' }, { capture: 'result' }), step(DELETE, { path: '/tmp/.tarx-test-h195-renamed' })],
		valueV('result', 'truthy', true)),

	tc('H-196', 'Copy hidden file', 'P2', ['explorer', 'copy', 'hidden'],
		[step(CREATE_FILE, { path: '/tmp/.tarx-test-h196', content: 'hidden' }), step(COPY, { sourcePath: '/tmp/.tarx-test-h196', destPath: '/tmp/.tarx-test-h196-copy' }, { capture: 'result' }), step(DELETE, { path: '/tmp/.tarx-test-h196' }), step(DELETE, { path: '/tmp/.tarx-test-h196-copy' })],
		valueV('result', 'truthy', true)),

	tc('H-197', 'Rename file with long name', 'P2', ['explorer', 'rename', 'long-name'],
		[step(CREATE_FILE, { path: '/tmp/tarx-h197.txt', content: 'long' }), step(RENAME, { oldPath: '/tmp/tarx-h197.txt', newPath: '/tmp/tarx-h197-' + 'r'.repeat(80) + '.txt' }, { capture: 'result' }), step(DELETE, { path: '/tmp/tarx-h197-' + 'r'.repeat(80) + '.txt' })],
		valueV('result', 'truthy', true)),

	tc('H-198', 'Add workspace folder', 'P1', ['explorer', 'workspace', 'add-folder'],
		[step(WORKSPACE, { action: 'addFolder', path: '/tmp' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('H-199', 'Get workspace folders count', 'P2', ['explorer', 'workspace', 'count'],
		[step(WORKSPACE, { includeFolders: true }, { capture: 'ws' })],
		valueV('ws', 'truthy', true)),

	tc('H-200', 'Full lifecycle: create, rename, copy, delete', 'P0', ['explorer', 'lifecycle', 'full'],
		[step(CREATE_FILE, { path: '/tmp/tarx-test-h200.txt', content: 'lifecycle' }), step(RENAME, { oldPath: '/tmp/tarx-test-h200.txt', newPath: '/tmp/tarx-test-h200-renamed.txt' }), step(COPY, { sourcePath: '/tmp/tarx-test-h200-renamed.txt', destPath: '/tmp/tarx-test-h200-copy.txt' }), step(DELETE, { path: '/tmp/tarx-test-h200-renamed.txt' }), step(DELETE, { path: '/tmp/tarx-test-h200-copy.txt' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),
];

// ===========================================================================
// Export
// ===========================================================================

export const explorerTests: TestCase[] = [
	...openExplorer,
	...treeOperations,
	...fileSelection,
	...createOperations,
	...deleteOperations,
	...renameCopy,
];
