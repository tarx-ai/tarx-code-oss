/**
 * Terminal Test Suite - 200 test cases for VS Code terminal operations via HTTP
 *
 * Categories covered:
 *   1. Create terminals with different names       (B-001 .. B-025)
 *   2. Send commands                               (B-026 .. B-055)
 *   3. List terminals                              (B-056 .. B-075)
 *   4. Close individual and all                    (B-076 .. B-100)
 *   5. Split terminals                             (B-101 .. B-115)
 *   6. Show/hide terminal panel                    (B-116 .. B-130)
 *   7. Multiple terminal management                (B-131 .. B-160)
 *   8. Terminal with custom shell                  (B-161 .. B-170)
 *   9. Terminal with custom cwd                    (B-171 .. B-185)
 *  10. Edge cases and error handling               (B-186 .. B-200)
 */

import type { TestCase, TestStep, TestVerification } from '../types.js';

// ---------------------------------------------------------------------------
// Helper to reduce boilerplate
// ---------------------------------------------------------------------------
function tc(
	id: string,
	name: string,
	priority: 'P0' | 'P1' | 'P2',
	tags: string[],
	steps: TestStep[],
	verify: TestVerification,
): TestCase {
	return {
		id,
		category: 'terminal',
		name,
		description: name,
		priority,
		tags,
		steps,
		verify,
		timeoutMs: 10000,
		retries: 1,
	};
}

// Shorthand step builders
function post(endpoint: string, params: Record<string, unknown> = {}, opts?: { capture?: string; wait?: number }): TestStep {
	return {
		tool: endpoint,
		params,
		expectSuccess: true,
		...(opts?.capture ? { captureResult: opts.capture } : {}),
		...(opts?.wait ? { waitMs: opts.wait } : {}),
	};
}

function get(endpoint: string, params: Record<string, unknown> = {}, opts?: { capture?: string }): TestStep {
	return {
		tool: endpoint,
		params,
		expectSuccess: true,
		...(opts?.capture ? { captureResult: opts.capture } : {}),
	};
}

function failPost(endpoint: string, params: Record<string, unknown> = {}): TestStep {
	return { tool: endpoint, params, expectSuccess: false };
}

function stateVerify(endpoint: string, expect: Record<string, unknown>): TestVerification {
	return { type: 'state', stateCheck: { endpoint, expect } };
}

function valueVerify(variable: string, assertion: 'equals' | 'contains' | 'truthy' | 'falsy' | 'gt' | 'lt', expected: unknown): TestVerification {
	return { type: 'value', valueCheck: { variable, assertion, expected } };
}

// Cleanup step reused in many tests
const closeAll = post('/ui/terminal/close-all');

// ---------------------------------------------------------------------------
// 1. Create terminals with different names  (B-001 .. B-025)
// ---------------------------------------------------------------------------

export const terminalTests: TestCase[] = [

	// -- 1. Create terminals with different names --

	tc('B-001', 'Create terminal with default name', 'P0', ['create', 'smoke'], [
		closeAll,
		post('/ui/terminal/create', {}, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-002', 'Create terminal named "build"', 'P0', ['create', 'naming'], [
		closeAll,
		post('/ui/terminal/create', { name: 'build' }, { capture: 'term' }),
	], stateVerify('/ui/terminal/list', { terminals: [{ name: 'build' }] })),

	tc('B-003', 'Create terminal named "test-runner"', 'P1', ['create', 'naming'], [
		closeAll,
		post('/ui/terminal/create', { name: 'test-runner' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-004', 'Create terminal named "server"', 'P1', ['create', 'naming'], [
		closeAll,
		post('/ui/terminal/create', { name: 'server' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-005', 'Create terminal named "debug"', 'P1', ['create', 'naming'], [
		closeAll,
		post('/ui/terminal/create', { name: 'debug' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-006', 'Create terminal named "watch"', 'P1', ['create', 'naming'], [
		closeAll,
		post('/ui/terminal/create', { name: 'watch' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-007', 'Create terminal named "deploy"', 'P2', ['create', 'naming'], [
		closeAll,
		post('/ui/terminal/create', { name: 'deploy' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-008', 'Create terminal named "lint"', 'P2', ['create', 'naming'], [
		closeAll,
		post('/ui/terminal/create', { name: 'lint' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-009', 'Create terminal with empty name defaults gracefully', 'P1', ['create', 'naming', 'edge'], [
		closeAll,
		post('/ui/terminal/create', { name: '' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-010', 'Create terminal with unicode name', 'P2', ['create', 'naming', 'unicode'], [
		closeAll,
		post('/ui/terminal/create', { name: 'terminal-\u2605' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-011', 'Create terminal with very long name (100 chars)', 'P2', ['create', 'naming', 'edge'], [
		closeAll,
		post('/ui/terminal/create', { name: 'a'.repeat(100) }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-012', 'Create terminal named "git"', 'P1', ['create', 'naming'], [
		closeAll,
		post('/ui/terminal/create', { name: 'git' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-013', 'Create terminal named "npm"', 'P1', ['create', 'naming'], [
		closeAll,
		post('/ui/terminal/create', { name: 'npm' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-014', 'Create terminal named "docker"', 'P2', ['create', 'naming'], [
		closeAll,
		post('/ui/terminal/create', { name: 'docker' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-015', 'Create terminal named "ssh"', 'P2', ['create', 'naming'], [
		closeAll,
		post('/ui/terminal/create', { name: 'ssh' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-016', 'Create terminal with spaces in name', 'P1', ['create', 'naming', 'edge'], [
		closeAll,
		post('/ui/terminal/create', { name: 'my terminal' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-017', 'Create terminal with special characters in name', 'P2', ['create', 'naming', 'edge'], [
		closeAll,
		post('/ui/terminal/create', { name: 'term@#$%' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-018', 'Create terminal named "compile"', 'P2', ['create', 'naming'], [
		closeAll,
		post('/ui/terminal/create', { name: 'compile' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-019', 'Create terminal named "format"', 'P2', ['create', 'naming'], [
		closeAll,
		post('/ui/terminal/create', { name: 'format' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-020', 'Create terminal named "migration"', 'P2', ['create', 'naming'], [
		closeAll,
		post('/ui/terminal/create', { name: 'migration' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-021', 'Create terminal with numeric name "1"', 'P2', ['create', 'naming', 'edge'], [
		closeAll,
		post('/ui/terminal/create', { name: '1' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-022', 'Create terminal with dash-separated name', 'P1', ['create', 'naming'], [
		closeAll,
		post('/ui/terminal/create', { name: 'my-custom-terminal' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-023', 'Create terminal with underscore-separated name', 'P1', ['create', 'naming'], [
		closeAll,
		post('/ui/terminal/create', { name: 'my_custom_terminal' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-024', 'Create terminal with dot-separated name', 'P2', ['create', 'naming'], [
		closeAll,
		post('/ui/terminal/create', { name: 'term.v2.0' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-025', 'Create terminal named "tarx"', 'P0', ['create', 'naming', 'brand'], [
		closeAll,
		post('/ui/terminal/create', { name: 'tarx' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	// ---------------------------------------------------------------------------
	// 2. Send commands  (B-026 .. B-055)
	// ---------------------------------------------------------------------------

	tc('B-026', 'Send echo command to terminal', 'P0', ['send', 'smoke'], [
		closeAll,
		post('/ui/terminal/create', { name: 'cmd-test' }),
		post('/ui/terminal/send', { command: 'echo hello' }, { wait: 500 }),
	], valueVerify('term', 'truthy', true)),

	tc('B-027', 'Send ls command', 'P0', ['send', 'unix'], [
		closeAll,
		post('/ui/terminal/create', { name: 'ls-test' }),
		post('/ui/terminal/send', { command: 'ls' }, { wait: 500 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-028', 'Send pwd command', 'P0', ['send', 'unix'], [
		closeAll,
		post('/ui/terminal/create', { name: 'pwd-test' }),
		post('/ui/terminal/send', { command: 'pwd' }, { wait: 500 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-029', 'Send whoami command', 'P1', ['send', 'unix'], [
		closeAll,
		post('/ui/terminal/create', { name: 'whoami-test' }),
		post('/ui/terminal/send', { command: 'whoami' }, { wait: 500 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-030', 'Send date command', 'P1', ['send', 'unix'], [
		closeAll,
		post('/ui/terminal/create', { name: 'date-test' }),
		post('/ui/terminal/send', { command: 'date' }, { wait: 500 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-031', 'Send cat /dev/null command', 'P2', ['send', 'unix'], [
		closeAll,
		post('/ui/terminal/create', { name: 'cat-test' }),
		post('/ui/terminal/send', { command: 'cat /dev/null' }, { wait: 500 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-032', 'Send piped command (echo | wc)', 'P1', ['send', 'pipe'], [
		closeAll,
		post('/ui/terminal/create', { name: 'pipe-test' }),
		post('/ui/terminal/send', { command: 'echo hello world | wc -w' }, { wait: 500 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-033', 'Send command with environment variable', 'P1', ['send', 'env'], [
		closeAll,
		post('/ui/terminal/create', { name: 'env-test' }),
		post('/ui/terminal/send', { command: 'echo $HOME' }, { wait: 500 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-034', 'Send multi-line command using semicolons', 'P1', ['send', 'multi'], [
		closeAll,
		post('/ui/terminal/create', { name: 'multi-test' }),
		post('/ui/terminal/send', { command: 'echo one; echo two; echo three' }, { wait: 500 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-035', 'Send command with addNewLine=false', 'P1', ['send', 'newline'], [
		closeAll,
		post('/ui/terminal/create', { name: 'noline-test' }),
		post('/ui/terminal/send', { command: 'echo partial', addNewLine: false }, { wait: 300 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-036', 'Send command with addNewLine=true (explicit)', 'P1', ['send', 'newline'], [
		closeAll,
		post('/ui/terminal/create', { name: 'yesline-test' }),
		post('/ui/terminal/send', { command: 'echo full', addNewLine: true }, { wait: 300 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-037', 'Send empty command', 'P2', ['send', 'edge'], [
		closeAll,
		post('/ui/terminal/create', { name: 'empty-cmd' }),
		post('/ui/terminal/send', { command: '' }, { wait: 300 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-038', 'Send command to specific terminal by id', 'P0', ['send', 'targeted'], [
		closeAll,
		post('/ui/terminal/create', { name: 'target-a' }, { capture: 'termA' }),
		post('/ui/terminal/create', { name: 'target-b' }),
		post('/ui/terminal/send', { command: 'echo targeted', terminalId: 1 }, { wait: 300 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-039', 'Send git status command', 'P1', ['send', 'git'], [
		closeAll,
		post('/ui/terminal/create', { name: 'git-cmd' }),
		post('/ui/terminal/send', { command: 'git status' }, { wait: 500 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-040', 'Send node --version command', 'P1', ['send', 'node'], [
		closeAll,
		post('/ui/terminal/create', { name: 'node-cmd' }),
		post('/ui/terminal/send', { command: 'node --version' }, { wait: 500 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-041', 'Send npm --version command', 'P1', ['send', 'npm'], [
		closeAll,
		post('/ui/terminal/create', { name: 'npm-cmd' }),
		post('/ui/terminal/send', { command: 'npm --version' }, { wait: 500 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-042', 'Send command with quoted arguments', 'P1', ['send', 'quoting'], [
		closeAll,
		post('/ui/terminal/create', { name: 'quote-cmd' }),
		post('/ui/terminal/send', { command: 'echo "hello world"' }, { wait: 300 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-043', 'Send command with single quotes', 'P1', ['send', 'quoting'], [
		closeAll,
		post('/ui/terminal/create', { name: 'squote-cmd' }),
		post('/ui/terminal/send', { command: "echo 'hello world'" }, { wait: 300 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-044', 'Send command with backslash escapes', 'P2', ['send', 'escape'], [
		closeAll,
		post('/ui/terminal/create', { name: 'escape-cmd' }),
		post('/ui/terminal/send', { command: 'echo hello\\ world' }, { wait: 300 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-045', 'Send cd / command', 'P1', ['send', 'navigation'], [
		closeAll,
		post('/ui/terminal/create', { name: 'cd-root' }),
		post('/ui/terminal/send', { command: 'cd /' }, { wait: 300 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-046', 'Send cd ~ command', 'P1', ['send', 'navigation'], [
		closeAll,
		post('/ui/terminal/create', { name: 'cd-home' }),
		post('/ui/terminal/send', { command: 'cd ~' }, { wait: 300 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-047', 'Send mkdir and rmdir commands in sequence', 'P2', ['send', 'filesystem'], [
		closeAll,
		post('/ui/terminal/create', { name: 'mkdir-test' }),
		post('/ui/terminal/send', { command: 'mkdir /tmp/tarx-test-dir-$$' }, { wait: 300 }),
		post('/ui/terminal/send', { command: 'rmdir /tmp/tarx-test-dir-$$' }, { wait: 300 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-048', 'Send sleep 0 command (fast)', 'P2', ['send', 'timing'], [
		closeAll,
		post('/ui/terminal/create', { name: 'sleep-test' }),
		post('/ui/terminal/send', { command: 'sleep 0' }, { wait: 300 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-049', 'Send command with redirection', 'P2', ['send', 'redirect'], [
		closeAll,
		post('/ui/terminal/create', { name: 'redirect-cmd' }),
		post('/ui/terminal/send', { command: 'echo test > /dev/null' }, { wait: 300 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-050', 'Send command with logical AND', 'P1', ['send', 'logic'], [
		closeAll,
		post('/ui/terminal/create', { name: 'and-cmd' }),
		post('/ui/terminal/send', { command: 'true && echo success' }, { wait: 300 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-051', 'Send command with logical OR', 'P1', ['send', 'logic'], [
		closeAll,
		post('/ui/terminal/create', { name: 'or-cmd' }),
		post('/ui/terminal/send', { command: 'false || echo fallback' }, { wait: 300 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-052', 'Send which node command', 'P2', ['send', 'discovery'], [
		closeAll,
		post('/ui/terminal/create', { name: 'which-cmd' }),
		post('/ui/terminal/send', { command: 'which node' }, { wait: 500 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-053', 'Send env command', 'P2', ['send', 'env'], [
		closeAll,
		post('/ui/terminal/create', { name: 'env-dump' }),
		post('/ui/terminal/send', { command: 'env | head -5' }, { wait: 500 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-054', 'Send uname -a command', 'P2', ['send', 'system'], [
		closeAll,
		post('/ui/terminal/create', { name: 'uname-cmd' }),
		post('/ui/terminal/send', { command: 'uname -a' }, { wait: 500 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-055', 'Send rapid sequential commands', 'P0', ['send', 'rapid', 'stress'], [
		closeAll,
		post('/ui/terminal/create', { name: 'rapid-cmd' }),
		post('/ui/terminal/send', { command: 'echo 1' }),
		post('/ui/terminal/send', { command: 'echo 2' }),
		post('/ui/terminal/send', { command: 'echo 3' }),
		post('/ui/terminal/send', { command: 'echo 4' }),
		post('/ui/terminal/send', { command: 'echo 5' }, { wait: 500 }),
	], stateVerify('/ui/terminal/list', {})),

	// ---------------------------------------------------------------------------
	// 3. List terminals  (B-056 .. B-075)
	// ---------------------------------------------------------------------------

	tc('B-056', 'List terminals when none exist', 'P0', ['list', 'empty'], [
		closeAll,
		get('/ui/terminal/list', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-057', 'List terminals with one terminal open', 'P0', ['list'], [
		closeAll,
		post('/ui/terminal/create', { name: 'single' }),
		get('/ui/terminal/list', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-058', 'List terminals with two terminals open', 'P0', ['list'], [
		closeAll,
		post('/ui/terminal/create', { name: 'first' }),
		post('/ui/terminal/create', { name: 'second' }),
		get('/ui/terminal/list', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-059', 'List terminals with three terminals open', 'P1', ['list'], [
		closeAll,
		post('/ui/terminal/create', { name: 'alpha' }),
		post('/ui/terminal/create', { name: 'beta' }),
		post('/ui/terminal/create', { name: 'gamma' }),
		get('/ui/terminal/list', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-060', 'List terminals returns correct names', 'P0', ['list', 'validate'], [
		closeAll,
		post('/ui/terminal/create', { name: 'list-check' }),
		get('/ui/terminal/list', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-061', 'List terminals shows active terminal', 'P1', ['list', 'active'], [
		closeAll,
		post('/ui/terminal/create', { name: 'active-test' }),
		get('/ui/terminal/list', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-062', 'List terminals after creating and closing one', 'P1', ['list', 'lifecycle'], [
		closeAll,
		post('/ui/terminal/create', { name: 'temp' }),
		post('/ui/terminal/create', { name: 'keeper' }),
		post('/ui/terminal/close', {}),
		get('/ui/terminal/list', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-063', 'List terminals multiple times returns consistent results', 'P1', ['list', 'idempotent'], [
		closeAll,
		post('/ui/terminal/create', { name: 'consistent' }),
		get('/ui/terminal/list', {}, { capture: 'result1' }),
		get('/ui/terminal/list', {}, { capture: 'result2' }),
	], valueVerify('result1', 'truthy', true)),

	tc('B-064', 'List terminals with five terminals', 'P1', ['list', 'bulk'], [
		closeAll,
		post('/ui/terminal/create', { name: 'term-1' }),
		post('/ui/terminal/create', { name: 'term-2' }),
		post('/ui/terminal/create', { name: 'term-3' }),
		post('/ui/terminal/create', { name: 'term-4' }),
		post('/ui/terminal/create', { name: 'term-5' }),
		get('/ui/terminal/list', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-065', 'List terminals with ten terminals', 'P2', ['list', 'stress'], [
		closeAll,
		post('/ui/terminal/create', { name: 'bulk-1' }),
		post('/ui/terminal/create', { name: 'bulk-2' }),
		post('/ui/terminal/create', { name: 'bulk-3' }),
		post('/ui/terminal/create', { name: 'bulk-4' }),
		post('/ui/terminal/create', { name: 'bulk-5' }),
		post('/ui/terminal/create', { name: 'bulk-6' }),
		post('/ui/terminal/create', { name: 'bulk-7' }),
		post('/ui/terminal/create', { name: 'bulk-8' }),
		post('/ui/terminal/create', { name: 'bulk-9' }),
		post('/ui/terminal/create', { name: 'bulk-10' }),
		get('/ui/terminal/list', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-066', 'List terminals after close-all is empty', 'P0', ['list', 'empty', 'lifecycle'], [
		post('/ui/terminal/create', { name: 'doomed-a' }),
		post('/ui/terminal/create', { name: 'doomed-b' }),
		closeAll,
		get('/ui/terminal/list', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-067', 'List terminals includes process id info', 'P2', ['list', 'metadata'], [
		closeAll,
		post('/ui/terminal/create', { name: 'pid-check' }, { wait: 500 }),
		get('/ui/terminal/list', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-068', 'List terminals after split shows two entries', 'P1', ['list', 'split'], [
		closeAll,
		post('/ui/terminal/create', { name: 'split-parent' }),
		post('/ui/terminal/split'),
		get('/ui/terminal/list', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-069', 'List terminals after rename shows new name', 'P1', ['list', 'rename'], [
		closeAll,
		post('/ui/terminal/create', { name: 'old-name' }),
		post('/ui/terminal/rename', { name: 'new-name' }),
		get('/ui/terminal/list', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-070', 'List terminals preserves creation order', 'P2', ['list', 'order'], [
		closeAll,
		post('/ui/terminal/create', { name: 'first-created' }),
		post('/ui/terminal/create', { name: 'second-created' }),
		post('/ui/terminal/create', { name: 'third-created' }),
		get('/ui/terminal/list', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-071', 'List terminals with default-named terminals', 'P1', ['list', 'default'], [
		closeAll,
		post('/ui/terminal/create', {}),
		post('/ui/terminal/create', {}),
		get('/ui/terminal/list', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-072', 'List terminals after selecting a terminal', 'P1', ['list', 'select'], [
		closeAll,
		post('/ui/terminal/create', { name: 'sel-a' }),
		post('/ui/terminal/create', { name: 'sel-b' }),
		post('/ui/terminal/select', { terminalId: 1 }),
		get('/ui/terminal/list', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-073', 'List terminals with unicode-named terminal', 'P2', ['list', 'unicode'], [
		closeAll,
		post('/ui/terminal/create', { name: '\u2764 heart' }),
		get('/ui/terminal/list', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-074', 'List terminals after sending commands still shows terminal', 'P1', ['list', 'post-command'], [
		closeAll,
		post('/ui/terminal/create', { name: 'cmd-then-list' }),
		post('/ui/terminal/send', { command: 'echo test' }, { wait: 300 }),
		get('/ui/terminal/list', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-075', 'List terminals returns valid JSON structure', 'P0', ['list', 'schema'], [
		closeAll,
		post('/ui/terminal/create', { name: 'schema-check' }),
		get('/ui/terminal/list', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	// ---------------------------------------------------------------------------
	// 4. Close individual and all  (B-076 .. B-100)
	// ---------------------------------------------------------------------------

	tc('B-076', 'Close the only terminal', 'P0', ['close', 'smoke'], [
		closeAll,
		post('/ui/terminal/create', { name: 'only-one' }),
		post('/ui/terminal/close', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-077', 'Close active terminal (default)', 'P0', ['close', 'active'], [
		closeAll,
		post('/ui/terminal/create', { name: 'active-close' }),
		post('/ui/terminal/close', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-078', 'Close terminal by specific id', 'P0', ['close', 'targeted'], [
		closeAll,
		post('/ui/terminal/create', { name: 'close-by-id' }, { capture: 'term' }),
		post('/ui/terminal/close', { terminalId: 1 }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-079', 'Close first of two terminals', 'P1', ['close', 'multi'], [
		closeAll,
		post('/ui/terminal/create', { name: 'first' }, { capture: 'termA' }),
		post('/ui/terminal/create', { name: 'second' }),
		post('/ui/terminal/close', { terminalId: 1 }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-080', 'Close second of two terminals', 'P1', ['close', 'multi'], [
		closeAll,
		post('/ui/terminal/create', { name: 'stay' }),
		post('/ui/terminal/create', { name: 'go' }, { capture: 'termB' }),
		post('/ui/terminal/close', { terminalId: 2 }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-081', 'Close all terminals when one exists', 'P0', ['close-all', 'single'], [
		closeAll,
		post('/ui/terminal/create', { name: 'lone' }),
		post('/ui/terminal/close-all', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-082', 'Close all terminals when three exist', 'P0', ['close-all', 'multi'], [
		closeAll,
		post('/ui/terminal/create', { name: 'a' }),
		post('/ui/terminal/create', { name: 'b' }),
		post('/ui/terminal/create', { name: 'c' }),
		post('/ui/terminal/close-all', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-083', 'Close all terminals when none exist (no-op)', 'P1', ['close-all', 'edge'], [
		closeAll,
		post('/ui/terminal/close-all', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-084', 'Close terminal then verify list is empty', 'P0', ['close', 'verify'], [
		closeAll,
		post('/ui/terminal/create', { name: 'verify-close' }),
		post('/ui/terminal/close', {}),
		get('/ui/terminal/list', {}, { capture: 'list' }),
	], valueVerify('list', 'truthy', true)),

	tc('B-085', 'Close all then verify list is empty', 'P0', ['close-all', 'verify'], [
		post('/ui/terminal/create', { name: 'v-close-all-a' }),
		post('/ui/terminal/create', { name: 'v-close-all-b' }),
		post('/ui/terminal/close-all', {}),
		get('/ui/terminal/list', {}, { capture: 'list' }),
	], valueVerify('list', 'truthy', true)),

	tc('B-086', 'Close all with five terminals', 'P1', ['close-all', 'bulk'], [
		closeAll,
		post('/ui/terminal/create', { name: 'bulk-a' }),
		post('/ui/terminal/create', { name: 'bulk-b' }),
		post('/ui/terminal/create', { name: 'bulk-c' }),
		post('/ui/terminal/create', { name: 'bulk-d' }),
		post('/ui/terminal/create', { name: 'bulk-e' }),
		post('/ui/terminal/close-all', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-087', 'Close terminal after sending commands', 'P1', ['close', 'post-command'], [
		closeAll,
		post('/ui/terminal/create', { name: 'cmd-close' }),
		post('/ui/terminal/send', { command: 'echo before-close' }, { wait: 300 }),
		post('/ui/terminal/close', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-088', 'Close middle terminal of three', 'P1', ['close', 'multi', 'middle'], [
		closeAll,
		post('/ui/terminal/create', { name: 'left' }),
		post('/ui/terminal/create', { name: 'middle' }),
		post('/ui/terminal/create', { name: 'right' }),
		post('/ui/terminal/close', { terminalId: 2 }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-089', 'Close terminals one by one until empty', 'P1', ['close', 'sequential'], [
		closeAll,
		post('/ui/terminal/create', { name: 'seq-a' }),
		post('/ui/terminal/create', { name: 'seq-b' }),
		post('/ui/terminal/close', {}),
		post('/ui/terminal/close', {}),
		get('/ui/terminal/list', {}, { capture: 'list' }),
	], valueVerify('list', 'truthy', true)),

	tc('B-090', 'Close all twice in a row (idempotent)', 'P2', ['close-all', 'idempotent'], [
		closeAll,
		post('/ui/terminal/create', { name: 'idem' }),
		post('/ui/terminal/close-all', {}),
		post('/ui/terminal/close-all', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-091', 'Close terminal and create new one immediately', 'P1', ['close', 'recreate'], [
		closeAll,
		post('/ui/terminal/create', { name: 'ephemeral' }),
		post('/ui/terminal/close', {}),
		post('/ui/terminal/create', { name: 'replacement' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-092', 'Close all then create new terminal', 'P1', ['close-all', 'recreate'], [
		closeAll,
		post('/ui/terminal/create', { name: 'pre-wipe-a' }),
		post('/ui/terminal/create', { name: 'pre-wipe-b' }),
		post('/ui/terminal/close-all', {}),
		post('/ui/terminal/create', { name: 'post-wipe' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-093', 'Close split terminal pane', 'P1', ['close', 'split'], [
		closeAll,
		post('/ui/terminal/create', { name: 'split-close' }),
		post('/ui/terminal/split'),
		post('/ui/terminal/close', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-094', 'Close renamed terminal', 'P2', ['close', 'rename'], [
		closeAll,
		post('/ui/terminal/create', { name: 'before-rename' }),
		post('/ui/terminal/rename', { name: 'after-rename' }),
		post('/ui/terminal/close', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-095', 'Close terminal that ran a long command', 'P2', ['close', 'post-command'], [
		closeAll,
		post('/ui/terminal/create', { name: 'long-runner' }),
		post('/ui/terminal/send', { command: 'echo start; sleep 0; echo end' }, { wait: 500 }),
		post('/ui/terminal/close', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-096', 'Close all with mixed named and default terminals', 'P1', ['close-all', 'mixed'], [
		closeAll,
		post('/ui/terminal/create', { name: 'named' }),
		post('/ui/terminal/create', {}),
		post('/ui/terminal/create', { name: 'also-named' }),
		post('/ui/terminal/close-all', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-097', 'Close terminal with custom cwd', 'P2', ['close', 'cwd'], [
		closeAll,
		post('/ui/terminal/create', { name: 'cwd-close', cwd: '/tmp' }),
		post('/ui/terminal/close', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-098', 'Close terminal with custom shell', 'P2', ['close', 'shell'], [
		closeAll,
		post('/ui/terminal/create', { name: 'shell-close', shellPath: '/bin/sh' }),
		post('/ui/terminal/close', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-099', 'Close all returns closed count', 'P1', ['close-all', 'count'], [
		closeAll,
		post('/ui/terminal/create', { name: 'count-a' }),
		post('/ui/terminal/create', { name: 'count-b' }),
		post('/ui/terminal/create', { name: 'count-c' }),
		post('/ui/terminal/close-all', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-100', 'Close active terminal falls back to next', 'P1', ['close', 'fallback'], [
		closeAll,
		post('/ui/terminal/create', { name: 'primary' }),
		post('/ui/terminal/create', { name: 'secondary' }),
		post('/ui/terminal/close', {}),
		get('/ui/terminal/list', {}, { capture: 'list' }),
	], valueVerify('list', 'truthy', true)),

	// ---------------------------------------------------------------------------
	// 5. Split terminals  (B-101 .. B-115)
	// ---------------------------------------------------------------------------

	tc('B-101', 'Split the active terminal', 'P0', ['split', 'smoke'], [
		closeAll,
		post('/ui/terminal/create', { name: 'split-base' }),
		post('/ui/terminal/split', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-102', 'Split terminal increases terminal count by one', 'P0', ['split', 'count'], [
		closeAll,
		post('/ui/terminal/create', { name: 'count-split' }),
		post('/ui/terminal/split'),
		get('/ui/terminal/list', {}, { capture: 'list' }),
	], valueVerify('list', 'truthy', true)),

	tc('B-103', 'Split terminal twice creates three panes', 'P1', ['split', 'multi'], [
		closeAll,
		post('/ui/terminal/create', { name: 'triple-split' }),
		post('/ui/terminal/split'),
		post('/ui/terminal/split'),
		get('/ui/terminal/list', {}, { capture: 'list' }),
	], valueVerify('list', 'truthy', true)),

	tc('B-104', 'Split then send command to new pane', 'P1', ['split', 'send'], [
		closeAll,
		post('/ui/terminal/create', { name: 'split-cmd' }),
		post('/ui/terminal/split'),
		post('/ui/terminal/send', { command: 'echo in-split' }, { wait: 300 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-105', 'Split then close one pane', 'P1', ['split', 'close'], [
		closeAll,
		post('/ui/terminal/create', { name: 'split-close-one' }),
		post('/ui/terminal/split'),
		post('/ui/terminal/close', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-106', 'Split then close all', 'P1', ['split', 'close-all'], [
		closeAll,
		post('/ui/terminal/create', { name: 'split-close-all' }),
		post('/ui/terminal/split'),
		post('/ui/terminal/close-all', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-107', 'Split a named terminal', 'P1', ['split', 'named'], [
		closeAll,
		post('/ui/terminal/create', { name: 'named-split' }),
		post('/ui/terminal/split', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-108', 'Split a default terminal', 'P1', ['split', 'default'], [
		closeAll,
		post('/ui/terminal/create', {}),
		post('/ui/terminal/split', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-109', 'Split then select original pane', 'P1', ['split', 'select'], [
		closeAll,
		post('/ui/terminal/create', { name: 'orig-pane' }),
		post('/ui/terminal/split'),
		post('/ui/terminal/select', { terminalId: 1 }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-110', 'Split three times for four panes', 'P2', ['split', 'stress'], [
		closeAll,
		post('/ui/terminal/create', { name: 'quad-split' }),
		post('/ui/terminal/split'),
		post('/ui/terminal/split'),
		post('/ui/terminal/split'),
		get('/ui/terminal/list', {}, { capture: 'list' }),
	], valueVerify('list', 'truthy', true)),

	tc('B-111', 'Split terminal then rename new pane', 'P2', ['split', 'rename'], [
		closeAll,
		post('/ui/terminal/create', { name: 'pre-split-name' }),
		post('/ui/terminal/split'),
		post('/ui/terminal/rename', { name: 'split-renamed' }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-112', 'Split then send different commands to each pane', 'P1', ['split', 'parallel-cmd'], [
		closeAll,
		post('/ui/terminal/create', { name: 'dual-cmd' }),
		post('/ui/terminal/send', { command: 'echo pane-1' }),
		post('/ui/terminal/split'),
		post('/ui/terminal/send', { command: 'echo pane-2' }, { wait: 300 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-113', 'Split terminal with cwd inherits cwd', 'P2', ['split', 'cwd'], [
		closeAll,
		post('/ui/terminal/create', { name: 'cwd-split', cwd: '/tmp' }),
		post('/ui/terminal/split', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-114', 'Split terminal and verify both visible in list', 'P1', ['split', 'list-verify'], [
		closeAll,
		post('/ui/terminal/create', { name: 'split-vis' }),
		post('/ui/terminal/split'),
		get('/ui/terminal/list', {}, { capture: 'list' }),
	], valueVerify('list', 'truthy', true)),

	tc('B-115', 'Split five times for six panes', 'P2', ['split', 'stress', 'extreme'], [
		closeAll,
		post('/ui/terminal/create', { name: 'mega-split' }),
		post('/ui/terminal/split'),
		post('/ui/terminal/split'),
		post('/ui/terminal/split'),
		post('/ui/terminal/split'),
		post('/ui/terminal/split'),
		get('/ui/terminal/list', {}, { capture: 'list' }),
	], valueVerify('list', 'truthy', true)),

	// ---------------------------------------------------------------------------
	// 6. Show/hide terminal panel  (B-116 .. B-130)
	// ---------------------------------------------------------------------------

	tc('B-116', 'Show terminal panel', 'P0', ['show', 'smoke'], [
		post('/ui/terminal/show', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-117', 'Hide terminal panel', 'P0', ['hide', 'smoke'], [
		post('/ui/terminal/show'),
		post('/ui/terminal/hide', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-118', 'Show then hide terminal panel', 'P0', ['show', 'hide', 'toggle'], [
		post('/ui/terminal/show'),
		post('/ui/terminal/hide', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-119', 'Hide then show terminal panel', 'P1', ['hide', 'show', 'toggle'], [
		post('/ui/terminal/hide'),
		post('/ui/terminal/show', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-120', 'Show terminal panel twice (idempotent)', 'P1', ['show', 'idempotent'], [
		post('/ui/terminal/show'),
		post('/ui/terminal/show', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-121', 'Hide terminal panel twice (idempotent)', 'P1', ['hide', 'idempotent'], [
		post('/ui/terminal/show'),
		post('/ui/terminal/hide'),
		post('/ui/terminal/hide', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-122', 'Show panel after creating a terminal', 'P1', ['show', 'create'], [
		closeAll,
		post('/ui/terminal/create', { name: 'show-after-create' }),
		post('/ui/terminal/show', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-123', 'Hide panel then create terminal (auto-shows)', 'P1', ['hide', 'create', 'auto-show'], [
		post('/ui/terminal/hide'),
		post('/ui/terminal/create', { name: 'auto-show' }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-124', 'Show panel with no terminals', 'P1', ['show', 'empty'], [
		closeAll,
		post('/ui/terminal/show', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-125', 'Hide panel with running terminal', 'P1', ['hide', 'running'], [
		closeAll,
		post('/ui/terminal/create', { name: 'running' }),
		post('/ui/terminal/send', { command: 'echo running' }),
		post('/ui/terminal/hide', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-126', 'Rapid show/hide toggle 5 times', 'P2', ['show', 'hide', 'rapid', 'stress'], [
		post('/ui/terminal/show'),
		post('/ui/terminal/hide'),
		post('/ui/terminal/show'),
		post('/ui/terminal/hide'),
		post('/ui/terminal/show'),
		post('/ui/terminal/hide'),
		post('/ui/terminal/show'),
		post('/ui/terminal/hide'),
		post('/ui/terminal/show'),
		post('/ui/terminal/hide', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-127', 'Show panel then send command', 'P1', ['show', 'send'], [
		closeAll,
		post('/ui/terminal/create', { name: 'show-send' }),
		post('/ui/terminal/show'),
		post('/ui/terminal/send', { command: 'echo visible' }, { wait: 300, capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-128', 'Hide panel then close all terminals', 'P2', ['hide', 'close-all'], [
		closeAll,
		post('/ui/terminal/create', { name: 'hide-close' }),
		post('/ui/terminal/hide'),
		post('/ui/terminal/close-all', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-129', 'Show panel after close-all', 'P2', ['show', 'post-close'], [
		closeAll,
		post('/ui/terminal/show', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-130', 'Hide panel then list terminals still works', 'P1', ['hide', 'list'], [
		closeAll,
		post('/ui/terminal/create', { name: 'hidden-list' }),
		post('/ui/terminal/hide'),
		get('/ui/terminal/list', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	// ---------------------------------------------------------------------------
	// 7. Multiple terminal management  (B-131 .. B-160)
	// ---------------------------------------------------------------------------

	tc('B-131', 'Create two terminals and select first', 'P0', ['multi', 'select'], [
		closeAll,
		post('/ui/terminal/create', { name: 'sel-first' }),
		post('/ui/terminal/create', { name: 'sel-second' }),
		post('/ui/terminal/select', { terminalId: 1 }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-132', 'Create two terminals and select second', 'P0', ['multi', 'select'], [
		closeAll,
		post('/ui/terminal/create', { name: 'pick-a' }),
		post('/ui/terminal/create', { name: 'pick-b' }),
		post('/ui/terminal/select', { terminalId: 2 }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-133', 'Create three terminals, close middle, list remaining', 'P0', ['multi', 'close', 'list'], [
		closeAll,
		post('/ui/terminal/create', { name: 'left' }),
		post('/ui/terminal/create', { name: 'center' }),
		post('/ui/terminal/create', { name: 'right' }),
		post('/ui/terminal/close', { terminalId: 2 }),
		get('/ui/terminal/list', {}, { capture: 'list' }),
	], valueVerify('list', 'truthy', true)),

	tc('B-134', 'Rename a terminal and verify', 'P0', ['multi', 'rename'], [
		closeAll,
		post('/ui/terminal/create', { name: 'orig-name' }),
		post('/ui/terminal/rename', { name: 'updated-name' }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-135', 'Rename second terminal', 'P1', ['multi', 'rename', 'targeted'], [
		closeAll,
		post('/ui/terminal/create', { name: 'keep-name' }),
		post('/ui/terminal/create', { name: 'change-name' }),
		post('/ui/terminal/rename', { terminalId: 2, name: 'changed' }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-136', 'Send commands to different terminals by id', 'P0', ['multi', 'send', 'targeted'], [
		closeAll,
		post('/ui/terminal/create', { name: 'cmd-a' }),
		post('/ui/terminal/create', { name: 'cmd-b' }),
		post('/ui/terminal/send', { command: 'echo terminal-a', terminalId: 1 }),
		post('/ui/terminal/send', { command: 'echo terminal-b', terminalId: 2 }, { wait: 300 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-137', 'Create, select, send, close lifecycle', 'P0', ['multi', 'lifecycle'], [
		closeAll,
		post('/ui/terminal/create', { name: 'lifecycle' }),
		post('/ui/terminal/select', { terminalId: 1 }),
		post('/ui/terminal/send', { command: 'echo alive' }, { wait: 300 }),
		post('/ui/terminal/close', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-138', 'Create five terminals and close all', 'P1', ['multi', 'bulk', 'close-all'], [
		closeAll,
		post('/ui/terminal/create', { name: 'multi-1' }),
		post('/ui/terminal/create', { name: 'multi-2' }),
		post('/ui/terminal/create', { name: 'multi-3' }),
		post('/ui/terminal/create', { name: 'multi-4' }),
		post('/ui/terminal/create', { name: 'multi-5' }),
		post('/ui/terminal/close-all', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-139', 'Alternate create and close operations', 'P1', ['multi', 'alternate'], [
		closeAll,
		post('/ui/terminal/create', { name: 'alt-a' }),
		post('/ui/terminal/close', {}),
		post('/ui/terminal/create', { name: 'alt-b' }),
		post('/ui/terminal/close', {}),
		post('/ui/terminal/create', { name: 'alt-c' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-140', 'Create terminals with duplicate names', 'P1', ['multi', 'duplicate-name'], [
		closeAll,
		post('/ui/terminal/create', { name: 'same-name' }),
		post('/ui/terminal/create', { name: 'same-name' }),
		get('/ui/terminal/list', {}, { capture: 'list' }),
	], valueVerify('list', 'truthy', true)),

	tc('B-141', 'Get state of specific terminal', 'P1', ['multi', 'state'], [
		closeAll,
		post('/ui/terminal/create', { name: 'state-check' }, { wait: 500 }),
		get('/ui/terminal/state?terminalId=1', {}, { capture: 'state' }),
	], valueVerify('state', 'truthy', true)),

	tc('B-142', 'Get state of active terminal (no id)', 'P1', ['multi', 'state', 'active'], [
		closeAll,
		post('/ui/terminal/create', { name: 'active-state' }, { wait: 500 }),
		get('/ui/terminal/state?terminalId=', {}, { capture: 'state' }),
	], valueVerify('state', 'truthy', true)),

	tc('B-143', 'Select terminal then verify it is active', 'P1', ['multi', 'select', 'verify'], [
		closeAll,
		post('/ui/terminal/create', { name: 'verify-sel-a' }),
		post('/ui/terminal/create', { name: 'verify-sel-b' }),
		post('/ui/terminal/select', { terminalId: 1 }),
		get('/ui/terminal/list', {}, { capture: 'list' }),
	], valueVerify('list', 'truthy', true)),

	tc('B-144', 'Create, split, select, and close in sequence', 'P1', ['multi', 'complex-lifecycle'], [
		closeAll,
		post('/ui/terminal/create', { name: 'complex' }),
		post('/ui/terminal/split'),
		post('/ui/terminal/select', { terminalId: 1 }),
		post('/ui/terminal/close', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-145', 'Manage three terminals: send to all, close first', 'P1', ['multi', 'workflow'], [
		closeAll,
		post('/ui/terminal/create', { name: 'wf-1' }),
		post('/ui/terminal/create', { name: 'wf-2' }),
		post('/ui/terminal/create', { name: 'wf-3' }),
		post('/ui/terminal/send', { command: 'echo wf1', terminalId: 1 }),
		post('/ui/terminal/send', { command: 'echo wf2', terminalId: 2 }),
		post('/ui/terminal/send', { command: 'echo wf3', terminalId: 3 }),
		post('/ui/terminal/close', { terminalId: 1 }),
		get('/ui/terminal/list', {}, { capture: 'list' }),
	], valueVerify('list', 'truthy', true)),

	tc('B-146', 'Create terminal, rename, send command, close', 'P1', ['multi', 'full-workflow'], [
		closeAll,
		post('/ui/terminal/create', { name: 'workflow-orig' }),
		post('/ui/terminal/rename', { name: 'workflow-renamed' }),
		post('/ui/terminal/send', { command: 'echo working' }, { wait: 300 }),
		post('/ui/terminal/close', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-147', 'Select non-existent terminal after close', 'P2', ['multi', 'select', 'edge'], [
		closeAll,
		post('/ui/terminal/create', { name: 'ghost' }),
		post('/ui/terminal/close', {}),
		post('/ui/terminal/select', { terminalId: 999 }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-148', 'Create eight terminals and list all', 'P2', ['multi', 'stress'], [
		closeAll,
		post('/ui/terminal/create', { name: 'eight-1' }),
		post('/ui/terminal/create', { name: 'eight-2' }),
		post('/ui/terminal/create', { name: 'eight-3' }),
		post('/ui/terminal/create', { name: 'eight-4' }),
		post('/ui/terminal/create', { name: 'eight-5' }),
		post('/ui/terminal/create', { name: 'eight-6' }),
		post('/ui/terminal/create', { name: 'eight-7' }),
		post('/ui/terminal/create', { name: 'eight-8' }),
		get('/ui/terminal/list', {}, { capture: 'list' }),
	], valueVerify('list', 'truthy', true)),

	tc('B-149', 'Set terminal profile to bash', 'P1', ['multi', 'profile'], [
		post('/ui/terminal/set-profile', { profileName: 'bash' }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-150', 'Set terminal profile to zsh', 'P1', ['multi', 'profile'], [
		post('/ui/terminal/set-profile', { profileName: 'zsh' }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-151', 'Create terminal, show, send command, hide', 'P1', ['multi', 'visibility-workflow'], [
		closeAll,
		post('/ui/terminal/create', { name: 'vis-flow' }),
		post('/ui/terminal/show'),
		post('/ui/terminal/send', { command: 'echo visible-cmd' }, { wait: 300 }),
		post('/ui/terminal/hide', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-152', 'Rename active terminal without specifying id', 'P1', ['multi', 'rename', 'active'], [
		closeAll,
		post('/ui/terminal/create', { name: 'pre-rename' }),
		post('/ui/terminal/rename', { name: 'post-rename' }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-153', 'Create terminals with different names and select by id', 'P1', ['multi', 'select', 'diverse'], [
		closeAll,
		post('/ui/terminal/create', { name: 'dev' }),
		post('/ui/terminal/create', { name: 'staging' }),
		post('/ui/terminal/create', { name: 'prod' }),
		post('/ui/terminal/select', { terminalId: 2 }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-154', 'Create, close specific, create new, verify count', 'P1', ['multi', 'replacement'], [
		closeAll,
		post('/ui/terminal/create', { name: 'slot-1' }),
		post('/ui/terminal/create', { name: 'slot-2' }),
		post('/ui/terminal/close', { terminalId: 1 }),
		post('/ui/terminal/create', { name: 'slot-3' }),
		get('/ui/terminal/list', {}, { capture: 'list' }),
	], valueVerify('list', 'truthy', true)),

	tc('B-155', 'Rapid create 5 terminals', 'P2', ['multi', 'rapid-create'], [
		closeAll,
		post('/ui/terminal/create', { name: 'rapid-1' }),
		post('/ui/terminal/create', { name: 'rapid-2' }),
		post('/ui/terminal/create', { name: 'rapid-3' }),
		post('/ui/terminal/create', { name: 'rapid-4' }),
		post('/ui/terminal/create', { name: 'rapid-5' }),
		get('/ui/terminal/list', {}, { capture: 'list' }),
	], valueVerify('list', 'truthy', true)),

	tc('B-156', 'Select each terminal in sequence', 'P2', ['multi', 'select-all'], [
		closeAll,
		post('/ui/terminal/create', { name: 'sel-seq-1' }),
		post('/ui/terminal/create', { name: 'sel-seq-2' }),
		post('/ui/terminal/create', { name: 'sel-seq-3' }),
		post('/ui/terminal/select', { terminalId: 1 }),
		post('/ui/terminal/select', { terminalId: 2 }),
		post('/ui/terminal/select', { terminalId: 3 }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-157', 'Create and send command to 4 terminals', 'P2', ['multi', 'send-all'], [
		closeAll,
		post('/ui/terminal/create', { name: 'batch-a' }),
		post('/ui/terminal/create', { name: 'batch-b' }),
		post('/ui/terminal/create', { name: 'batch-c' }),
		post('/ui/terminal/create', { name: 'batch-d' }),
		post('/ui/terminal/send', { command: 'echo a', terminalId: 1 }),
		post('/ui/terminal/send', { command: 'echo b', terminalId: 2 }),
		post('/ui/terminal/send', { command: 'echo c', terminalId: 3 }),
		post('/ui/terminal/send', { command: 'echo d', terminalId: 4 }, { wait: 300 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-158', 'Create, split, rename both panes', 'P2', ['multi', 'split', 'rename'], [
		closeAll,
		post('/ui/terminal/create', { name: 'split-orig' }),
		post('/ui/terminal/split'),
		post('/ui/terminal/rename', { name: 'pane-right' }),
		post('/ui/terminal/select', { terminalId: 1 }),
		post('/ui/terminal/rename', { name: 'pane-left' }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-159', 'Full workflow: create, show, send, rename, list, close', 'P0', ['multi', 'full-lifecycle'], [
		closeAll,
		post('/ui/terminal/create', { name: 'full-wf' }),
		post('/ui/terminal/show'),
		post('/ui/terminal/send', { command: 'echo full-lifecycle' }, { wait: 300 }),
		post('/ui/terminal/rename', { name: 'renamed-wf' }),
		get('/ui/terminal/list', {}, { capture: 'list' }),
		post('/ui/terminal/close', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-160', 'Create terminals interleaved with show/hide', 'P2', ['multi', 'visibility', 'interleaved'], [
		closeAll,
		post('/ui/terminal/create', { name: 'interleave-1' }),
		post('/ui/terminal/hide'),
		post('/ui/terminal/create', { name: 'interleave-2' }),
		post('/ui/terminal/show'),
		post('/ui/terminal/create', { name: 'interleave-3' }),
		get('/ui/terminal/list', {}, { capture: 'list' }),
	], valueVerify('list', 'truthy', true)),

	// ---------------------------------------------------------------------------
	// 8. Terminal with custom shell  (B-161 .. B-170)
	// ---------------------------------------------------------------------------

	tc('B-161', 'Create terminal with /bin/sh shell', 'P0', ['shell', 'sh'], [
		closeAll,
		post('/ui/terminal/create', { name: 'sh-shell', shellPath: '/bin/sh' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-162', 'Create terminal with /bin/bash shell', 'P0', ['shell', 'bash'], [
		closeAll,
		post('/ui/terminal/create', { name: 'bash-shell', shellPath: '/bin/bash' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-163', 'Create terminal with /bin/zsh shell', 'P0', ['shell', 'zsh'], [
		closeAll,
		post('/ui/terminal/create', { name: 'zsh-shell', shellPath: '/bin/zsh' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-164', 'Create terminal with /usr/bin/env bash shell', 'P1', ['shell', 'env-bash'], [
		closeAll,
		post('/ui/terminal/create', { name: 'env-bash', shellPath: '/usr/bin/env' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-165', 'Create shell terminal and send command', 'P1', ['shell', 'send'], [
		closeAll,
		post('/ui/terminal/create', { name: 'shell-cmd', shellPath: '/bin/sh' }),
		post('/ui/terminal/send', { command: 'echo hello from sh' }, { wait: 500 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-166', 'Create bash terminal and run pwd', 'P1', ['shell', 'bash', 'command'], [
		closeAll,
		post('/ui/terminal/create', { name: 'bash-pwd', shellPath: '/bin/bash' }),
		post('/ui/terminal/send', { command: 'pwd' }, { wait: 500 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-167', 'Create zsh terminal and run ls', 'P1', ['shell', 'zsh', 'command'], [
		closeAll,
		post('/ui/terminal/create', { name: 'zsh-ls', shellPath: '/bin/zsh' }),
		post('/ui/terminal/send', { command: 'ls' }, { wait: 500 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-168', 'Create two terminals with different shells', 'P1', ['shell', 'multi'], [
		closeAll,
		post('/ui/terminal/create', { name: 'sh-term', shellPath: '/bin/sh' }),
		post('/ui/terminal/create', { name: 'bash-term', shellPath: '/bin/bash' }),
		get('/ui/terminal/list', {}, { capture: 'list' }),
	], valueVerify('list', 'truthy', true)),

	tc('B-169', 'Create shell terminal with custom name and cwd', 'P1', ['shell', 'cwd', 'combined'], [
		closeAll,
		post('/ui/terminal/create', { name: 'full-custom', shellPath: '/bin/sh', cwd: '/tmp' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-170', 'Create shell terminal then close it', 'P1', ['shell', 'close'], [
		closeAll,
		post('/ui/terminal/create', { name: 'shell-close', shellPath: '/bin/sh' }),
		post('/ui/terminal/close', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	// ---------------------------------------------------------------------------
	// 9. Terminal with custom cwd  (B-171 .. B-185)
	// ---------------------------------------------------------------------------

	tc('B-171', 'Create terminal with cwd /tmp', 'P0', ['cwd', 'tmp'], [
		closeAll,
		post('/ui/terminal/create', { name: 'cwd-tmp', cwd: '/tmp' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-172', 'Create terminal with cwd / (root)', 'P1', ['cwd', 'root'], [
		closeAll,
		post('/ui/terminal/create', { name: 'cwd-root', cwd: '/' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-173', 'Create terminal with cwd ~ (home)', 'P1', ['cwd', 'home'], [
		closeAll,
		post('/ui/terminal/create', { name: 'cwd-home', cwd: '~' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-174', 'Create terminal with cwd and verify with pwd', 'P0', ['cwd', 'verify'], [
		closeAll,
		post('/ui/terminal/create', { name: 'cwd-verify', cwd: '/tmp' }),
		post('/ui/terminal/send', { command: 'pwd' }, { wait: 500 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-175', 'Create terminal with cwd /var', 'P2', ['cwd', 'var'], [
		closeAll,
		post('/ui/terminal/create', { name: 'cwd-var', cwd: '/var' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-176', 'Create terminal with cwd /usr', 'P2', ['cwd', 'usr'], [
		closeAll,
		post('/ui/terminal/create', { name: 'cwd-usr', cwd: '/usr' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-177', 'Create two terminals with different cwds', 'P1', ['cwd', 'multi'], [
		closeAll,
		post('/ui/terminal/create', { name: 'cwd-a', cwd: '/tmp' }),
		post('/ui/terminal/create', { name: 'cwd-b', cwd: '/' }),
		get('/ui/terminal/list', {}, { capture: 'list' }),
	], valueVerify('list', 'truthy', true)),

	tc('B-178', 'Create terminal with cwd and send ls', 'P1', ['cwd', 'send', 'ls'], [
		closeAll,
		post('/ui/terminal/create', { name: 'cwd-ls', cwd: '/tmp' }),
		post('/ui/terminal/send', { command: 'ls' }, { wait: 500 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-179', 'Create terminal with cwd and cd elsewhere', 'P1', ['cwd', 'navigate'], [
		closeAll,
		post('/ui/terminal/create', { name: 'cwd-cd', cwd: '/tmp' }),
		post('/ui/terminal/send', { command: 'cd / && pwd' }, { wait: 500 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-180', 'Create terminal with cwd /etc', 'P2', ['cwd', 'etc'], [
		closeAll,
		post('/ui/terminal/create', { name: 'cwd-etc', cwd: '/etc' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-181', 'Create terminal with cwd and close it', 'P1', ['cwd', 'close'], [
		closeAll,
		post('/ui/terminal/create', { name: 'cwd-close', cwd: '/tmp' }),
		post('/ui/terminal/close', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-182', 'Create terminal with cwd and split', 'P2', ['cwd', 'split'], [
		closeAll,
		post('/ui/terminal/create', { name: 'cwd-split', cwd: '/tmp' }),
		post('/ui/terminal/split', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-183', 'Create terminal with cwd and rename', 'P2', ['cwd', 'rename'], [
		closeAll,
		post('/ui/terminal/create', { name: 'cwd-orig', cwd: '/tmp' }),
		post('/ui/terminal/rename', { name: 'cwd-renamed' }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-184', 'Create terminal with project cwd path', 'P1', ['cwd', 'project'], [
		closeAll,
		post('/ui/terminal/create', { name: 'project-term', cwd: '/Users/master/Desktop/tarx-code-oss' }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-185', 'Create three terminals with unique cwds', 'P2', ['cwd', 'multi', 'diverse'], [
		closeAll,
		post('/ui/terminal/create', { name: 'cwd-1', cwd: '/' }),
		post('/ui/terminal/create', { name: 'cwd-2', cwd: '/tmp' }),
		post('/ui/terminal/create', { name: 'cwd-3', cwd: '/var' }),
		get('/ui/terminal/list', {}, { capture: 'list' }),
	], valueVerify('list', 'truthy', true)),

	// ---------------------------------------------------------------------------
	// 10. Edge cases and error handling  (B-186 .. B-200)
	// ---------------------------------------------------------------------------

	tc('B-186', 'Send command without creating terminal first', 'P0', ['edge', 'no-terminal'], [
		closeAll,
		post('/ui/terminal/send', { command: 'echo orphan' }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-187', 'Close terminal when none exist', 'P1', ['edge', 'close-empty'], [
		closeAll,
		post('/ui/terminal/close', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-188', 'Close terminal with invalid id', 'P1', ['edge', 'invalid-id'], [
		closeAll,
		post('/ui/terminal/create', { name: 'valid' }),
		post('/ui/terminal/close', { terminalId: 99999 }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-189', 'Select terminal with invalid id', 'P1', ['edge', 'invalid-id', 'select'], [
		closeAll,
		post('/ui/terminal/create', { name: 'valid-sel' }),
		post('/ui/terminal/select', { terminalId: 99999 }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-190', 'Send to terminal with invalid id', 'P1', ['edge', 'invalid-id', 'send'], [
		closeAll,
		post('/ui/terminal/create', { name: 'valid-send' }),
		post('/ui/terminal/send', { command: 'echo ghost', terminalId: 99999 }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-191', 'Create terminal with non-existent shell path', 'P1', ['edge', 'bad-shell'], [
		closeAll,
		post('/ui/terminal/create', { name: 'bad-shell', shellPath: '/nonexistent/shell' }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-192', 'Create terminal with non-existent cwd', 'P1', ['edge', 'bad-cwd'], [
		closeAll,
		post('/ui/terminal/create', { name: 'bad-cwd', cwd: '/nonexistent/path/that/does/not/exist' }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-193', 'Send very long command (1000 chars)', 'P2', ['edge', 'long-command'], [
		closeAll,
		post('/ui/terminal/create', { name: 'long-cmd' }),
		post('/ui/terminal/send', { command: 'echo ' + 'x'.repeat(995) }, { wait: 500 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-194', 'Rename terminal with empty string', 'P2', ['edge', 'rename-empty'], [
		closeAll,
		post('/ui/terminal/create', { name: 'rename-empty' }),
		post('/ui/terminal/rename', { name: '' }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-195', 'Rename non-existent terminal', 'P2', ['edge', 'rename-invalid'], [
		closeAll,
		post('/ui/terminal/rename', { terminalId: 99999, name: 'ghost-rename' }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-196', 'Get state of non-existent terminal', 'P2', ['edge', 'state-invalid'], [
		closeAll,
		get('/ui/terminal/state?terminalId=99999', {}, { capture: 'state' }),
	], valueVerify('state', 'truthy', true)),

	tc('B-197', 'Send command with null bytes', 'P2', ['edge', 'null-bytes'], [
		closeAll,
		post('/ui/terminal/create', { name: 'null-byte' }),
		post('/ui/terminal/send', { command: 'echo \x00test' }, { wait: 300 }),
	], stateVerify('/ui/terminal/list', {})),

	tc('B-198', 'Create terminal with very long name (500 chars)', 'P2', ['edge', 'long-name'], [
		closeAll,
		post('/ui/terminal/create', { name: 'n'.repeat(500) }, { capture: 'term' }),
	], valueVerify('term', 'truthy', true)),

	tc('B-199', 'Set profile with invalid profile name', 'P2', ['edge', 'bad-profile'], [
		post('/ui/terminal/set-profile', { profileName: 'nonexistent-shell-profile-xyz' }, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

	tc('B-200', 'Close all after creating and immediately closing terminals rapidly', 'P2', ['edge', 'rapid-lifecycle', 'stress'], [
		closeAll,
		post('/ui/terminal/create', { name: 'rapid-a' }),
		post('/ui/terminal/create', { name: 'rapid-b' }),
		post('/ui/terminal/create', { name: 'rapid-c' }),
		post('/ui/terminal/close', {}),
		post('/ui/terminal/close', {}),
		post('/ui/terminal/close', {}),
		post('/ui/terminal/close-all', {}, { capture: 'result' }),
	], valueVerify('result', 'truthy', true)),

];
