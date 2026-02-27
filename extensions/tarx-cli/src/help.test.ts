/**
 * Tests for --help / -h / help flag handling.
 *
 * Verifies:
 *   1. All aliases (--help, -h, help) exit 0 and show usage
 *   2. Help output contains all four command sections
 *   3. Each section lists its expected commands
 *   4. Banner and version string are present
 *   5. Unknown commands still exit 1
 *   6. Edge cases: extra args after help, mixed flags
 *
 * Run: cd extensions/tarx-cli && npx tsc && node --test dist/help.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { resolve } from 'path';

const CLI_ENTRY = resolve(__dirname, 'index.js');

function run(args: string): { stdout: string; exitCode: number } {
	try {
		const stdout = execSync(`node ${CLI_ENTRY} ${args} 2>&1`, {
			encoding: 'utf-8',
			timeout: 10000,
			stdio: 'pipe',
			env: { ...process.env, NO_COLOR: '1' },
		}).trim();
		return { stdout, exitCode: 0 };
	} catch (e: any) {
		return {
			stdout: (e.stdout || e.stderr || e.message || '').toString().trim(),
			exitCode: e.status ?? 1,
		};
	}
}

// Strip ANSI escape codes for cleaner assertions
function strip(s: string): string {
	return s.replace(/\x1b\[[0-9;]*m/g, '');
}

// ─── All help aliases exit 0 and show usage ─────────────

const HELP_ALIASES = ['--help', '-h', 'help'];

describe('help aliases', () => {
	for (const flag of HELP_ALIASES) {
		it(`"tarx ${flag}" exits with code 0`, () => {
			const { exitCode } = run(flag);
			assert.equal(exitCode, 0, `Expected exit code 0 for "${flag}", got ${exitCode}`);
		});

		it(`"tarx ${flag}" shows Usage line`, () => {
			const { stdout } = run(flag);
			assert.match(stdout, /usage.*tarx/i, `Expected "Usage: tarx" in output for "${flag}"`);
		});

		it(`"tarx ${flag}" does not say Unknown command`, () => {
			const { stdout } = run(flag);
			assert.doesNotMatch(stdout, /unknown command/i, `Should not print "Unknown command" for "${flag}"`);
		});
	}

	it('all aliases produce identical content (stripped of ANSI)', () => {
		const outputs = HELP_ALIASES.map(f => strip(run(f).stdout));
		assert.equal(outputs[0], outputs[1], '--help and -h differ');
		assert.equal(outputs[1], outputs[2], '-h and help differ');
	});
});

// ─── Banner & version ───────────────────────────────────

describe('banner and version', () => {
	const { stdout } = run('--help');
	const clean = strip(stdout);

	it('shows the TARX ASCII banner', () => {
		assert.match(clean, /TARX|T A R X|▀█▀/, 'Expected TARX branding in banner');
	});

	it('shows CLI version string', () => {
		assert.match(clean, /v\d+\.\d+\.\d+/, 'Expected version like v1.2.0');
	});
});

// ─── Four command sections ──────────────────────────────

describe('command sections', () => {
	const { stdout } = run('--help');
	const clean = strip(stdout);

	const SECTIONS = ['Core', 'Build', 'X / Social', 'System'];

	for (const section of SECTIONS) {
		it(`contains "${section}" section`, () => {
			assert.match(clean, new RegExp(section, 'i'), `Missing "${section}" section`);
		});
	}
});

// ─── Core section commands ──────────────────────────────

describe('Core section commands', () => {
	const { stdout } = run('--help');
	const clean = strip(stdout);

	const CORE_CMDS = ['status', 'chat', 'search', 'brief', 'priorities', 'mesh', 'update'];

	for (const cmd of CORE_CMDS) {
		it(`lists "${cmd}" command`, () => {
			assert.match(clean, new RegExp(cmd), `Expected "${cmd}" in Core section`);
		});
	}
});

// ─── Build section commands ─────────────────────────────

describe('Build section commands', () => {
	const { stdout } = run('--help');
	const clean = strip(stdout);

	const BUILD_CMDS = ['build', 'refactor', 'fix', 'test', 'document', 'plan'];

	for (const cmd of BUILD_CMDS) {
		it(`lists "${cmd}" command`, () => {
			assert.match(clean, new RegExp(cmd), `Expected "${cmd}" in Build section`);
		});
	}
});

// ─── X / Social section commands ────────────────────────

describe('X / Social section commands', () => {
	const { stdout } = run('--help');
	const clean = strip(stdout);

	const X_CMDS = ['tweet', 'timeline', 'xsearch', 'xstatus', 'xai'];

	for (const cmd of X_CMDS) {
		it(`lists "${cmd}" command`, () => {
			assert.match(clean, new RegExp(cmd), `Expected "${cmd}" in X / Social section`);
		});
	}
});

// ─── System section commands ────────────────────────────

describe('System section commands', () => {
	const { stdout } = run('--help');
	const clean = strip(stdout);

	const SYS_CMDS = ['dispatch', 'heal', 'log', 'think', 'wake', 'notify', 'taxonomy', 'strategy'];

	for (const cmd of SYS_CMDS) {
		it(`lists "${cmd}" command`, () => {
			assert.match(clean, new RegExp(cmd), `Expected "${cmd}" in System section`);
		});
	}
});

// ─── Command descriptions ───────────────────────────────

describe('command descriptions', () => {
	const { stdout } = run('--help');
	const clean = strip(stdout);

	const DESCRIPTIONS = [
		'Health check',
		'Claude Code',
		'Search local knowledge',
		'Self-healing',
		'Send prompt',
	];

	for (const desc of DESCRIPTIONS) {
		it(`includes description "${desc}"`, () => {
			assert.match(clean, new RegExp(desc, 'i'), `Expected description "${desc}"`);
		});
	}
});

// ─── Unknown commands still fail ────────────────────────

describe('unknown commands exit 1', () => {
	it('"tarx nonexistent" exits with code 1', () => {
		const { exitCode } = run('nonexistent');
		assert.equal(exitCode, 1);
	});

	it('"tarx nonexistent" prints Unknown command', () => {
		const { stdout } = run('nonexistent');
		assert.match(stdout, /unknown command/i);
	});

	it('"tarx nonexistent" suggests --help', () => {
		const { stdout } = run('nonexistent');
		assert.match(stdout, /--help/, 'Should suggest running --help');
	});
});

// ─── Per-command help (tarx <cmd> --help) ───────────────

describe('per-command help', () => {
	it('"tarx brief --help" exits 0 and shows brief details', () => {
		const { exitCode, stdout } = run('brief --help');
		assert.equal(exitCode, 0);
		const clean = strip(stdout);
		assert.match(clean, /brief/i);
		assert.match(clean, /usage/i);
	});

	it('"tarx priorities -h" exits 0 and shows subcommands', () => {
		const { exitCode, stdout } = run('priorities -h');
		assert.equal(exitCode, 0);
		const clean = strip(stdout);
		assert.match(clean, /priorities/i);
		assert.match(clean, /add/i);
		assert.match(clean, /done/i);
	});

	it('"tarx notify --help" exits 0 and shows flags', () => {
		const { exitCode, stdout } = run('notify --help');
		assert.equal(exitCode, 0);
		const clean = strip(stdout);
		assert.match(clean, /notify/i);
		assert.match(clean, /--level/i);
		assert.match(clean, /--check/i);
	});

	it('"tarx xai --help" shows examples', () => {
		const { exitCode, stdout } = run('xai --help');
		assert.equal(exitCode, 0);
		const clean = strip(stdout);
		assert.match(clean, /xai/i);
		assert.match(clean, /--model/i);
		assert.match(clean, /examples/i);
	});

	it('unknown command with --help falls back to general help', () => {
		const { exitCode, stdout } = run('nonexistent --help');
		assert.equal(exitCode, 0);
		assert.match(stdout, /usage.*tarx/i);
	});
});

// ─── Edge cases ─────────────────────────────────────────

describe('edge cases', () => {
	it('"tarx --help extra-arg" still shows help (exit 0)', () => {
		// --help is checked before the switch, extra args are ignored
		const { exitCode, stdout } = run('--help extra-arg');
		assert.equal(exitCode, 0);
		assert.match(stdout, /usage.*tarx/i);
	});

	it('"tarx help build" still shows general help (exit 0)', () => {
		const { exitCode, stdout } = run('help build');
		assert.equal(exitCode, 0);
		assert.match(stdout, /usage.*tarx/i);
	});

	it('help output is non-trivial (> 20 lines)', () => {
		const { stdout } = run('--help');
		const lineCount = stdout.split('\n').length;
		assert.ok(lineCount > 20, `Expected >20 lines, got ${lineCount}`);
	});
});
