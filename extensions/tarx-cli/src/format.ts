/**
 * TARX CLI — Formatting Engine
 * Every CLI output goes through this. Consistent, branded, beautiful.
 * Uses raw ANSI (consistent with existing feedback.ts — zero dependencies).
 */

// ═══════════════════════════════════════════
// ANSI CODES
// ═══════════════════════════════════════════

const RST = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const ITALIC = '\x1b[3m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const RED_BRIGHT = '\x1b[91m';
const GREEN_BRIGHT = '\x1b[92m';
const YELLOW_BRIGHT = '\x1b[93m';
const BLUE_BRIGHT = '\x1b[94m';

// Brand palette — true color
const C1 = '\x1b[38;2;64;182;251m';   // #40B6FB primary blue
const C2 = '\x1b[38;2;205;77;136m';   // #CD4D88 secondary pink
const C3 = '\x1b[38;2;254;161;33m';   // #FEA121 tertiary amber
const C4 = '\x1b[38;2;204;128;252m';  // #CC80FC quaternary purple

// ═══════════════════════════════════════════
// BRAND HELPERS
// ═══════════════════════════════════════════

export const brand = {
	blue: (s: string) => `${C1}${s}${RST}`,
	green: (s: string) => `${GREEN_BRIGHT}${s}${RST}`,
	yellow: (s: string) => `${YELLOW_BRIGHT}${s}${RST}`,
	red: (s: string) => `${RED_BRIGHT}${s}${RST}`,
	dim: (s: string) => `${DIM}${s}${RST}`,
	bold: (s: string) => `${BOLD}${s}${RST}`,
	cmd: (s: string) => `${CYAN}${s}${RST}`,
	italic: (s: string) => `${ITALIC}${s}${RST}`,
	tarx: () => `${BOLD}${C1}TARX${RST}`,
	line: (width?: number) => `${C1}${'─'.repeat(width ?? Math.min(process.stdout.columns || 60, 60))}${RST}`,
};

// ═══════════════════════════════════════════
// STATUS ICONS
// ═══════════════════════════════════════════

export const icon = {
	success: `${GREEN_BRIGHT}✓${RST}`,
	error: `${RED_BRIGHT}✗${RST}`,
	warning: `${YELLOW_BRIGHT}⚠${RST}`,
	info: `${C1}●${RST}`,
	arrow: `${DIM}→${RST}`,
	thinking: `${DIM}◌${RST}`,
	local: `${GREEN_BRIGHT}⬡${RST}`,
	mesh: `${C1}⬢${RST}`,
	cloud: `${YELLOW_BRIGHT}☁${RST}`,
	dot: {
		up: `${GREEN_BRIGHT}●${RST}`,
		warn: `${C3}●${RST}`,
		down: `${RED_BRIGHT}●${RST}`,
		idle: `${DIM}○${RST}`,
	},
};

// ═══════════════════════════════════════════
// STRUCTURED OUTPUT
// ═══════════════════════════════════════════

/** Branded command header */
export function header(title: string, subtitle?: string): void {
	console.log();
	console.log(`  ${brand.tarx()} ${brand.dim('·')} ${brand.bold(title)}`);
	if (subtitle) console.log(`  ${brand.dim(subtitle)}`);
	console.log(`  ${brand.line()}`);
}

/** Section heading within output */
export function section(title: string): void {
	console.log();
	console.log(`  ${brand.bold(title)}`);
}

/** Key-value pair with optional status icon */
export function kv(key: string, value: string, status?: 'ok' | 'warn' | 'error'): void {
	const si = status === 'ok' ? icon.success
		: status === 'warn' ? icon.warning
			: status === 'error' ? icon.error
				: ' ';
	console.log(`  ${si} ${brand.dim(key + ':')} ${value}`);
}

/** Success line */
export function success(msg: string): void {
	console.log(`  ${icon.success} ${msg}`);
}

/** Error with optional hint */
export function error(msg: string, hint?: string): void {
	console.log();
	console.log(`  ${icon.error} ${brand.red(msg)}`);
	if (hint) console.log(`  ${brand.dim(hint)}`);
	console.log();
}

/** Warning line */
export function warn(msg: string): void {
	console.log(`  ${icon.warning} ${brand.yellow(msg)}`);
}

/** Call-to-action box */
export function cta(message: string, command?: string): void {
	console.log();
	console.log(`  ${C1}┌─${RST} ${message}`);
	if (command) {
		console.log(`  ${C1}│${RST}`);
		console.log(`  ${C1}│${RST}  ${brand.cmd('$ ' + command)}`);
	}
	console.log(`  ${C1}└─${RST}`);
}

/** Compute source footer */
export function footer(source: 'local' | 'mesh' | 'cloud', extra?: { tokens?: number; time?: number; version?: string }): void {
	console.log();
	const si = source === 'local' ? icon.local
		: source === 'mesh' ? icon.mesh
			: icon.cloud;
	const label = source === 'local' ? 'Local'
		: source === 'mesh' ? 'Supercomputer'
			: 'Cloud';

	const parts: string[] = [`${si} ${brand.dim(label)}`];
	if (extra?.tokens) parts.push(brand.dim(`${extra.tokens} tokens`));
	if (extra?.time) parts.push(brand.dim(`${(extra.time / 1000).toFixed(1)}s`));
	if (extra?.version) parts.push(brand.dim(`v${extra.version}`));
	console.log(`  ${parts.join(brand.dim(' · '))}`);
	console.log();
}

// ═══════════════════════════════════════════
// PROGRESS BAR
// ═══════════════════════════════════════════

export function progressBar(label: string, current: number, total: number, width = 20): void {
	const pct = Math.round((current / total) * 100);
	const filled = Math.round((current / total) * width);
	const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
	const line = `  ${label.padEnd(10)} ${bar}  ${pct}%  (${current}/${total})`;
	process.stdout.write(`\r${line}`);
	if (current >= total) process.stdout.write('\n');
}

// ═══════════════════════════════════════════
// STREAMING HELPERS
// ═══════════════════════════════════════════

export function streamPrefix(): void {
	process.stdout.write('\n  ');
}

export function streamChunk(text: string): void {
	process.stdout.write(text.replace(/\n/g, '\n  '));
}

export function streamEnd(): void {
	process.stdout.write('\n');
}

// ═══════════════════════════════════════════
// TABLE FORMATTING
// ═══════════════════════════════════════════

export function table(rows: [string, string][], colWidth = 36): void {
	for (const [left, right] of rows) {
		const stripped = left.replace(/\x1b\[[0-9;]*m/g, '');
		const pad = Math.max(1, colWidth - stripped.length);
		console.log(`  ${left}${' '.repeat(pad)}${right}`);
	}
}

/** Comparison table (for tarx vs) */
export function compareTable(headers: [string, string, string], rows: [string, string, string][]): void {
	const c1 = 38;
	const c2 = 12;
	const c3 = 12;

	// Header
	console.log(`  ${brand.dim(headers[0].padEnd(c1))}${brand.bold(headers[1].padEnd(c2))}${brand.bold(headers[2])}`);
	console.log(`  ${brand.line(c1 + c2 + c3)}`);

	// Rows
	for (const [label, v1, v2] of rows) {
		console.log(`  ${brand.dim(label.padEnd(c1))}${v1.padEnd(c2 + (v1.length - stripAnsi(v1).length))}${v2}`);
	}
	console.log(`  ${brand.line(c1 + c2 + c3)}`);
}

function stripAnsi(s: string): string {
	return s.replace(/\x1b\[[0-9;]*m/g, '');
}
