/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX Background Service
 *
 *  Runs on extension activation. Performs health checks, file watching,
 *  and session brief generation. Emits events consumed by the Thinking Tab.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export interface ServiceHealth {
	inference: { ok: boolean; tokPerSec?: number; model?: string };
	embeddings: { ok: boolean };
	mesh: { ok: boolean; peers?: number };
}

export interface SessionBrief {
	timeSinceLastSession: string | null;
	health: ServiceHealth;
	filesChanged: number;
	spaceSummary: Array<{ name: string; count: number; indexed: number }>;
}

export interface FileChangeEvent {
	type: 'added' | 'modified' | 'removed';
	filePath: string;
	spaceName?: string;
}

export type BackgroundEvent =
	| { type: 'health'; data: ServiceHealth }
	| { type: 'session-brief'; data: SessionBrief }
	| { type: 'files-changed'; data: FileChangeEvent[] }
	| { type: 'status-message'; data: { icon: string; message: string } };

// ============================================================================
// HTTP HELPER
// ============================================================================

async function fetchWithTimeout(url: string, timeoutMs: number = 2000): Promise<{ ok: boolean; data?: Record<string, unknown> }> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(url, { signal: controller.signal });
		clearTimeout(timer);
		if (!response.ok) {
			return { ok: false };
		}
		const data = await response.json() as Record<string, unknown>;
		return { ok: true, data };
	} catch {
		clearTimeout(timer);
		return { ok: false };
	}
}

// ============================================================================
// BACKGROUND SERVICE
// ============================================================================

export class TarxBackgroundService extends EventEmitter {
	private healthInterval: ReturnType<typeof setInterval> | undefined;
	private fileWatchInterval: ReturnType<typeof setInterval> | undefined;
	private watchers: fs.FSWatcher[] = [];
	private lastHealth: ServiceHealth | undefined;
	private pendingFileChanges: FileChangeEvent[] = [];
	private running = false;

	constructor() {
		super();
	}

	// ====================================================================
	// LIFECYCLE
	// ====================================================================

	start(): void {
		if (this.running) { return; }
		this.running = true;
		console.log('[TARX BackgroundService] Starting...');

		// Emit session brief on start (async, don't block)
		this.emitSessionBrief();

		// Health checks every 10 seconds
		this.healthInterval = setInterval(() => this.checkHealth(), 10000);
		// Initial health check immediately
		this.checkHealth();

		// File change flush every 30 seconds
		this.fileWatchInterval = setInterval(() => this.flushFileChanges(), 30000);

		// Watch known space directories
		this.setupFileWatchers();
	}

	stop(): void {
		if (!this.running) { return; }
		this.running = false;
		console.log('[TARX BackgroundService] Stopping...');

		if (this.healthInterval) {
			clearInterval(this.healthInterval);
			this.healthInterval = undefined;
		}
		if (this.fileWatchInterval) {
			clearInterval(this.fileWatchInterval);
			this.fileWatchInterval = undefined;
		}
		for (const w of this.watchers) {
			w.close();
		}
		this.watchers = [];
	}

	getStatus(): ServiceHealth | undefined {
		return this.lastHealth;
	}

	// ====================================================================
	// HEALTH CHECKS (every 10s)
	// ====================================================================

	private async checkHealth(): Promise<void> {
		const [inference, embeddings, mesh] = await Promise.all([
			this.checkInference(),
			this.checkEmbeddings(),
			this.checkMesh()
		]);

		const health: ServiceHealth = { inference, embeddings, mesh };

		// Only emit when status changes
		if (!this.lastHealth || this.healthChanged(this.lastHealth, health)) {
			this.lastHealth = health;
			console.log('[TARX-BG] Emitting health:', JSON.stringify(health));
			this.emit('event', { type: 'health', data: health } as BackgroundEvent);
		}
	}

	private async checkInference(): Promise<ServiceHealth['inference']> {
		const result = await fetchWithTimeout('http://localhost:11435/health');
		if (result.ok && result.data) {
			const slots = result.data.slots as Array<{ t_token_generation?: number }> | undefined;
			let tokPerSec: number | undefined;
			if (Array.isArray(slots) && slots.length > 0 && slots[0].t_token_generation) {
				tokPerSec = Math.round(1000 / slots[0].t_token_generation);
			}
			const model = result.data.model as string | undefined;
			return { ok: true, tokPerSec, model };
		}
		return { ok: false };
	}

	private async checkEmbeddings(): Promise<ServiceHealth['embeddings']> {
		const result = await fetchWithTimeout('http://localhost:11437/health');
		return { ok: result.ok };
	}

	private async checkMesh(): Promise<ServiceHealth['mesh']> {
		const result = await fetchWithTimeout('http://localhost:11436/health');
		if (result.ok && result.data) {
			const peers = typeof result.data.peers === 'number' ? result.data.peers : 0;
			return { ok: true, peers };
		}
		return { ok: false };
	}

	private healthChanged(prev: ServiceHealth, next: ServiceHealth): boolean {
		return (
			prev.inference.ok !== next.inference.ok ||
			prev.embeddings.ok !== next.embeddings.ok ||
			prev.mesh.ok !== next.mesh.ok ||
			prev.mesh.peers !== next.mesh.peers ||
			prev.inference.tokPerSec !== next.inference.tokPerSec
		);
	}

	// ====================================================================
	// SESSION BRIEF (on start)
	// ====================================================================

	async emitSessionBrief(): Promise<void> {
		const health = await this.getHealthSnapshot();
		const timeSinceLastSession = await this.getTimeSinceLastSession();
		const spaceSummary = await this.getSpaceSummary();

		const brief: SessionBrief = {
			timeSinceLastSession,
			health,
			filesChanged: 0, // Will be populated by file watch on subsequent runs
			spaceSummary
		};

		console.log('[TARX-BG] Emitting session-brief:', JSON.stringify(brief));
		this.emit('event', { type: 'session-brief', data: brief } as BackgroundEvent);
	}

	private async getHealthSnapshot(): Promise<ServiceHealth> {
		const [inference, embeddings, mesh] = await Promise.all([
			this.checkInference(),
			this.checkEmbeddings(),
			this.checkMesh()
		]);
		const health = { inference, embeddings, mesh };
		this.lastHealth = health;
		return health;
	}

	private async getTimeSinceLastSession(): Promise<string | null> {
		try {
			const dbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
			if (!fs.existsSync(dbPath)) { return null; }

			// Read the last session timestamp from the session log
			const logPath = path.join(os.homedir(), 'Library/Application Support/tarx/claude-sessions.log');
			if (fs.existsSync(logPath)) {
				const stat = fs.statSync(logPath);
				const hoursAgo = Math.round((Date.now() - stat.mtimeMs) / (1000 * 60 * 60));
				if (hoursAgo < 1) {
					const minutesAgo = Math.round((Date.now() - stat.mtimeMs) / (1000 * 60));
					return `${minutesAgo} minute${minutesAgo !== 1 ? 's' : ''} ago`;
				}
				return `${hoursAgo} hour${hoursAgo !== 1 ? 's' : ''} ago`;
			}
			return null;
		} catch {
			return null;
		}
	}

	private async getSpaceSummary(): Promise<Array<{ name: string; count: number; indexed: number }>> {
		try {
			const dbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
			if (!fs.existsSync(dbPath)) { return []; }
			// Space summary is available via MCP — for now return empty
			// Phase 2 will wire this to tarx_db_stats
			return [];
		} catch {
			return [];
		}
	}

	// ====================================================================
	// FILE WATCHING (batch every 30s)
	// ====================================================================

	private setupFileWatchers(): void {
		// Watch the TARX files directory
		const filesDir = path.join(os.homedir(), 'Library/Application Support/tarx/files');
		if (fs.existsSync(filesDir)) {
			try {
				const watcher = fs.watch(filesDir, { recursive: true }, (eventType, filename) => {
					if (!filename) { return; }
					this.pendingFileChanges.push({
						type: eventType === 'rename' ? 'added' : 'modified',
						filePath: path.join(filesDir, filename)
					});
				});
				this.watchers.push(watcher);
			} catch (e) {
				console.error('[TARX BackgroundService] Failed to watch files dir:', e);
			}
		}

		// Watch workspace folders
		const folders = vscode.workspace.workspaceFolders;
		if (folders) {
			for (const folder of folders) {
				try {
					const watcher = fs.watch(folder.uri.fsPath, { recursive: true }, (eventType, filename) => {
						if (!filename) { return; }
						// Skip node_modules, .git, etc.
						if (filename.includes('node_modules') || filename.includes('.git')) { return; }
						this.pendingFileChanges.push({
							type: eventType === 'rename' ? 'added' : 'modified',
							filePath: path.join(folder.uri.fsPath, filename)
						});
					});
					this.watchers.push(watcher);
				} catch {
					// Folder might not be watchable
				}
			}
		}
	}

	private flushFileChanges(): void {
		if (this.pendingFileChanges.length === 0) { return; }

		// Deduplicate by file path, keeping the latest event type
		const byPath = new Map<string, FileChangeEvent>();
		for (const change of this.pendingFileChanges) {
			byPath.set(change.filePath, change);
		}

		const batch = Array.from(byPath.values());
		this.pendingFileChanges = [];

		this.emit('event', { type: 'files-changed', data: batch } as BackgroundEvent);
	}

	// ====================================================================
	// MANUAL EVENT EMISSION
	// ====================================================================

	emitStatusMessage(icon: string, message: string): void {
		this.emit('event', { type: 'status-message', data: { icon, message } } as BackgroundEvent);
	}
}
