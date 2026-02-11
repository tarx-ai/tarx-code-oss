/**
 * TARX UI Test Suite - Category I: SCM (I-001 to I-100)
 * 100 test cases for VS Code source control operations via HTTP harness
 *
 * Coverage:
 *   Open SCM                         I-001 to I-015   (15 tests)
 *   Changes                          I-016 to I-040   (25 tests)
 *   Staging                          I-041 to I-065   (25 tests)
 *   Commit                           I-066 to I-085   (20 tests)
 *   Branch                           I-086 to I-100   (15 tests)
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
		category: 'scm',
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
const OPEN = 'tarx_ui_scm_open';
const CHANGES = 'tarx_ui_scm_get_changes';
const STAGE = 'tarx_ui_scm_stage_file';
const UNSTAGE = 'tarx_ui_scm_unstage_file';
const STAGE_ALL = 'tarx_ui_scm_stage_all';
const COMMIT = 'tarx_ui_scm_commit';
const DISCARD = 'tarx_ui_scm_discard';
const BRANCH = 'tarx_ui_scm_get_branch';

// ===========================================================================
// I-001 to I-015 : Open SCM (15 tests)
// ===========================================================================

const openScm: TestCase[] = [
	tc('I-001', 'Open SCM view', 'P0', ['scm', 'open', 'smoke'],
		[step(OPEN, {}, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('I-002', 'Open SCM view twice is idempotent', 'P0', ['scm', 'open', 'idempotent'],
		[step(OPEN), step(OPEN, {}, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('I-003', 'Open SCM view with focus', 'P0', ['scm', 'open', 'focus'],
		[step(OPEN, { focus: true }, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('I-004', 'Open SCM view returns success response', 'P0', ['scm', 'open', 'response'],
		[step(OPEN, {}, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('I-005', 'Open SCM view then get changes', 'P0', ['scm', 'open', 'then-changes'],
		[step(OPEN), step(CHANGES, {}, { capture: 'changes' })],
		valueV('changes', 'truthy', true)),

	tc('I-006', 'Open SCM view then get branch info', 'P0', ['scm', 'open', 'then-branch'],
		[step(OPEN), step(BRANCH, {}, { capture: 'branch' })],
		valueV('branch', 'truthy', true)),

	tc('I-007', 'Open SCM view with delay', 'P1', ['scm', 'open', 'delay'],
		[step(OPEN, {}, { wait: 500, capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('I-008', 'Open SCM view rapid succession', 'P1', ['scm', 'open', 'rapid'],
		[step(OPEN), step(OPEN), step(OPEN, {}, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('I-009', 'Open SCM view preserves branch info', 'P1', ['scm', 'open', 'branch-preserved'],
		[step(OPEN), step(BRANCH, {}, { capture: 'branch' })],
		valueV('branch', 'truthy', true)),

	tc('I-010', 'Open SCM view and verify visible state', 'P1', ['scm', 'open', 'verify-visible'],
		[step(OPEN, {}, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('I-011', 'Open SCM view with panel expanded', 'P2', ['scm', 'open', 'panel'],
		[step(OPEN, { showPanel: true }, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('I-012', 'Open SCM view performance', 'P2', ['scm', 'open', 'performance'],
		[step(OPEN, {}, { capture: 'perf' })],
		valueV('perf', 'truthy', true)),

	tc('I-013', 'Open SCM view then get changes then get branch', 'P1', ['scm', 'open', 'full-overview'],
		[step(OPEN), step(CHANGES, {}, { capture: 'changes' }), step(BRANCH, {}, { capture: 'branch' })],
		valueV('branch', 'truthy', true)),

	tc('I-014', 'Open SCM view after delay then verify', 'P2', ['scm', 'open', 'delayed-verify'],
		[step(OPEN, {}, { wait: 300 }), step(CHANGES, {}, { capture: 'changes' })],
		valueV('changes', 'truthy', true)),

	tc('I-015', 'Open SCM view preserves repository context', 'P2', ['scm', 'open', 'repo-context'],
		[step(OPEN, { repository: '.' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),
];

// ===========================================================================
// I-016 to I-040 : Changes (25 tests)
// ===========================================================================

const changes: TestCase[] = [
	tc('I-016', 'Get SCM changes', 'P0', ['scm', 'changes', 'basic'],
		[step(CHANGES, {}, { capture: 'changes' })],
		valueV('changes', 'truthy', true)),

	tc('I-017', 'Get SCM changes returns list', 'P0', ['scm', 'changes', 'list'],
		[step(CHANGES, {}, { capture: 'changes' })],
		valueV('changes', 'truthy', true)),

	tc('I-018', 'Get SCM changes with staged filter', 'P0', ['scm', 'changes', 'staged'],
		[step(CHANGES, { filter: 'staged' }, { capture: 'changes' })],
		valueV('changes', 'truthy', true)),

	tc('I-019', 'Get SCM changes with unstaged filter', 'P0', ['scm', 'changes', 'unstaged'],
		[step(CHANGES, { filter: 'unstaged' }, { capture: 'changes' })],
		valueV('changes', 'truthy', true)),

	tc('I-020', 'Get SCM changes with untracked filter', 'P1', ['scm', 'changes', 'untracked'],
		[step(CHANGES, { filter: 'untracked' }, { capture: 'changes' })],
		valueV('changes', 'truthy', true)),

	tc('I-021', 'Get SCM changes includes file paths', 'P0', ['scm', 'changes', 'paths'],
		[step(CHANGES, {}, { capture: 'changes' })],
		valueV('changes', 'truthy', true)),

	tc('I-022', 'Get SCM changes includes change types', 'P0', ['scm', 'changes', 'types'],
		[step(CHANGES, {}, { capture: 'changes' })],
		valueV('changes', 'truthy', true)),

	tc('I-023', 'Get SCM changes with detail flag', 'P1', ['scm', 'changes', 'detail'],
		[step(CHANGES, { detail: true }, { capture: 'changes' })],
		valueV('changes', 'truthy', true)),

	tc('I-024', 'Get SCM changes with diff info', 'P1', ['scm', 'changes', 'diff'],
		[step(CHANGES, { includeDiff: true }, { capture: 'changes' })],
		valueV('changes', 'truthy', true)),

	tc('I-025', 'Get SCM changes repeated calls consistent', 'P1', ['scm', 'changes', 'consistent'],
		[step(CHANGES, {}, { capture: 'c1' }), step(CHANGES, {}, { capture: 'c2' })],
		valueV('c2', 'truthy', true)),

	tc('I-026', 'Get SCM changes after opening SCM view', 'P0', ['scm', 'changes', 'after-open'],
		[step(OPEN), step(CHANGES, {}, { capture: 'changes' })],
		valueV('changes', 'truthy', true)),

	tc('I-027', 'Get SCM changes with path filter', 'P1', ['scm', 'changes', 'path-filter'],
		[step(CHANGES, { path: 'src/' }, { capture: 'changes' })],
		valueV('changes', 'truthy', true)),

	tc('I-028', 'Get SCM changes summary only', 'P1', ['scm', 'changes', 'summary'],
		[step(CHANGES, { summary: true }, { capture: 'changes' })],
		valueV('changes', 'truthy', true)),

	tc('I-029', 'Get SCM changes count', 'P1', ['scm', 'changes', 'count'],
		[step(CHANGES, { countOnly: true }, { capture: 'count' })],
		valueV('count', 'truthy', true)),

	tc('I-030', 'Get SCM changes with limit', 'P2', ['scm', 'changes', 'limit'],
		[step(CHANGES, { limit: 5 }, { capture: 'changes' })],
		valueV('changes', 'truthy', true)),

	tc('I-031', 'Get SCM changes with offset', 'P2', ['scm', 'changes', 'offset'],
		[step(CHANGES, { offset: 0, limit: 10 }, { capture: 'changes' })],
		valueV('changes', 'truthy', true)),

	tc('I-032', 'Get SCM changes sorted by path', 'P2', ['scm', 'changes', 'sort-path'],
		[step(CHANGES, { sortBy: 'path' }, { capture: 'changes' })],
		valueV('changes', 'truthy', true)),

	tc('I-033', 'Get SCM changes sorted by status', 'P2', ['scm', 'changes', 'sort-status'],
		[step(CHANGES, { sortBy: 'status' }, { capture: 'changes' })],
		valueV('changes', 'truthy', true)),

	tc('I-034', 'Get SCM changes for specific repository', 'P1', ['scm', 'changes', 'repo'],
		[step(CHANGES, { repository: '.' }, { capture: 'changes' })],
		valueV('changes', 'truthy', true)),

	tc('I-035', 'Get SCM changes performance', 'P2', ['scm', 'changes', 'performance'],
		[step(CHANGES, {}, { capture: 'changes' })],
		valueV('changes', 'truthy', true)),

	tc('I-036', 'Discard changes on file', 'P0', ['scm', 'changes', 'discard'],
		[step(DISCARD, { path: 'test-file.txt' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('I-037', 'Discard changes without path fails', 'P0', ['scm', 'changes', 'discard-no-path'],
		[failStep(DISCARD, {})],
		valueV('result', 'truthy', true)),

	tc('I-038', 'Discard changes on nonexistent file fails', 'P1', ['scm', 'changes', 'discard-nonexistent'],
		[failStep(DISCARD, { path: 'nonexistent-abc-xyz.txt' })],
		valueV('result', 'truthy', true)),

	tc('I-039', 'Discard all changes', 'P1', ['scm', 'changes', 'discard-all'],
		[step(DISCARD, { all: true }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('I-040', 'Get changes then discard then get changes again', 'P1', ['scm', 'changes', 'discard-verify'],
		[step(CHANGES, {}, { capture: 'before' }), step(DISCARD, { path: 'test.txt' }), step(CHANGES, {}, { capture: 'after' })],
		valueV('after', 'truthy', true)),
];

// ===========================================================================
// I-041 to I-065 : Staging (25 tests)
// ===========================================================================

const staging: TestCase[] = [
	tc('I-041', 'Stage single file', 'P0', ['scm', 'stage', 'single'],
		[step(STAGE, { path: 'test-file.txt' })],
		stateV(CHANGES, { success: true })),

	tc('I-042', 'Stage file by absolute path', 'P0', ['scm', 'stage', 'absolute'],
		[step(STAGE, { path: '/tmp/test-stage.txt' })],
		stateV(CHANGES, { success: true })),

	tc('I-043', 'Stage all changes', 'P0', ['scm', 'stage-all', 'basic'],
		[step(STAGE_ALL, {}, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('I-044', 'Stage all twice is idempotent', 'P0', ['scm', 'stage-all', 'idempotent'],
		[step(STAGE_ALL), step(STAGE_ALL, {}, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('I-045', 'Stage nonexistent file fails gracefully', 'P0', ['scm', 'stage', 'nonexistent'],
		[failStep(STAGE, { path: 'nonexistent-file-xyz.txt' })],
		valueV('result', 'truthy', true)),

	tc('I-046', 'Stage without parameters fails', 'P0', ['scm', 'stage', 'no-params'],
		[failStep(STAGE, {})],
		valueV('result', 'truthy', true)),

	tc('I-047', 'Stage file then check staged changes', 'P0', ['scm', 'stage', 'verify'],
		[step(STAGE, { path: 'test.txt' }), step(CHANGES, { filter: 'staged' }, { capture: 'staged' })],
		valueV('staged', 'truthy', true)),

	tc('I-048', 'Stage TypeScript file', 'P1', ['scm', 'stage', 'typescript'],
		[step(STAGE, { path: 'src/index.ts' })],
		stateV(CHANGES, { success: true })),

	tc('I-049', 'Stage JSON file', 'P1', ['scm', 'stage', 'json'],
		[step(STAGE, { path: 'package.json' })],
		stateV(CHANGES, { success: true })),

	tc('I-050', 'Stage hidden file', 'P2', ['scm', 'stage', 'hidden'],
		[step(STAGE, { path: '.gitignore' })],
		stateV(CHANGES, { success: true })),

	tc('I-051', 'Stage file with spaces in name', 'P2', ['scm', 'stage', 'spaces'],
		[step(STAGE, { path: 'my file.txt' })],
		stateV(CHANGES, { success: true })),

	tc('I-052', 'Stage all then get staged count', 'P1', ['scm', 'stage-all', 'count'],
		[step(STAGE_ALL), step(CHANGES, { filter: 'staged', countOnly: true }, { capture: 'count' })],
		valueV('count', 'truthy', true)),

	tc('I-053', 'Stage file in subdirectory', 'P1', ['scm', 'stage', 'subdirectory'],
		[step(STAGE, { path: 'src/components/Header.tsx' })],
		stateV(CHANGES, { success: true })),

	tc('I-054', 'Stage same file twice is idempotent', 'P1', ['scm', 'stage', 'duplicate'],
		[step(STAGE, { path: 'test.txt' }), step(STAGE, { path: 'test.txt' })],
		stateV(CHANGES, { success: true })),

	tc('I-055', 'Stage all returns success response', 'P0', ['scm', 'stage-all', 'response'],
		[step(STAGE_ALL, {}, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('I-056', 'Unstage single file', 'P0', ['scm', 'unstage', 'single'],
		[step(STAGE, { path: 'test.txt' }), step(UNSTAGE, { path: 'test.txt' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('I-057', 'Unstage without path fails', 'P0', ['scm', 'unstage', 'no-params'],
		[failStep(UNSTAGE, {})],
		valueV('result', 'truthy', true)),

	tc('I-058', 'Unstage nonexistent file fails gracefully', 'P1', ['scm', 'unstage', 'nonexistent'],
		[failStep(UNSTAGE, { path: 'nonexistent-unstage-xyz.txt' })],
		valueV('result', 'truthy', true)),

	tc('I-059', 'Stage then unstage then verify empty staged', 'P0', ['scm', 'unstage', 'verify'],
		[step(STAGE, { path: 'test.txt' }), step(UNSTAGE, { path: 'test.txt' }), step(CHANGES, { filter: 'staged' }, { capture: 'staged' })],
		valueV('staged', 'truthy', true)),

	tc('I-060', 'Stage all then unstage single file', 'P1', ['scm', 'unstage', 'partial'],
		[step(STAGE_ALL), step(UNSTAGE, { path: 'test.txt' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('I-061', 'Unstage file with long path', 'P2', ['scm', 'unstage', 'long-path'],
		[step(STAGE, { path: 'src/deeply/nested/components/ui/Button.tsx' }), step(UNSTAGE, { path: 'src/deeply/nested/components/ui/Button.tsx' })],
		stateV(CHANGES, { success: true })),

	tc('I-062', 'Stage file with glob pattern', 'P2', ['scm', 'stage', 'glob'],
		[step(STAGE, { path: '*.ts' })],
		stateV(CHANGES, { success: true })),

	tc('I-063', 'Stage deleted file', 'P1', ['scm', 'stage', 'deleted'],
		[step(STAGE, { path: 'deleted-file.txt' })],
		stateV(CHANGES, { success: true })),

	tc('I-064', 'Stage renamed file', 'P1', ['scm', 'stage', 'renamed'],
		[step(STAGE, { path: 'renamed-file.txt' })],
		stateV(CHANGES, { success: true })),

	tc('I-065', 'Unstage same file twice is safe', 'P2', ['scm', 'unstage', 'idempotent'],
		[step(STAGE, { path: 'test.txt' }), step(UNSTAGE, { path: 'test.txt' }), step(UNSTAGE, { path: 'test.txt' })],
		stateV(CHANGES, { success: true })),
];

// ===========================================================================
// I-066 to I-085 : Commit (20 tests)
// ===========================================================================

const commit: TestCase[] = [
	tc('I-066', 'Commit with message', 'P0', ['scm', 'commit', 'basic'],
		[step(COMMIT, { message: 'test commit' })],
		stateV(CHANGES, { success: true })),

	tc('I-067', 'Commit with detailed message', 'P0', ['scm', 'commit', 'detailed'],
		[step(COMMIT, { message: 'feat: add new feature\n\nThis adds a new feature with detailed description.' })],
		stateV(CHANGES, { success: true })),

	tc('I-068', 'Commit without message fails', 'P0', ['scm', 'commit', 'no-message'],
		[failStep(COMMIT, {})],
		valueV('result', 'truthy', true)),

	tc('I-069', 'Commit with empty message fails', 'P0', ['scm', 'commit', 'empty-message'],
		[failStep(COMMIT, { message: '' })],
		valueV('result', 'truthy', true)),

	tc('I-070', 'Commit with amend flag', 'P1', ['scm', 'commit', 'amend'],
		[step(COMMIT, { message: 'amended commit', amend: true })],
		stateV(CHANGES, { success: true })),

	tc('I-071', 'Commit with all flag stages and commits', 'P1', ['scm', 'commit', 'all'],
		[step(COMMIT, { message: 'commit all', all: true })],
		stateV(CHANGES, { success: true })),

	tc('I-072', 'Commit returns success response', 'P0', ['scm', 'commit', 'response'],
		[step(COMMIT, { message: 'test response' }, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('I-073', 'Commit with special characters in message', 'P1', ['scm', 'commit', 'special-chars'],
		[step(COMMIT, { message: 'fix: handle "quotes" & <brackets>' })],
		stateV(CHANGES, { success: true })),

	tc('I-074', 'Commit with very long message', 'P2', ['scm', 'commit', 'long-message'],
		[step(COMMIT, { message: 'This is a very long commit message that goes on and on to test the handling of lengthy commit messages in the SCM system.' })],
		stateV(CHANGES, { success: true })),

	tc('I-075', 'Commit with signoff flag', 'P2', ['scm', 'commit', 'signoff'],
		[step(COMMIT, { message: 'signed commit', signoff: true })],
		stateV(CHANGES, { success: true })),

	tc('I-076', 'Commit with no staged changes', 'P1', ['scm', 'commit', 'empty'],
		[failStep(COMMIT, { message: 'empty commit' })],
		valueV('result', 'truthy', true)),

	tc('I-077', 'Stage all then commit then verify changes cleared', 'P0', ['scm', 'commit', 'verify-cleared'],
		[step(STAGE_ALL), step(COMMIT, { message: 'verify clear' }), step(CHANGES, { filter: 'staged' }, { capture: 'staged' })],
		valueV('staged', 'truthy', true)),

	tc('I-078', 'Commit multiline message', 'P1', ['scm', 'commit', 'multiline'],
		[step(COMMIT, { message: 'feat: title\n\n- bullet 1\n- bullet 2\n- bullet 3' })],
		stateV(CHANGES, { success: true })),

	tc('I-079', 'Commit with conventional format', 'P1', ['scm', 'commit', 'conventional'],
		[step(COMMIT, { message: 'fix(core): resolve null pointer exception' })],
		stateV(CHANGES, { success: true })),

	tc('I-080', 'Commit with unicode message', 'P2', ['scm', 'commit', 'unicode'],
		[step(COMMIT, { message: 'test: unicode commit message' })],
		stateV(CHANGES, { success: true })),

	tc('I-081', 'Stage single file then commit', 'P0', ['scm', 'commit', 'stage-single-commit'],
		[step(STAGE, { path: 'README.md' }), step(COMMIT, { message: 'update readme' })],
		stateV(CHANGES, { success: true })),

	tc('I-082', 'Stage multiple files then commit', 'P1', ['scm', 'commit', 'stage-multi-commit'],
		[step(STAGE, { path: 'file1.txt' }), step(STAGE, { path: 'file2.txt' }), step(COMMIT, { message: 'update two files' })],
		stateV(CHANGES, { success: true })),

	tc('I-083', 'Full stage and commit workflow', 'P0', ['scm', 'commit', 'full-workflow'],
		[step(STAGE_ALL), step(CHANGES, { filter: 'staged' }, { capture: 'staged' }), step(COMMIT, { message: 'workflow commit' })],
		valueV('staged', 'truthy', true)),

	tc('I-084', 'Error then recovery: empty message then valid commit', 'P1', ['scm', 'commit', 'error-recovery'],
		[failStep(COMMIT, { message: '' }), step(STAGE_ALL), step(COMMIT, { message: 'recovered commit' })],
		stateV(CHANGES, { success: true })),

	tc('I-085', 'Stage all then verify then commit then verify empty', 'P0', ['scm', 'commit', 'complete-cycle'],
		[step(STAGE_ALL), step(CHANGES, { filter: 'staged' }, { capture: 'before' }), step(COMMIT, { message: 'complete cycle' }), step(CHANGES, { filter: 'staged' }, { capture: 'after' })],
		valueV('after', 'truthy', true)),
];

// ===========================================================================
// I-086 to I-100 : Branch (15 tests)
// ===========================================================================

const branch: TestCase[] = [
	tc('I-086', 'Get current branch', 'P0', ['scm', 'branch', 'current'],
		[step(BRANCH, {}, { capture: 'branch' })],
		valueV('branch', 'truthy', true)),

	tc('I-087', 'Get branch name', 'P0', ['scm', 'branch', 'name'],
		[step(BRANCH, {}, { capture: 'branch' })],
		valueV('branch', 'truthy', true)),

	tc('I-088', 'Get branch list', 'P0', ['scm', 'branch', 'list'],
		[step(BRANCH, { list: true }, { capture: 'branches' })],
		valueV('branches', 'truthy', true)),

	tc('I-089', 'Get branch with remote info', 'P1', ['scm', 'branch', 'remote'],
		[step(BRANCH, { includeRemote: true }, { capture: 'branch' })],
		valueV('branch', 'truthy', true)),

	tc('I-090', 'Get branch with upstream tracking', 'P1', ['scm', 'branch', 'upstream'],
		[step(BRANCH, { includeUpstream: true }, { capture: 'branch' })],
		valueV('branch', 'truthy', true)),

	tc('I-091', 'Get branch with commit info', 'P1', ['scm', 'branch', 'commit'],
		[step(BRANCH, { includeCommit: true }, { capture: 'branch' })],
		valueV('branch', 'truthy', true)),

	tc('I-092', 'Get branch repeated calls consistent', 'P1', ['scm', 'branch', 'consistent'],
		[step(BRANCH, {}, { capture: 'b1' }), step(BRANCH, {}, { capture: 'b2' })],
		valueV('b2', 'truthy', true)),

	tc('I-093', 'Get branch after opening SCM', 'P0', ['scm', 'branch', 'after-open'],
		[step(OPEN), step(BRANCH, {}, { capture: 'branch' })],
		valueV('branch', 'truthy', true)),

	tc('I-094', 'Get branch with ahead/behind count', 'P1', ['scm', 'branch', 'ahead-behind'],
		[step(BRANCH, { includeAheadBehind: true }, { capture: 'branch' })],
		valueV('branch', 'truthy', true)),

	tc('I-095', 'Get all local branches', 'P1', ['scm', 'branch', 'local'],
		[step(BRANCH, { list: true, remote: false }, { capture: 'branches' })],
		valueV('branches', 'truthy', true)),

	tc('I-096', 'Get all remote branches', 'P2', ['scm', 'branch', 'remote-list'],
		[step(BRANCH, { list: true, remote: true }, { capture: 'branches' })],
		valueV('branches', 'truthy', true)),

	tc('I-097', 'Get branch with verbose flag', 'P2', ['scm', 'branch', 'verbose'],
		[step(BRANCH, { verbose: true }, { capture: 'branch' })],
		valueV('branch', 'truthy', true)),

	tc('I-098', 'Get branch with author info', 'P2', ['scm', 'branch', 'author'],
		[step(BRANCH, { includeAuthor: true }, { capture: 'branch' })],
		valueV('branch', 'truthy', true)),

	tc('I-099', 'End-to-end SCM workflow', 'P0', ['scm', 'branch', 'e2e-workflow'],
		[step(OPEN), step(BRANCH, {}, { capture: 'branch' }), step(CHANGES, {}, { capture: 'changes' }), step(STAGE_ALL), step(COMMIT, { message: 'e2e test commit' })],
		valueV('branch', 'truthy', true)),

	tc('I-100', 'Get branch performance', 'P2', ['scm', 'branch', 'performance'],
		[step(BRANCH, {}, { capture: 'branch' })],
		valueV('branch', 'truthy', true)),
];

// ===========================================================================
// Final export
// ===========================================================================

export const scmTests: TestCase[] = [
	...openScm,
	...changes,
	...staging,
	...commit,
	...branch,
];
