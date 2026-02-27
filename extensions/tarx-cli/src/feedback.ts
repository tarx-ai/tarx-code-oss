/**
 * TARX CLI — Feedback engine.
 * Spinners, progress, error recovery, auto-suggest, ASCII art.
 */

const SPINNER_FRAMES = ['\u2838', '\u2834', '\u2826', '\u2807', '\u280b', '\u2819', '\u2830', '\u2838'];
const BRAND = '\x1b[35m'; // purple
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

// ─── ASCII Art ───────────────────────────────────────────

const BANNER = `${BRAND}
  ╔════════════════════════════════════╗
  ║   ▀█▀ ▄▀█ █▀█ ▀▄▀   ${DIM}CLI v1.2.0${BRAND}  ║
  ║    █  █▀█ █▀▄ █ █   ${DIM}local AI${BRAND}     ║
  ╚════════════════════════════════════╝${RESET}`;

export function printBanner(): void {
	console.log(BANNER);
}

export function divider(): void {
	console.log(`  ${DIM}${'─'.repeat(40)}${RESET}`);
}

export function box(title: string, lines: string[]): void {
	const maxLen = Math.max(title.length + 2, ...lines.map(l => stripAnsi(l).length + 2));
	const w = Math.min(maxLen + 4, 60);
	const top = `  ${DIM}╭${'─'.repeat(w)}╮${RESET}`;
	const bot = `  ${DIM}╰${'─'.repeat(w)}╯${RESET}`;
	const titleLine = `  ${DIM}│${RESET} ${BOLD}${title}${RESET}${' '.repeat(Math.max(0, w - stripAnsi(title).length - 2))}${DIM}│${RESET}`;
	const sep = `  ${DIM}├${'─'.repeat(w)}┤${RESET}`;
	console.log(top);
	console.log(titleLine);
	console.log(sep);
	for (const l of lines) {
		const pad = Math.max(0, w - stripAnsi(l).length - 2);
		console.log(`  ${DIM}│${RESET} ${l}${' '.repeat(pad)}${DIM}│${RESET}`);
	}
	console.log(bot);
}

function stripAnsi(s: string): string {
	return s.replace(/\x1b\[[0-9;]*m/g, '');
}

interface SpinnerHandle {
	stop: (finalMessage?: string) => void;
	update: (message: string) => void;
}

export function spinner(message: string): SpinnerHandle {
	let frame = 0;
	let currentMsg = message;
	const start = Date.now();

	const isTTY = process.stderr.isTTY;
	if (!isTTY) {
		process.stderr.write(`  ${currentMsg}...\n`);
		return {
			stop: (final?: string) => { if (final) process.stderr.write(`  ${final}\n`); },
			update: (msg: string) => { currentMsg = msg; process.stderr.write(`  ${msg}\n`); },
		};
	}

	const interval = setInterval(() => {
		const elapsed = ((Date.now() - start) / 1000).toFixed(1);
		const icon = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
		process.stderr.write(`\r\x1b[K  ${BRAND}${icon}${RESET} ${currentMsg} ${DIM}(${elapsed}s)${RESET}`);
		frame++;
	}, 80);

	return {
		stop: (finalMessage?: string) => {
			clearInterval(interval);
			const elapsed = ((Date.now() - start) / 1000).toFixed(1);
			if (finalMessage) {
				process.stderr.write(`\r\x1b[K  ${GREEN}\u2713${RESET} ${finalMessage} ${DIM}(${elapsed}s)${RESET}\n`);
			} else {
				process.stderr.write(`\r\x1b[K  ${GREEN}\u2713${RESET} ${currentMsg} ${DIM}(${elapsed}s)${RESET}\n`);
			}
		},
		update: (msg: string) => {
			currentMsg = msg;
		},
	};
}

export async function withSpinner<T>(message: string, fn: () => Promise<T>): Promise<T> {
	const s = spinner(message);
	try {
		const result = await fn();
		s.stop();
		return result;
	} catch (e: any) {
		s.stop(`${RED}Failed:${RESET} ${message}`);
		throw e;
	}
}

// --- Error recovery suggestions ---

interface RecoverySuggestion {
	message: string;
	commands: string[];
}

const RECOVERY_MAP: Array<{ pattern: RegExp; suggest: RecoverySuggestion }> = [
	{
		pattern: /ECONNREFUSED.*11435|inference.*down/i,
		suggest: {
			message: 'Inference server is not running.',
			commands: ['tarx start', 'tarx doctor'],
		},
	},
	{
		pattern: /ECONNREFUSED.*11437|embed.*down/i,
		suggest: {
			message: 'Embedding server is not running.',
			commands: ['tarx start', 'tarx doctor'],
		},
	},
	{
		pattern: /ECONNREFUSED.*11436|mesh.*down/i,
		suggest: {
			message: 'Mesh service is not running.',
			commands: ['tarx start'],
		},
	},
	{
		pattern: /service not found|yarn compile/i,
		suggest: {
			message: 'Extension services not compiled.',
			commands: ['cd ~/Desktop/tarx-code-oss && yarn compile'],
		},
	},
	{
		pattern: /no priorities file|priorities\.jsonl/i,
		suggest: {
			message: 'No priorities set up yet.',
			commands: ['tarx priorities add "My first priority" --urgency today'],
		},
	},
	{
		pattern: /TARX_X_BEARER|X API|twitter/i,
		suggest: {
			message: 'X API credentials not configured.',
			commands: ['tarx xstatus', 'Edit .env with X API keys'],
		},
	},
	{
		pattern: /update.*html|version.*<!DOCTYPE/i,
		suggest: {
			message: 'Update endpoint returned HTML instead of JSON.',
			commands: ['tarx doctor', 'Check API endpoint configuration'],
		},
	},
	{
		pattern: /no results|no knowledge|empty search/i,
		suggest: {
			message: 'No knowledge indexed yet. Upload or scan files first.',
			commands: ['tarx scan ~/Desktop/tarx-code-oss', 'tarx status'],
		},
	},
	{
		pattern: /mesh.*failed|mesh.*timeout|mesh.*refused/i,
		suggest: {
			message: 'Mesh network unreachable.',
			commands: ['tarx status', 'tarx start'],
		},
	},
];

export function suggestRecovery(error: Error | string): RecoverySuggestion | null {
	const msg = typeof error === 'string' ? error : error.message;
	for (const { pattern, suggest } of RECOVERY_MAP) {
		if (pattern.test(msg)) {
			return suggest;
		}
	}
	return null;
}

export function printRecovery(error: Error | string): void {
	const msg = typeof error === 'string' ? error : error.message;
	const recovery = suggestRecovery(error);

	console.error(`\n  ${RED}\u2717 ${msg}${RESET}`);

	if (recovery) {
		console.error(`  ${YELLOW}\u25b8 ${recovery.message}${RESET}`);
		console.error(`  ${DIM}Try:${RESET}`);
		for (const cmd of recovery.commands) {
			console.error(`    ${BOLD}${cmd}${RESET}`);
		}
	} else {
		console.error(`  ${DIM}Run 'tarx doctor' or 'tarx heal' to diagnose.${RESET}`);
	}
	console.error('');
}

// --- Post-command auto-suggest ---

const SUGGEST_MAP: Record<string, string[]> = {
	'status': ['tarx brief', 'tarx priorities'],
	'brief': ['tarx priorities', 'tarx dispatch "<task>"'],
	'priorities': ['tarx brief', 'tarx priorities add "<title>"'],
	'heal': ['tarx status', 'tarx doctor'],
	'dispatch': ['tarx status', 'tarx log'],
	'start': ['tarx status', 'tarx chat "hello"'],
	'doctor': ['tarx start', 'tarx heal'],
	'update': ['tarx status', 'tarx version'],
	'search': ['tarx search "<another query>"', 'tarx brief'],
	'mesh': ['tarx status', 'tarx mesh'],
	'build': ['tarx test', 'tarx status'],
	'test': ['tarx build', 'tarx fix "<error>"'],
	'fix': ['tarx test', 'tarx build'],
	'refactor': ['tarx test', 'tarx build'],
	'document': ['tarx build', 'tarx status'],
	'plan': ['tarx build', 'tarx dispatch "<task>"'],
};

// --- Help screen (renders from command registry) ---

import {
	SECTION_ORDER, SECTION_TITLES, GLOBAL_OPTIONS,
	getCommand, getSection, formatSignature,
} from './commands.js';

const COL_WIDTH = 28;

export function printHelp(): void {
	printBanner();
	console.log(`\n  ${BOLD}Usage:${RESET} tarx [command] [args] [options]\n`);
	console.log(`  ${DIM}Run ${RESET}${BOLD}tarx${RESET}${DIM} with no arguments for a live status greeting.${RESET}\n`);

	for (const section of SECTION_ORDER) {
		const cmds = getSection(section);
		console.log(`  ${DIM}── ${SECTION_TITLES[section]} ──${RESET}`);
		for (const cmd of cmds) {
			console.log(`    ${BOLD}${formatSignature(cmd).padEnd(COL_WIDTH)}${RESET} ${cmd.desc}`);
		}
		console.log('');
	}

	console.log(`  ${DIM}── Options ──${RESET}`);
	for (const opt of GLOBAL_OPTIONS) {
		console.log(`    ${BOLD}${opt.flag.padEnd(COL_WIDTH)}${RESET} ${opt.desc}`);
	}
	console.log('');

	console.log(`  ${DIM}Services: :11435 inference  :11436 mesh  :11437 embeddings${RESET}`);
	console.log(`  ${DIM}Docs:     https://tarx.com/docs${RESET}\n`);
}

/**
 * Print detailed help for a single command.
 * Returns true if the command was found, false otherwise.
 */
export function printCommandHelp(name: string): boolean {
	const cmd = getCommand(name);
	if (!cmd) return false;

	const usage = cmd.usage || `tarx ${formatSignature(cmd)}`;
	console.log(`\n  ${BOLD}${cmd.name}${RESET} — ${cmd.desc}`);
	console.log(`  ${DIM}Usage:${RESET} ${usage}\n`);

	if (cmd.flags && cmd.flags.length > 0) {
		console.log(`  ${DIM}Flags:${RESET}`);
		for (const f of cmd.flags) {
			console.log(`    ${f}`);
		}
		console.log('');
	}

	if (cmd.examples && cmd.examples.length > 0) {
		console.log(`  ${DIM}Examples:${RESET}`);
		for (const ex of cmd.examples) {
			console.log(`    ${BOLD}${ex}${RESET}`);
		}
		console.log('');
	}

	return true;
}

export function suggestNext(command: string): void {
	const suggestions = SUGGEST_MAP[command];
	if (!suggestions || suggestions.length === 0) return;

	console.log(`${DIM}  Next: ${suggestions.join('  |  ')}${RESET}`);
}
