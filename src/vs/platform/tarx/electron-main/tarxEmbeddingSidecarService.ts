/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import * as http from 'http';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { ILogService } from '../../log/common/log.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import {
	ITarxEmbeddingSidecarService,
	ITarxEmbeddingsStatus,
	ITarxSpawnResult,
	TarxHealthState,
	TARX_EMBEDDINGS_PORT,
	TARX_EMBEDDINGS_MODEL_PATTERN
} from '../common/tarx.js';

/**
 * TarxEmbeddingSidecarService - manages llama-server for embeddings (port 11437)
 *
 * Uses nomic-embed-text-v1.5 model for RAG embeddings.
 * Simpler than inference sidecar - no context optimization, just embeddings.
 */
export class TarxEmbeddingSidecarService extends Disposable implements ITarxEmbeddingSidecarService {
	declare readonly _serviceBrand: undefined;

	private _process: ChildProcess | null = null;
	private _status: ITarxEmbeddingsStatus;
	private _healthCheckInterval: ReturnType<typeof setInterval> | null = null;
	private _starting: boolean = false; // Guard against concurrent starts

	private readonly _onDidChangeStatus = this._register(new Emitter<ITarxEmbeddingsStatus>());
	readonly onDidChangeStatus: Event<ITarxEmbeddingsStatus> = this._onDidChangeStatus.event;

	readonly port = TARX_EMBEDDINGS_PORT;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService
	) {
		super();

		this._status = {
			running: false,
			port: this.port,
			modelLoaded: false,
			healthState: TarxHealthState.Unknown
		};

		this.logService.info('[TARX Embeddings] Sidecar service initialized');
	}

	async startEmbeddings(): Promise<ITarxSpawnResult> {
		const startTime = Date.now();
		const maxAttempts = 3;
		const retryDelayMs = 5000;

		// Guard against concurrent starts
		if (this._starting) {
			this.logService.warn('[TARX Embeddings] Start already in progress, blocking concurrent call');
			return {
				success: false,
				attempt: 0,
				elapsedMs: Date.now() - startTime,
				error: 'Start already in progress',
				meshFallbackTriggered: false
			};
		}

		this._starting = true;

		try {
			// Check if already running
			if (this._process) {
				const healthResult = await this.checkHealth();
				if (healthResult.healthy) {
					this.logService.info('[TARX Embeddings] Server already running and healthy');
					return {
						success: true,
						attempt: 0,
						elapsedMs: Date.now() - startTime,
						meshFallbackTriggered: false,
						pid: this._process.pid
					};
				}
				this.logService.warn('[TARX Embeddings] Server not responding, restarting...');
				await this.stopEmbeddings();
			}

			// Retry loop with backoff
		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			this.logService.info(`[TARX Embeddings] Starting... (attempt ${attempt}/${maxAttempts})`);

			// Kill orphaned processes on port
			await this.killOrphanedProcesses();

			// Find embedding model
			const modelPath = await this.findEmbeddingModel();
			if (!modelPath) {
				this.logService.error('[TARX Embeddings] No nomic embedding model found');
				return {
					success: false,
					attempt,
					elapsedMs: Date.now() - startTime,
					error: 'Embedding model not found (looking for sha256-970aa74c in ~/.ollama/models/blobs/)',
					meshFallbackTriggered: false
				};
			}

			// Get llama-server binary
			const binaryPath = this.getLlamaServerPath();
			if (!fs.existsSync(binaryPath)) {
				this.logService.error(`[TARX Embeddings] llama-server binary not found: ${binaryPath}`);
				return {
					success: false,
					attempt,
					elapsedMs: Date.now() - startTime,
					error: 'llama-server binary not found',
					meshFallbackTriggered: false
				};
			}

			// Build args for embedding server
			const args = [
				'--host', '127.0.0.1',
				'--port', String(this.port),
				'--model', modelPath,
				'--ctx-size', '8192',
				'--embeddings',
				'--pooling', 'mean',
				'--parallel', '1',
				'--no-warmup'
			];

			const binariesDir = path.dirname(binaryPath);

			this.logService.info(`[TARX Embeddings] Spawning embedding server: ${binaryPath}`);
			this.logService.info(`[TARX Embeddings] Model: ${modelPath}`);
			this.logService.info(`[TARX Embeddings] Args: ${args.join(' ')}`);

			// Spawn process
			const env = {
				...process.env,
				DYLD_LIBRARY_PATH: binariesDir
			};

			this._process = spawn(binaryPath, args, {
				env,
				stdio: ['ignore', 'pipe', 'pipe'],
				detached: false
			});

			// Handle stdout/stderr with INFO level logging
			this._process.stdout?.on('data', (data: Buffer) => {
				const line = data.toString().trim();
				if (line) {
					this.logService.info(`[llama-embed stdout] ${line}`);
				}
			});

			this._process.stderr?.on('data', (data: Buffer) => {
				const line = data.toString().trim();
				if (line) {
					this.logService.info(`[llama-embed stderr] ${line}`);
				}
			});

			// Handle exit
			this._process.on('exit', (code, signal) => {
				this.logService.info(`[TARX Embeddings] Server exited with code ${code}, signal ${signal}`);
				this._process = null;
				this._status = { ...this._status, running: false, healthState: TarxHealthState.Critical };
				this._onDidChangeStatus.fire(this._status);
			});

			this._process.on('error', (err) => {
				this.logService.error(`[TARX Embeddings] Server error: ${err.message}`);
			});

			this.logService.info(`[TARX Embeddings] Server spawned on port ${this.port} (PID: ${this._process.pid})`);

			// Wait for health
			try {
				await this.waitForHealth(15000);

				this._status = { ...this._status, running: true, modelLoaded: true, healthState: TarxHealthState.Healthy };
				this._onDidChangeStatus.fire(this._status);

				// Start health monitoring
				this.startHealthMonitoring();

				this.logService.info(`[TARX Embeddings] Ready (${Date.now() - startTime}ms)`);

				return {
					success: true,
					attempt,
					elapsedMs: Date.now() - startTime,
					meshFallbackTriggered: false,
					pid: this._process?.pid
				};
			} catch (e) {
				const errorMsg = e instanceof Error ? e.message : String(e);
				this.logService.error(`[TARX Embeddings] Attempt ${attempt} failed: ${errorMsg}`);
				await this.stopEmbeddings();

				// Retry with backoff
				if (attempt < maxAttempts) {
					this.logService.info(`[TARX Embeddings] Retrying in ${retryDelayMs}ms...`);
					await this.delay(retryDelayMs);
				} else {
					this.logService.error(`[TARX Embeddings] FAILED after ${maxAttempts} attempts: ${errorMsg}`);
					return {
						success: false,
						attempt,
						elapsedMs: Date.now() - startTime,
						error: errorMsg,
						meshFallbackTriggered: false
					};
				}
			}
		}

			return {
				success: false,
				attempt: maxAttempts,
				elapsedMs: Date.now() - startTime,
				error: 'Max retry attempts exceeded',
				meshFallbackTriggered: false
			};
		} finally {
			this._starting = false;
		}
	}

	async stopEmbeddings(): Promise<void> {
		this.stopHealthMonitoring();

		if (!this._process) {
			return;
		}

		const pid = this._process.pid;
		this.logService.info(`[TARX Embeddings] Stopping server (PID: ${pid})...`);

		return new Promise((resolve) => {
			if (!this._process) {
				resolve();
				return;
			}

			const timeout = setTimeout(() => {
				this._process?.kill('SIGKILL');
			}, 3000);

			this._process.once('exit', () => {
				clearTimeout(timeout);
				this._process = null;
				this._status = { ...this._status, running: false, healthState: TarxHealthState.Unknown };
				this._onDidChangeStatus.fire(this._status);
				this.logService.info('[TARX Embeddings] Server stopped');
				resolve();
			});

			this._process.kill('SIGTERM');
		});
	}

	isRunning(): boolean {
		return this._process !== null;
	}

	async checkHealth(): Promise<{ healthy: boolean; latencyMs: number }> {
		const start = Date.now();

		return new Promise((resolve) => {
			const req = http.request({
				hostname: '127.0.0.1',
				port: this.port,
				path: '/health',
				method: 'GET',
				timeout: 3000
			}, (res) => {
				const latencyMs = Date.now() - start;
				resolve({ healthy: res.statusCode === 200, latencyMs });
			});

			req.on('error', () => {
				resolve({ healthy: false, latencyMs: Date.now() - start });
			});

			req.on('timeout', () => {
				req.destroy();
				resolve({ healthy: false, latencyMs: Date.now() - start });
			});

			req.end();
		});
	}

	// Private helpers

	private getLlamaServerPath(): string {
		const appRoot = this.environmentMainService.appRoot;
		const possiblePaths = [
			path.join(appRoot, 'resources', 'binaries', 'llama-server'),
			path.join(appRoot, '..', 'Resources', 'binaries', 'llama-server'),
			path.join(appRoot, 'binaries', 'llama-server'),
			// Development fallback: tarx-local extension
			path.join(appRoot, 'extensions', 'tarx-local', 'binaries', 'llama-server-darwin-arm64'),
			path.join(process.env.HOME || '', 'Desktop', 'tarx-code-oss', 'extensions', 'tarx-local', 'binaries', 'llama-server-darwin-arm64'),
			path.join(process.env.HOME || '', '.tarx', 'binaries', 'llama-server')
		];

		for (const p of possiblePaths) {
			if (fs.existsSync(p)) {
				return p;
			}
		}

		return possiblePaths[0];
	}

	private async findEmbeddingModel(): Promise<string | undefined> {
		const home = process.env.HOME || '';
		const blobsDir = path.join(home, '.ollama', 'models', 'blobs');

		if (!fs.existsSync(blobsDir)) {
			this.logService.warn(`[TARX Embeddings] Blobs directory not found: ${blobsDir}`);
			return undefined;
		}

		try {
			const entries = fs.readdirSync(blobsDir);

			// Look for nomic embedding model by prefix
			for (const entry of entries) {
				if (entry.startsWith(TARX_EMBEDDINGS_MODEL_PATTERN)) {
					const fullPath = path.join(blobsDir, entry);
					const stat = fs.statSync(fullPath);

					// Nomic model is ~274MB
					if (stat.size > 200 * 1024 * 1024) {
						this.logService.info(`[TARX Embeddings] Found nomic model: ${fullPath} (${Math.round(stat.size / 1024 / 1024)}MB)`);
						return fullPath;
					}
				}
			}
		} catch (e) {
			this.logService.error(`[TARX Embeddings] Failed to search blobs: ${e}`);
		}

		return undefined;
	}

	private async killOrphanedProcesses(): Promise<void> {
		if (process.platform !== 'darwin' && process.platform !== 'linux') {
			return;
		}

		const { exec } = await import('child_process');
		const { promisify } = await import('util');
		const execAsync = promisify(exec);

		try {
			const { stdout } = await execAsync(`lsof -ti :${this.port} 2>/dev/null || true`);
			const pids = stdout.trim().split('\n').filter(p => p);

			if (pids.length === 0) {
				return;
			}

			this.logService.info(`[TARX Embeddings] Found ${pids.length} orphaned process(es) on port ${this.port}`);

			for (const pidStr of pids) {
				const pid = parseInt(pidStr, 10);
				if (!isNaN(pid)) {
					this.logService.info(`[TARX Embeddings] Killing orphaned process (PID: ${pid})`);
					try {
						process.kill(pid, 'SIGKILL');
					} catch (e) {
						this.logService.warn(`[TARX Embeddings] Failed to kill PID ${pid}: ${e}`);
					}
				}
			}

			// Wait for port to free (critical for reliability)
			this.logService.info('[TARX Embeddings] Waiting for port to free...');
			await this.delay(2000);

			// Verify port is free
			const { stdout: checkStdout } = await execAsync(`lsof -ti :${this.port} 2>/dev/null || true`);
			const remaining = checkStdout.trim().split('\n').filter(p => p);
			if (remaining.length > 0) {
				this.logService.warn(`[TARX Embeddings] WARNING: ${remaining.length} process(es) still holding port ${this.port}`);
			} else {
				this.logService.info(`[TARX Embeddings] Port ${this.port} is now free`);
			}
		} catch (e) {
			this.logService.error(`[TARX Embeddings] Failed to kill orphaned processes: ${e}`);
		}
	}

	private async waitForHealth(timeoutMs: number): Promise<void> {
		const startTime = Date.now();
		const pollInterval = 500;

		// Wait for TCP port
		while (Date.now() - startTime < 5000) {
			const portInUse = !(await this.isPortAvailable());
			if (portInUse) {
				this.logService.info(`[TARX Embeddings] TCP port open after ${Date.now() - startTime}ms`);
				break;
			}
			await this.delay(pollInterval);
		}

		// Wait for health endpoint
		while (Date.now() - startTime < timeoutMs) {
			const result = await this.checkHealth();
			if (result.healthy) {
				this.logService.info(`[TARX Embeddings] Health check passed after ${Date.now() - startTime}ms`);
				return;
			}
			await this.delay(pollInterval);
		}

		throw new Error(`Health check timeout after ${timeoutMs}ms`);
	}

	private async isPortAvailable(): Promise<boolean> {
		return new Promise((resolve) => {
			const socket = new net.Socket();
			socket.setTimeout(100);

			socket.on('connect', () => {
				socket.destroy();
				resolve(false);
			});

			socket.on('timeout', () => {
				socket.destroy();
				resolve(true);
			});

			socket.on('error', () => {
				resolve(true);
			});

			socket.connect(this.port, '127.0.0.1');
		});
	}

	private startHealthMonitoring(): void {
		this.stopHealthMonitoring();

		this._healthCheckInterval = setInterval(async () => {
			const result = await this.checkHealth();
			const newState = result.healthy ? TarxHealthState.Healthy : TarxHealthState.Critical;

			if (this._status.healthState !== newState) {
				this._status = { ...this._status, healthState: newState };
				this._onDidChangeStatus.fire(this._status);

				// Auto-restart if unhealthy
				if (!result.healthy && !this._process) {
					this.logService.warn('[TARX Embeddings] Server died, attempting restart...');
					this.startEmbeddings().catch(e => {
						this.logService.error(`[TARX Embeddings] Restart failed: ${e}`);
					});
				}
			}
		}, 10000);
	}

	private stopHealthMonitoring(): void {
		if (this._healthCheckInterval) {
			clearInterval(this._healthCheckInterval);
			this._healthCheckInterval = null;
		}
	}

	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	override dispose(): void {
		this.stopHealthMonitoring();
		if (this._process) {
			this._process.kill('SIGKILL');
			this._process = null;
		}
		super.dispose();
	}
}
