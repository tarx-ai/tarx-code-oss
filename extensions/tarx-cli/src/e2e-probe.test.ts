/**
 * Tests for --e2e-probe flag.
 *
 * The --e2e-probe flag is used by the heartbeat daemon to verify that
 * CC use-case commands (build, refactor, fix, test, document, plan)
 * are routed correctly without actually dispatching to Claude Code.
 *
 * Run: cd extensions/tarx-cli && npx tsc && node --test dist/e2e-probe.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const CLI_ENTRY = resolve(__dirname, 'index.js');
const CC_USE_CASES = ['build', 'refactor', 'fix', 'test', 'document', 'plan'] as const;

/** Run CLI command, filter out dotenv noise, return clean output + exit code */
function run(args: string): { stdout: string; exitCode: number } {
	try {
		const raw = execSync(`node ${CLI_ENTRY} ${args} 2>&1`, {
			encoding: 'utf-8',
			timeout: 10000,
			stdio: 'pipe',
		}).trim();
		return { stdout: filterNoise(raw), exitCode: 0 };
	} catch (e: any) {
		const raw = (e.stdout || e.stderr || e.message || '').toString().trim();
		return { stdout: filterNoise(raw), exitCode: e.status ?? 1 };
	}
}

/** Strip dotenv debug lines and ANSI escape codes from output */
function filterNoise(output: string): string {
	return output
		.split('\n')
		.filter(line => !line.startsWith('[dotenv'))
		.join('\n')
		.replace(/\x1b\[[0-9;]*m/g, '')
		.trim();
}

// ─── Prerequisite: compiled CLI exists ───

describe('CLI entry point', () => {
	it('index.js exists (CLI is compiled)', () => {
		assert.ok(existsSync(CLI_ENTRY), `Expected ${CLI_ENTRY} to exist`);
	});
});

// ─── Static analysis: every CC use case has a case statement ───

describe('CC use-case case statements', () => {
	const source = existsSync(CLI_ENTRY) ? readFileSync(CLI_ENTRY, 'utf-8') : '';

	for (const cmd of CC_USE_CASES) {
		it(`case '${cmd}' exists in index.js`, () => {
			assert.ok(source.includes(`case '${cmd}'`), `Missing case '${cmd}' in CLI`);
		});
	}
});

// ─── Static analysis: --e2e-probe handler exists ───

describe('--e2e-probe handler present', () => {
	const source = existsSync(CLI_ENTRY) ? readFileSync(CLI_ENTRY, 'utf-8') : '';

	it('index.js contains --e2e-probe check', () => {
		assert.ok(source.includes('e2e-probe'), 'Expected --e2e-probe handling in index.js');
	});

	it('index.js contains "routed OK" response string', () => {
		assert.ok(source.includes('routed OK'), 'Expected "routed OK" response string');
	});
});

// ─── Static analysis: unknown commands have no case statements ───

describe('unknown commands are not routed (static)', () => {
	const source = existsSync(CLI_ENTRY) ? readFileSync(CLI_ENTRY, 'utf-8') : '';

	for (const fake of ['nonexistent', 'fakecmd', 'deploy', 'publish']) {
		it(`case '${fake}' does not exist in index.js`, () => {
			assert.ok(!source.includes(`case '${fake}'`), `Unexpected case '${fake}' in CLI`);
		});
	}
});

// ─── E2E: --e2e-probe short-circuits without dispatching ───

describe('--e2e-probe routing', () => {
	for (const cmd of CC_USE_CASES) {
		it(`${cmd} --e2e-probe outputs "${cmd}: routed OK"`, () => {
			const { stdout } = run(`${cmd} --e2e-probe`);
			assert.ok(
				stdout.includes(`${cmd}: routed OK`),
				`Expected "${cmd}: routed OK", got: ${stdout.slice(0, 200)}`
			);
		});
	}
});

describe('--e2e-probe does not dispatch', () => {
	for (const cmd of CC_USE_CASES) {
		it(`${cmd} --e2e-probe does not trigger dispatch`, () => {
			const { stdout } = run(`${cmd} --e2e-probe`);
			assert.ok(!stdout.includes('Dispatching'), `${cmd} should not dispatch`);
			assert.ok(!stdout.includes('Running '), `${cmd} should not show spinner`);
			assert.ok(!/---.*OK|FAILED/.test(stdout), `${cmd} should not show result banner`);
		});
	}
});

describe('--e2e-probe exits cleanly', () => {
	for (const cmd of CC_USE_CASES) {
		it(`${cmd} --e2e-probe exits with code 0`, () => {
			const { exitCode } = run(`${cmd} --e2e-probe`);
			assert.equal(exitCode, 0, `${cmd} --e2e-probe should exit 0`);
		});
	}
});

// ─── E2E: --e2e-probe output is exactly one line ───

describe('--e2e-probe output is clean', () => {
	for (const cmd of CC_USE_CASES) {
		it(`${cmd} --e2e-probe outputs exactly one line`, () => {
			const { stdout } = run(`${cmd} --e2e-probe`);
			const lines = stdout.split('\n');
			assert.equal(lines.length, 1, `Expected 1 line, got ${lines.length}: ${JSON.stringify(lines)}`);
		});
	}

	for (const cmd of CC_USE_CASES) {
		it(`${cmd} --e2e-probe output matches exact format`, () => {
			const { stdout } = run(`${cmd} --e2e-probe`);
			assert.equal(stdout, `${cmd}: routed OK`);
		});
	}
});

// ─── E2E: --e2e-probe works regardless of position in args ───

describe('--e2e-probe arg position', () => {
	it('build --e2e-probe extra-arg still short-circuits', () => {
		const { stdout } = run('build --e2e-probe some-extra-arg');
		assert.ok(stdout.includes('build: routed OK'));
	});

	it('fix something --e2e-probe (non-first position) triggers', () => {
		const { stdout } = run('fix something --e2e-probe');
		assert.ok(stdout.includes('fix: routed OK'));
	});

	it('plan --e2e-probe --verbose still short-circuits', () => {
		const { stdout } = run('plan --e2e-probe --verbose');
		assert.ok(stdout.includes('plan: routed OK'));
	});

	it('refactor --e2e-probe foo bar baz still short-circuits', () => {
		const { stdout } = run('refactor --e2e-probe foo bar baz');
		assert.ok(stdout.includes('refactor: routed OK'));
	});

	it('document target --e2e-probe extra still short-circuits', () => {
		const { stdout } = run('document target --e2e-probe extra');
		assert.ok(stdout.includes('document: routed OK'));
	});

	it('test unit integration --e2e-probe (at end) triggers', () => {
		const { stdout } = run('test unit integration --e2e-probe');
		assert.ok(stdout.includes('test: routed OK'));
	});
});

// ─── E2E: unknown commands with --e2e-probe ───

describe('unknown commands reject --e2e-probe', () => {
	it('nonexistent --e2e-probe shows Unknown command', () => {
		const { stdout, exitCode } = run('nonexistent --e2e-probe');
		assert.match(stdout, /unknown command/i);
		assert.equal(exitCode, 1);
	});

	it('deploy --e2e-probe shows Unknown command', () => {
		const { stdout, exitCode } = run('deploy --e2e-probe');
		assert.match(stdout, /unknown command/i);
		assert.equal(exitCode, 1);
	});

	it('unknown --e2e-probe never prints "routed OK"', () => {
		const { stdout } = run('unknowncmd --e2e-probe');
		assert.ok(!stdout.includes('routed OK'));
	});
});

// ─── E2E: unknown commands without --e2e-probe ───

describe('unknown commands exit with error', () => {
	for (const fake of ['nonexistent', 'fakecmd']) {
		it(`${fake} exits with code 1`, () => {
			const { exitCode } = run(fake);
			assert.equal(exitCode, 1);
		});

		it(`${fake} output contains "Unknown command"`, () => {
			const { stdout } = run(fake);
			assert.match(stdout, /unknown command/i);
		});
	}
});

// ─── Without --e2e-probe: normal execution path ───

describe('without --e2e-probe, commands do not short-circuit', () => {
	for (const cmd of CC_USE_CASES) {
		it(`${cmd} --help does not print "routed OK"`, () => {
			const { stdout } = run(`${cmd} --help`);
			assert.ok(!stdout.includes('routed OK'), `${cmd} should not short-circuit without --e2e-probe`);
		});
	}
});

// ─── Heartbeat parity: no "Unknown command" for CC use cases ───

describe('heartbeat parity', () => {
	for (const cmd of CC_USE_CASES) {
		it(`${cmd} --e2e-probe does not produce "Unknown command"`, () => {
			const { stdout } = run(`${cmd} --e2e-probe`);
			assert.ok(!/unknown command/i.test(stdout), `${cmd} must be routed, not unknown`);
		});
	}
});

// ─── --e2e-probe: performance ───

describe('--e2e-probe performance', () => {
	it('all 6 probe commands complete within 5 seconds total', () => {
		const start = Date.now();
		for (const cmd of CC_USE_CASES) {
			run(`${cmd} --e2e-probe`);
		}
		const elapsed = Date.now() - start;
		assert.ok(elapsed < 5000, `All 6 probes took ${elapsed}ms — should be <5s`);
	});

	it('no "error" in any probe output', () => {
		for (const cmd of CC_USE_CASES) {
			const { stdout } = run(`${cmd} --e2e-probe`);
			assert.ok(!/\berror\b/i.test(stdout), `${cmd} output contained "error": ${stdout}`);
		}
	});
});

// ─── --e2e-probe: case sensitivity ───

describe('--e2e-probe flag is case-sensitive', () => {
	it('build --E2E-PROBE does not short-circuit', () => {
		const { stdout } = run('build --E2E-PROBE');
		assert.ok(!stdout.includes('routed OK'), 'Uppercase flag should not trigger probe');
	});

	it('build --E2e-Probe does not short-circuit', () => {
		const { stdout } = run('build --E2e-Probe');
		assert.ok(!stdout.includes('routed OK'), 'Mixed-case flag should not trigger probe');
	});
});

// ─── Similar flags don't trigger ───

describe('similar flags do not trigger --e2e-probe', () => {
	it('build --e2e-probex does not short-circuit', () => {
		const { stdout } = run('build --e2e-probex');
		assert.ok(!stdout.includes('routed OK'), 'Extra suffix should not trigger probe');
	});

	it('build --e2e does not short-circuit', () => {
		const { stdout } = run('build --e2e');
		assert.ok(!stdout.includes('routed OK'), 'Partial flag should not trigger probe');
	});

	it('build --probe does not short-circuit', () => {
		const { stdout } = run('build --probe');
		assert.ok(!stdout.includes('routed OK'), 'Partial flag should not trigger probe');
	});
});

// ─── Bare invocation ───

describe('bare invocation', () => {
	it('tarx with no args exits 0 (greeting)', () => {
		const { exitCode } = run('');
		assert.equal(exitCode, 0);
	});

	it('--e2e-probe alone is treated as unknown command', () => {
		const { stdout, exitCode } = run('--e2e-probe');
		assert.equal(exitCode, 1);
		assert.match(stdout, /unknown command/i);
	});
});
