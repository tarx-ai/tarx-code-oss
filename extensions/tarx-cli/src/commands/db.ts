/**
 * TARX CLI — Shared database utilities.
 * Opens memory.db, provides cosine similarity, retry logic for writes.
 */

import { resolve } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';

export const DB_PATH = resolve(homedir(), 'Library/Application Support/tarx/memory.db');

export function openDb(readonly = true): any {
	const Database = require('better-sqlite3');
	const db = new Database(DB_PATH, { readonly });
	if (!readonly) {
		db.pragma('journal_mode = WAL');
	}
	return db;
}

export function dbExists(): boolean {
	return existsSync(DB_PATH);
}

export function cosineSimilarity(a: number[], b: Float32Array | number[]): number {
	let dot = 0, normA = 0, normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}

/**
 * Run a write operation with up to 3 retries on SQLITE_BUSY.
 */
export function withRetry<T>(fn: () => T, retries = 3): T {
	for (let i = 0; i < retries; i++) {
		try {
			return fn();
		} catch (e: any) {
			if (e.code === 'SQLITE_BUSY' && i < retries - 1) {
				const delay = 100 * (i + 1);
				const start = Date.now();
				while (Date.now() - start < delay) { /* busy wait */ }
				continue;
			}
			throw e;
		}
	}
	throw new Error('withRetry exhausted');
}
