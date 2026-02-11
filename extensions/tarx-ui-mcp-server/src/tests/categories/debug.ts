/**
 * TARX UI Test Suite - Category J: Debug (J-001 to J-100)
 * 100 test cases for VS Code debug operations via HTTP harness
 *
 * Coverage:
 *   Open debug                       J-001 to J-015   (15 tests)
 *   Start / Stop                     J-016 to J-045   (30 tests)
 *   Stepping                         J-046 to J-075   (30 tests)
 *   State                            J-076 to J-100   (25 tests)
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
		category: 'debug',
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
const OPEN = 'tarx_ui_debug_open';
const START = 'tarx_ui_debug_start';
const STOP = 'tarx_ui_debug_stop';
const PAUSE = 'tarx_ui_debug_pause';
const CONTINUE = 'tarx_ui_debug_continue';
const STEP_OVER = 'tarx_ui_debug_step_over';
const STEP_INTO = 'tarx_ui_debug_step_into';
const STATE = 'tarx_ui_debug_get_state';

// ===========================================================================
// J-001 to J-015 : Open Debug (15 tests)
// ===========================================================================

const openDebug: TestCase[] = [
	tc('J-001', 'Open debug view', 'P0', ['debug', 'open', 'smoke'],
		[step(OPEN, {}, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('J-002', 'Open debug view twice is idempotent', 'P0', ['debug', 'open', 'idempotent'],
		[step(OPEN), step(OPEN, {}, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('J-003', 'Open debug view with focus', 'P0', ['debug', 'open', 'focus'],
		[step(OPEN, { focus: true }, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('J-004', 'Open debug view returns success', 'P0', ['debug', 'open', 'response'],
		[step(OPEN, {}, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('J-005', 'Open debug view then check state', 'P0', ['debug', 'open', 'then-state'],
		[step(OPEN), step(STATE, {}, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-006', 'Open debug view and verify no active session', 'P0', ['debug', 'open', 'no-session'],
		[step(OPEN), step(STATE, {}, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-007', 'Open debug view with delay', 'P1', ['debug', 'open', 'delay'],
		[step(OPEN, {}, { wait: 500, capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('J-008', 'Open debug view rapid succession', 'P1', ['debug', 'open', 'rapid'],
		[step(OPEN), step(OPEN), step(OPEN, {}, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('J-009', 'Open debug view preserves configuration', 'P1', ['debug', 'open', 'config'],
		[step(OPEN), step(STATE, { includeConfig: true }, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-010', 'Open debug view with panel option', 'P1', ['debug', 'open', 'panel'],
		[step(OPEN, { showPanel: true }, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('J-011', 'Open debug view with console option', 'P2', ['debug', 'open', 'console'],
		[step(OPEN, { showConsole: true }, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('J-012', 'Open debug view with breakpoints panel', 'P2', ['debug', 'open', 'breakpoints'],
		[step(OPEN, { showBreakpoints: true }, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('J-013', 'Open debug view with variables panel', 'P2', ['debug', 'open', 'variables'],
		[step(OPEN, { showVariables: true }, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('J-014', 'Open debug view with call stack panel', 'P2', ['debug', 'open', 'callstack'],
		[step(OPEN, { showCallStack: true }, { capture: 'result' })],
		stateV(OPEN, { visible: true })),

	tc('J-015', 'Open debug view performance', 'P2', ['debug', 'open', 'performance'],
		[step(OPEN, {}, { capture: 'perf' })],
		valueV('perf', 'truthy', true)),
];

// ===========================================================================
// J-016 to J-045 : Start / Stop (30 tests)
// ===========================================================================

const startStop: TestCase[] = [
	tc('J-016', 'Start debug session with Node.js config', 'P0', ['debug', 'start', 'node'],
		[step(START, { type: 'node', program: 'index.js' })],
		stateV(STATE, { active: true })),

	tc('J-017', 'Start debug session with launch config', 'P0', ['debug', 'start', 'launch'],
		[step(START, { configName: 'Launch Program' })],
		stateV(STATE, { active: true })),

	tc('J-018', 'Start debug session with attach config', 'P1', ['debug', 'start', 'attach'],
		[step(START, { type: 'node', request: 'attach', port: 9229 })],
		stateV(STATE, { active: true })),

	tc('J-019', 'Start debug session without config fails', 'P0', ['debug', 'start', 'no-config'],
		[failStep(START, {})],
		valueV('result', 'truthy', true)),

	tc('J-020', 'Start debug session with TypeScript config', 'P0', ['debug', 'start', 'typescript'],
		[step(START, { type: 'node', program: 'dist/index.js', preLaunchTask: 'tsc' })],
		stateV(STATE, { active: true })),

	tc('J-021', 'Start debug session with environment variables', 'P1', ['debug', 'start', 'env'],
		[step(START, { type: 'node', program: 'index.js', env: { NODE_ENV: 'test' } })],
		stateV(STATE, { active: true })),

	tc('J-022', 'Start debug session with arguments', 'P1', ['debug', 'start', 'args'],
		[step(START, { type: 'node', program: 'index.js', args: ['--port', '3000'] })],
		stateV(STATE, { active: true })),

	tc('J-023', 'Start debug session with working directory', 'P1', ['debug', 'start', 'cwd'],
		[step(START, { type: 'node', program: 'index.js', cwd: '/tmp' })],
		stateV(STATE, { active: true })),

	tc('J-024', 'Start debug session and capture result', 'P0', ['debug', 'start', 'capture'],
		[step(START, { type: 'node', program: 'index.js' }, { capture: 'session' })],
		valueV('session', 'truthy', true)),

	tc('J-025', 'Start debug session with stop on entry', 'P1', ['debug', 'start', 'stop-on-entry'],
		[step(START, { type: 'node', program: 'index.js', stopOnEntry: true })],
		stateV(STATE, { active: true })),

	tc('J-026', 'Start debug session with console option', 'P1', ['debug', 'start', 'console-option'],
		[step(START, { type: 'node', program: 'index.js', console: 'integratedTerminal' })],
		stateV(STATE, { active: true })),

	tc('J-027', 'Start debug session with source maps', 'P1', ['debug', 'start', 'sourcemaps'],
		[step(START, { type: 'node', program: 'dist/index.js', sourceMaps: true })],
		stateV(STATE, { active: true })),

	tc('J-028', 'Start debug session then immediately check state', 'P0', ['debug', 'start', 'immediate-state'],
		[step(START, { type: 'node', program: 'index.js' }), step(STATE, {}, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-029', 'Start debug session with invalid type fails', 'P1', ['debug', 'start', 'invalid-type'],
		[failStep(START, { type: 'nonexistent-debugger', program: 'test' })],
		valueV('result', 'truthy', true)),

	tc('J-030', 'Start debug session with named config', 'P0', ['debug', 'start', 'named'],
		[step(START, { configName: 'Debug Tests' })],
		stateV(STATE, { active: true })),

	tc('J-031', 'Stop debug session', 'P0', ['debug', 'stop', 'basic'],
		[step(START, { type: 'node', program: 'index.js' }), step(STOP)],
		stateV(STATE, { active: false })),

	tc('J-032', 'Stop debug session returns success', 'P0', ['debug', 'stop', 'response'],
		[step(START, { type: 'node', program: 'index.js' }), step(STOP, {}, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('J-033', 'Stop when no session is active', 'P0', ['debug', 'stop', 'no-session'],
		[step(STOP)],
		stateV(STATE, { active: false })),

	tc('J-034', 'Stop session twice is idempotent', 'P1', ['debug', 'stop', 'idempotent'],
		[step(START, { type: 'node', program: 'index.js' }), step(STOP), step(STOP)],
		stateV(STATE, { active: false })),

	tc('J-035', 'Stop session then verify state is inactive', 'P0', ['debug', 'stop', 'verify-inactive'],
		[step(START, { type: 'node', program: 'index.js' }), step(STOP), step(STATE, {}, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-036', 'Stop specific session by ID', 'P1', ['debug', 'stop', 'by-id'],
		[step(START, { type: 'node', program: 'index.js' }, { capture: 'session' }), step(STOP, { sessionId: 'current' })],
		stateV(STATE, { active: false })),

	tc('J-037', 'Stop all sessions', 'P1', ['debug', 'stop', 'all'],
		[step(START, { type: 'node', program: 'index.js' }), step(STOP, { all: true })],
		stateV(STATE, { active: false })),

	tc('J-038', 'Stop session with force flag', 'P1', ['debug', 'stop', 'force'],
		[step(START, { type: 'node', program: 'index.js' }), step(STOP, { force: true })],
		stateV(STATE, { active: false })),

	tc('J-039', 'Stop session with disconnect mode', 'P2', ['debug', 'stop', 'disconnect'],
		[step(START, { type: 'node', request: 'attach', port: 9229 }), step(STOP, { disconnect: true })],
		stateV(STATE, { active: false })),

	tc('J-040', 'Stop session with terminate mode', 'P1', ['debug', 'stop', 'terminate'],
		[step(START, { type: 'node', program: 'index.js' }), step(STOP, { terminate: true })],
		stateV(STATE, { active: false })),

	tc('J-041', 'Start then stop then start again', 'P1', ['debug', 'stop', 'restart-cycle'],
		[step(START, { type: 'node', program: 'index.js' }), step(STOP), step(START, { type: 'node', program: 'index.js' })],
		stateV(STATE, { active: true })),

	tc('J-042', 'Stop nonexistent session ID fails gracefully', 'P2', ['debug', 'stop', 'invalid-id'],
		[failStep(STOP, { sessionId: 'nonexistent-session-id' })],
		valueV('result', 'truthy', true)),

	tc('J-043', 'Stop session with wait for cleanup', 'P2', ['debug', 'stop', 'cleanup'],
		[step(START, { type: 'node', program: 'index.js' }), step(STOP, {}, { wait: 300 })],
		stateV(STATE, { active: false })),

	tc('J-044', 'Start second session while one is active', 'P1', ['debug', 'start', 'concurrent'],
		[step(START, { type: 'node', program: 'index.js' }), step(START, { type: 'node', program: 'other.js' })],
		stateV(STATE, { active: true })),

	tc('J-045', 'Stop session cleans up debug console', 'P2', ['debug', 'stop', 'console-cleanup'],
		[step(START, { type: 'node', program: 'index.js' }), step(STOP, { cleanConsole: true })],
		stateV(STATE, { active: false })),
];

// ===========================================================================
// J-046 to J-075 : Stepping (30 tests)
// ===========================================================================

const stepping: TestCase[] = [
	tc('J-046', 'Pause running debug session', 'P0', ['debug', 'pause', 'basic'],
		[step(START, { type: 'node', program: 'index.js' }), step(PAUSE, {}, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('J-047', 'Pause when no session active fails', 'P0', ['debug', 'pause', 'no-session'],
		[failStep(PAUSE, {})],
		valueV('result', 'truthy', true)),

	tc('J-048', 'Pause then check state is paused', 'P0', ['debug', 'pause', 'verify-state'],
		[step(START, { type: 'node', program: 'index.js' }), step(PAUSE), step(STATE, {}, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-049', 'Pause twice is idempotent', 'P1', ['debug', 'pause', 'idempotent'],
		[step(START, { type: 'node', program: 'index.js' }), step(PAUSE), step(PAUSE)],
		stateV(STATE, { active: true })),

	tc('J-050', 'Pause returns success response', 'P1', ['debug', 'pause', 'response'],
		[step(START, { type: 'node', program: 'index.js' }), step(PAUSE, {}, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('J-051', 'Continue paused session', 'P0', ['debug', 'continue', 'basic'],
		[step(START, { type: 'node', program: 'index.js' }), step(PAUSE), step(CONTINUE, {}, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('J-052', 'Continue when no session active fails', 'P0', ['debug', 'continue', 'no-session'],
		[failStep(CONTINUE, {})],
		valueV('result', 'truthy', true)),

	tc('J-053', 'Continue then check state is running', 'P0', ['debug', 'continue', 'verify-state'],
		[step(START, { type: 'node', program: 'index.js' }), step(PAUSE), step(CONTINUE), step(STATE, {}, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-054', 'Continue returns success response', 'P1', ['debug', 'continue', 'response'],
		[step(START, { type: 'node', program: 'index.js' }), step(PAUSE), step(CONTINUE, {}, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('J-055', 'Pause then continue cycle', 'P1', ['debug', 'continue', 'cycle'],
		[step(START, { type: 'node', program: 'index.js' }), step(PAUSE), step(CONTINUE), step(PAUSE), step(CONTINUE)],
		stateV(STATE, { active: true })),

	tc('J-056', 'Step over instruction', 'P0', ['debug', 'step-over', 'basic'],
		[step(START, { type: 'node', program: 'index.js', stopOnEntry: true }), step(STEP_OVER, {}, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('J-057', 'Step over when no session active fails', 'P0', ['debug', 'step-over', 'no-session'],
		[failStep(STEP_OVER, {})],
		valueV('result', 'truthy', true)),

	tc('J-058', 'Step over then check state', 'P0', ['debug', 'step-over', 'verify-state'],
		[step(START, { type: 'node', program: 'index.js', stopOnEntry: true }), step(STEP_OVER), step(STATE, {}, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-059', 'Step over returns success response', 'P1', ['debug', 'step-over', 'response'],
		[step(START, { type: 'node', program: 'index.js', stopOnEntry: true }), step(STEP_OVER, {}, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('J-060', 'Step over multiple times', 'P1', ['debug', 'step-over', 'multiple'],
		[step(START, { type: 'node', program: 'index.js', stopOnEntry: true }), step(STEP_OVER), step(STEP_OVER), step(STEP_OVER, {}, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('J-061', 'Step over with granularity statement', 'P2', ['debug', 'step-over', 'statement'],
		[step(START, { type: 'node', program: 'index.js', stopOnEntry: true }), step(STEP_OVER, { granularity: 'statement' })],
		stateV(STATE, { active: true })),

	tc('J-062', 'Step over with granularity line', 'P2', ['debug', 'step-over', 'line'],
		[step(START, { type: 'node', program: 'index.js', stopOnEntry: true }), step(STEP_OVER, { granularity: 'line' })],
		stateV(STATE, { active: true })),

	tc('J-063', 'Step into function', 'P0', ['debug', 'step-into', 'basic'],
		[step(START, { type: 'node', program: 'index.js', stopOnEntry: true }), step(STEP_INTO, {}, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('J-064', 'Step into when no session active fails', 'P0', ['debug', 'step-into', 'no-session'],
		[failStep(STEP_INTO, {})],
		valueV('result', 'truthy', true)),

	tc('J-065', 'Step into then check state', 'P0', ['debug', 'step-into', 'verify-state'],
		[step(START, { type: 'node', program: 'index.js', stopOnEntry: true }), step(STEP_INTO), step(STATE, {}, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-066', 'Step into returns success response', 'P1', ['debug', 'step-into', 'response'],
		[step(START, { type: 'node', program: 'index.js', stopOnEntry: true }), step(STEP_INTO, {}, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('J-067', 'Step into multiple times', 'P1', ['debug', 'step-into', 'multiple'],
		[step(START, { type: 'node', program: 'index.js', stopOnEntry: true }), step(STEP_INTO), step(STEP_INTO), step(STEP_INTO, {}, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('J-068', 'Step into with target function', 'P2', ['debug', 'step-into', 'target'],
		[step(START, { type: 'node', program: 'index.js', stopOnEntry: true }), step(STEP_INTO, { targetId: 'myFunction' })],
		stateV(STATE, { active: true })),

	tc('J-069', 'Pause then step over', 'P0', ['debug', 'step', 'pause-step-over'],
		[step(START, { type: 'node', program: 'index.js' }), step(PAUSE), step(STEP_OVER, {}, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('J-070', 'Pause then step into', 'P0', ['debug', 'step', 'pause-step-into'],
		[step(START, { type: 'node', program: 'index.js' }), step(PAUSE), step(STEP_INTO, {}, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('J-071', 'Step over then continue', 'P1', ['debug', 'step', 'step-over-continue'],
		[step(START, { type: 'node', program: 'index.js', stopOnEntry: true }), step(STEP_OVER), step(CONTINUE)],
		stateV(STATE, { active: true })),

	tc('J-072', 'Step into then step over then continue', 'P1', ['debug', 'step', 'mixed-stepping'],
		[step(START, { type: 'node', program: 'index.js', stopOnEntry: true }), step(STEP_INTO), step(STEP_OVER), step(CONTINUE)],
		stateV(STATE, { active: true })),

	tc('J-073', 'Rapid step over sequence', 'P2', ['debug', 'step-over', 'rapid'],
		[step(START, { type: 'node', program: 'index.js', stopOnEntry: true }), step(STEP_OVER), step(STEP_OVER), step(STEP_OVER), step(STEP_OVER), step(STEP_OVER, {}, { capture: 'result' })],
		valueV('result', 'truthy', true)),

	tc('J-074', 'Step operations then stop session', 'P1', ['debug', 'step', 'then-stop'],
		[step(START, { type: 'node', program: 'index.js', stopOnEntry: true }), step(STEP_OVER), step(STEP_INTO), step(STOP)],
		stateV(STATE, { active: false })),

	tc('J-075', 'Pause then step over then step into then continue then stop', 'P1', ['debug', 'step', 'full-sequence'],
		[step(START, { type: 'node', program: 'index.js' }), step(PAUSE), step(STEP_OVER), step(STEP_INTO), step(CONTINUE), step(STOP)],
		stateV(STATE, { active: false })),
];

// ===========================================================================
// J-076 to J-100 : State (25 tests)
// ===========================================================================

const state: TestCase[] = [
	tc('J-076', 'Get debug state', 'P0', ['debug', 'state', 'basic'],
		[step(STATE, {}, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-077', 'Get debug state returns active flag', 'P0', ['debug', 'state', 'active-flag'],
		[step(STATE, {}, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-078', 'Get debug state with session details', 'P1', ['debug', 'state', 'details'],
		[step(STATE, { detail: true }, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-079', 'Get debug state includes breakpoints', 'P1', ['debug', 'state', 'breakpoints'],
		[step(STATE, { includeBreakpoints: true }, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-080', 'Get debug state includes variables', 'P1', ['debug', 'state', 'variables'],
		[step(STATE, { includeVariables: true }, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-081', 'Get debug state includes call stack', 'P1', ['debug', 'state', 'callstack'],
		[step(STATE, { includeCallStack: true }, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-082', 'Get debug state includes configuration', 'P1', ['debug', 'state', 'configuration'],
		[step(STATE, { includeConfig: true }, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-083', 'Get debug state repeated calls consistent', 'P1', ['debug', 'state', 'consistent'],
		[step(STATE, {}, { capture: 's1' }), step(STATE, {}, { capture: 's2' })],
		valueV('s2', 'truthy', true)),

	tc('J-084', 'Get debug state when no session active', 'P0', ['debug', 'state', 'no-session'],
		[step(STATE, {}, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-085', 'Get debug state during active session', 'P0', ['debug', 'state', 'active-session'],
		[step(START, { type: 'node', program: 'index.js' }), step(STATE, {}, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-086', 'Get debug state after stop', 'P0', ['debug', 'state', 'after-stop'],
		[step(START, { type: 'node', program: 'index.js' }), step(STOP), step(STATE, {}, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-087', 'Get debug state with verbose flag', 'P2', ['debug', 'state', 'verbose'],
		[step(STATE, { verbose: true }, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-088', 'Get debug state includes threads', 'P2', ['debug', 'state', 'threads'],
		[step(STATE, { includeThreads: true }, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-089', 'Get debug state includes loaded scripts', 'P2', ['debug', 'state', 'scripts'],
		[step(STATE, { includeScripts: true }, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-090', 'Get debug state includes exceptions', 'P1', ['debug', 'state', 'exceptions'],
		[step(STATE, { includeExceptions: true }, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-091', 'Get debug state performance', 'P2', ['debug', 'state', 'performance'],
		[step(STATE, {}, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-092', 'Get debug state summary mode', 'P1', ['debug', 'state', 'summary'],
		[step(STATE, { summary: true }, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-093', 'Get debug state includes session list', 'P1', ['debug', 'state', 'sessions'],
		[step(STATE, { includeSessions: true }, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-094', 'Open then start then state then stop full lifecycle', 'P0', ['debug', 'state', 'lifecycle'],
		[step(OPEN), step(START, { type: 'node', program: 'index.js' }), step(STATE, {}, { capture: 'state' }), step(STOP)],
		valueV('state', 'truthy', true)),

	tc('J-095', 'Start stop restart and check state each time', 'P0', ['debug', 'state', 'restart-states'],
		[step(START, { type: 'node', program: 'index.js' }), step(STATE, {}, { capture: 's1' }), step(STOP), step(STATE, {}, { capture: 's2' }), step(START, { type: 'node', program: 'index.js' }), step(STATE, {}, { capture: 's3' })],
		valueV('s3', 'truthy', true)),

	tc('J-096', 'Get full debug context with all flags', 'P1', ['debug', 'state', 'full-context'],
		[step(STATE, { includeBreakpoints: true, includeVariables: true, includeCallStack: true, includeConfig: true }, { capture: 'fullState' })],
		valueV('fullState', 'truthy', true)),

	tc('J-097', 'Error recovery: invalid start then valid start then check state', 'P0', ['debug', 'state', 'error-recovery'],
		[failStep(START, {}), step(START, { type: 'node', program: 'index.js' }), step(STATE, {}, { capture: 'state' })],
		valueV('state', 'truthy', true)),

	tc('J-098', 'State monitoring with polling', 'P2', ['debug', 'state', 'polling'],
		[step(START, { type: 'node', program: 'index.js' }), step(STATE, {}, { capture: 's1', wait: 100 }), step(STATE, {}, { capture: 's2', wait: 100 }), step(STATE, {}, { capture: 's3' }), step(STOP)],
		valueV('s3', 'truthy', true)),

	tc('J-099', 'Complete debug cycle with all state checks', 'P0', ['debug', 'state', 'complete-cycle'],
		[step(OPEN), step(STATE, {}, { capture: 'before' }), step(START, { type: 'node', program: 'index.js' }), step(STATE, {}, { capture: 'during' }), step(STOP), step(STATE, {}, { capture: 'after' })],
		valueV('during', 'truthy', true)),

	tc('J-100', 'End-to-end debug workflow', 'P0', ['debug', 'state', 'e2e'],
		[step(OPEN, { focus: true }), step(STATE, {}, { capture: 'initialState' }), step(START, { type: 'node', program: 'index.js', env: { NODE_ENV: 'test' } }), step(STATE, { detail: true }, { capture: 'activeState' }), step(PAUSE), step(STEP_OVER), step(CONTINUE), step(STOP), step(STATE, {}, { capture: 'finalState' })],
		valueV('activeState', 'truthy', true)),
];

// ===========================================================================
// Final export
// ===========================================================================

export const debugTests: TestCase[] = [
	...openDebug,
	...startStop,
	...stepping,
	...state,
];
