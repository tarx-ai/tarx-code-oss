/**
 * TARX Console Log Capture
 * Captures [TARX] prefixed console output to a ring buffer file
 * for MCP-accessible debugging without screenshots.
 *
 * @file extensions/tarx/src/tarxLogger.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ========================================
// CONFIGURATION
// ========================================

const MAX_LINES = 10000;
const LOG_DIR = path.join(
	os.homedir(),
	'Library/Application Support/tarx'
);
const LOG_FILE = path.join(LOG_DIR, 'console.log');
const WRITE_DEBOUNCE_MS = 1000;

// ========================================
// STATE
// ========================================

let buffer: string[] = [];
let writeTimer: NodeJS.Timeout | null = null;
let initialized = false;

// ========================================
// CORE FUNCTIONS
// ========================================

/**
 * Initialize the TARX logger by monkey-patching console methods.
 * Call this at the VERY TOP of activate() before anything else.
 */
export function initTarxLogger(): void {
	if (initialized) {
		return;
	}
	initialized = true;

	// Ensure directory exists
	try {
		if (!fs.existsSync(LOG_DIR)) {
			fs.mkdirSync(LOG_DIR, { recursive: true });
		}
	} catch (e) {
		// Silent fail - directory might not be writable
		return;
	}

	// Load existing log
	if (fs.existsSync(LOG_FILE)) {
		try {
			const content = fs.readFileSync(LOG_FILE, 'utf8');
			buffer = content.split('\n').filter(Boolean);
			// Trim if too large
			if (buffer.length > MAX_LINES) {
				buffer = buffer.slice(-MAX_LINES);
			}
		} catch {
			buffer = [];
		}
	}

	// Store original console methods
	const origLog = console.log;
	const origError = console.error;
	const origWarn = console.warn;
	const origInfo = console.info;

	/**
	 * Capture log line if it contains [TARX] prefix
	 */
	const capture = (level: string, args: unknown[]): void => {
		const msg = args.map(a =>
			typeof a === 'string' ? a : JSON.stringify(a)
		).join(' ');

		// Only capture TARX-prefixed logs
		if (msg.includes('[TARX') || msg.includes('[tarx')) {
			const timestamp = new Date().toISOString();
			const line = `${timestamp} [${level}] ${msg}`;
			buffer.push(line);

			// Trim to MAX_LINES
			if (buffer.length > MAX_LINES) {
				buffer = buffer.slice(-MAX_LINES);
			}

			// Debounced write to disk
			if (!writeTimer) {
				writeTimer = setTimeout(() => {
					try {
						fs.writeFileSync(LOG_FILE, buffer.join('\n') + '\n');
					} catch {
						// Silent fail
					}
					writeTimer = null;
				}, WRITE_DEBOUNCE_MS);
			}
		}
	};

	// Monkey-patch console methods
	console.log = (...args: unknown[]) => {
		capture('LOG', args);
		origLog.apply(console, args);
	};

	console.error = (...args: unknown[]) => {
		capture('ERR', args);
		origError.apply(console, args);
	};

	console.warn = (...args: unknown[]) => {
		capture('WARN', args);
		origWarn.apply(console, args);
	};

	console.info = (...args: unknown[]) => {
		capture('INFO', args);
		origInfo.apply(console, args);
	};

	// Log initialization
	console.log('[TARX Logger] Console capture initialized');
}

/**
 * Read recent TARX logs from buffer
 * @param lines Number of lines to return (default 100)
 * @param filter Optional case-insensitive substring filter
 */
export function readTarxLogs(
	lines: number = 100,
	filter?: string
): string[] {
	let result = buffer.slice(-Math.min(lines, MAX_LINES));

	if (filter) {
		const lowerFilter = filter.toLowerCase();
		result = result.filter(l => l.toLowerCase().includes(lowerFilter));
	}

	return result;
}

/**
 * Read logs from the last N seconds
 * @param seconds Timeframe in seconds (default 60)
 * @param filter Optional case-insensitive substring filter
 */
export function tailTarxLogs(
	seconds: number = 60,
	filter?: string
): string[] {
	const cutoff = Date.now() - (seconds * 1000);

	let result = buffer.filter(line => {
		// Extract ISO timestamp from start of line
		const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z)/);
		if (match) {
			const lineTime = new Date(match[1]).getTime();
			return lineTime >= cutoff;
		}
		return false;
	});

	if (filter) {
		const lowerFilter = filter.toLowerCase();
		result = result.filter(l => l.toLowerCase().includes(lowerFilter));
	}

	return result;
}

/**
 * Clear all TARX logs
 */
export function clearTarxLogs(): void {
	buffer = [];
	if (fs.existsSync(LOG_FILE)) {
		try {
			fs.writeFileSync(LOG_FILE, '');
		} catch {
			// Silent fail
		}
	}
}

/**
 * Force flush buffer to disk (useful before shutdown)
 */
export function flushTarxLogs(): void {
	if (writeTimer) {
		clearTimeout(writeTimer);
		writeTimer = null;
	}
	try {
		fs.writeFileSync(LOG_FILE, buffer.join('\n') + '\n');
	} catch {
		// Silent fail
	}
}

/**
 * Get log file path for direct access
 */
export function getTarxLogPath(): string {
	return LOG_FILE;
}

/**
 * Get current buffer size
 */
export function getTarxLogStats(): { lines: number; path: string } {
	return {
		lines: buffer.length,
		path: LOG_FILE
	};
}
