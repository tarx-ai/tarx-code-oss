/**
 * Secure Database Access Helper
 *
 * Uses better-sqlite3 with parameterized queries to prevent SQL injection.
 * All queries MUST use ? placeholders instead of string interpolation.
 *
 * CRASH GUARD: better-sqlite3 is loaded LAZILY (not at import time) so that
 * a missing or incompatible native module doesn't crash the entire extension
 * before activate() even runs.
 *
 * @file extensions/tarx/src/secureDatabase.ts
 * @security Critical - prevents SQL injection vulnerabilities
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const DB_PATH = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');

let dbInstance: any | null = null;
let DatabaseConstructor: any = null;
let loadError: Error | null = null;

/**
 * Lazy-load better-sqlite3 native module.
 * Returns the constructor or null if unavailable.
 */
function loadBetterSqlite3(): any {
	if (DatabaseConstructor) { return DatabaseConstructor; }
	if (loadError) { return null; } // Already failed, don't retry

	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		DatabaseConstructor = require('better-sqlite3');
		console.log('[SecureDB] better-sqlite3 loaded successfully');
		return DatabaseConstructor;
	} catch (err) {
		loadError = err instanceof Error ? err : new Error(String(err));
		console.error('[SecureDB] CRASH-GUARD: better-sqlite3 failed to load — all DB ops will no-op');
		console.error('[SecureDB] Error:', loadError.message);
		return null;
	}
}

/**
 * Get database instance (singleton pattern)
 */
export function getDB(): any {
	if (!dbInstance) {
		const Database = loadBetterSqlite3();
		if (!Database) {
			console.error('[SecureDB] Cannot create DB instance — native module unavailable');
			return null;
		}

		// Ensure directory exists
		const dir = path.dirname(DB_PATH);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		dbInstance = new Database(DB_PATH);
		dbInstance.pragma('journal_mode = WAL');
	}
	return dbInstance;
}

/**
 * Query helper - returns all rows
 * @param sql SQL query with ? placeholders
 * @param params Parameters to bind (prevents SQL injection)
 */
export function queryAll<T = any>(sql: string, ...params: any[]): T[] {
	try {
		const db = getDB();
		if (!db) { return []; }
		return db.prepare(sql).all(...params) as T[];
	} catch (error) {
		console.error('[SecureDB] Query error:', error);
		return [];
	}
}

/**
 * Query helper - returns first row only
 * @param sql SQL query with ? placeholders
 * @param params Parameters to bind (prevents SQL injection)
 */
export function queryOne<T = any>(sql: string, ...params: any[]): T | undefined {
	try {
		const db = getDB();
		if (!db) { return undefined; }
		return db.prepare(sql).get(...params) as T | undefined;
	} catch (error) {
		console.error('[SecureDB] Query error:', error);
		return undefined;
	}
}

/**
 * Execute a write operation (INSERT, UPDATE, DELETE)
 * @param sql SQL query with ? placeholders
 * @param params Parameters to bind (prevents SQL injection)
 * @returns Number of rows affected
 */
export function execute(sql: string, ...params: any[]): number {
	try {
		const db = getDB();
		if (!db) { return 0; }
		const result = db.prepare(sql).run(...params);
		return result.changes;
	} catch (error) {
		console.error('[SecureDB] Execute error:', error);
		return 0;
	}
}

/**
 * Execute multiple statements in a transaction
 * @param operations Array of [sql, ...params] tuples
 * @returns true if successful, false on error
 */
export function executeTransaction(operations: Array<[string, ...any[]]>): boolean {
	const db = getDB();
	if (!db) { return false; }

	const transaction = db.transaction(() => {
		for (const [sql, ...params] of operations) {
			db.prepare(sql).run(...params);
		}
	});

	try {
		transaction();
		return true;
	} catch (error) {
		console.error('[SecureDB] Transaction error:', error);
		return false;
	}
}

/**
 * Close database connection
 */
export function closeDB(): void {
	if (dbInstance) {
		try {
			dbInstance.close();
		} catch (err) {
			console.error('[SecureDB] Close error:', err);
		}
		dbInstance = null;
	}
}
