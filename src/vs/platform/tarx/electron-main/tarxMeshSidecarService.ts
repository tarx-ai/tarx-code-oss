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
	ITarxMeshSidecarService,
	ITarxMeshStatus,
	ITarxSpawnResult,
	TarxHealthState,
	TARX_MESH_PORT
} from '../common/tarx.js';

/**
 * TarxMeshSidecarService - manages tarx-mesh binary (port 11436)
 *
 * Rust-based mesh network node for P2P compute sharing.
 * Lightweight sidecar — no model loading, fast startup.
 */
export class TarxMeshSidecarService extends Disposable implements ITarxMeshSidecarService {
	declare readonly _serviceBrand: undefined;

	private _process: ChildProcess | null = null;
	private _status: ITarxMeshStatus;
	private _healthCheckInterval: ReturnType<typeof setInterval> | null = null;
	private _starting: boolean = false;

	private readonly _onDidChangeStatus = this._register(new Emitter<ITarxMeshStatus>());
	readonly onDidChangeStatus: Event<ITarxMeshStatus> = this._onDidChangeStatus.event;

	readonly port = TARX_MESH_PORT;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService
	) {
		super();

		this._status = {
			running: false,
			port: this.port,
			healthState: TarxHealthState.Unknown,
			peerCount: 0
		};

		this.logService.info('[TARX Mesh] Sidecar service initialized');
	}

	async startMesh(): Promise<ITarxSpawnResult> {
		const startTime = Date.now();
		const maxAttempts = 3;
		const retryDelayMs = 3000;

		if (this._starting) {
			this.logService.warn('[TARX Mesh] Start already in progress');
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
					this.logService.info('[TARX Mesh] Server already running and healthy');
					return {
						success: true,
						attempt: 0,
						elapsedMs: Date.now() - startTime,
						meshFallbackTriggered: false,
						pid: this._process.pid
					};
				}
				this.logService.warn('[TARX Mesh] Server not responding, restarting...');
				await this.stopMesh();
			}

			for (let attempt = 1; attempt <= maxAttempts; attempt++) {
				this.logService.info(`[TARX Mesh] Starting... (attempt ${attempt}/${maxAttempts})`);

				// Kill orphaned processes on port
				await this.killOrphanedProcesses();

				// Get mesh binary
				const binaryPath = this.getMeshBinaryPath();
				if (!fs.existsSync(binaryPath)) {
					this.logService.error(`[TARX Mesh] Binary not found: ${binaryPath}`);
					return {
						success: false,
						attempt,
						elapsedMs: Date.now() - startTime,
						error: 'tarx-mesh binary not found',
						meshFallbackTriggered: false
					};
				}

				// Build args
				const home = process.env.HOME || '';
				const dataDir = path.join(home, 'Library/Application Support/tarx/mesh');
				if (!fs.existsSync(dataDir)) {
					fs.mkdirSync(dataDir, { recursive: true });
				}

				const args = [
					'--bind-addr', `127.0.0.1:${this.port}`,
					'--inference-url', 'http://127.0.0.1:11435',
					'--data-dir', dataDir,
					'--log-level', 'info',
					'--mode', 'embedded',
					'--enable-mdns'
				];

				this.logService.info(`[TARX Mesh] Spawning: ${binaryPath}`);
				this.logService.info(`[TARX Mesh] Args: ${args.join(' ')}`);

				this._process = spawn(binaryPath, args, {
					env: { ...process.env },
					stdio: ['ignore', 'pipe', 'pipe'],
					detached: false
				});

				this._process.stdout?.on('data', (data: Buffer) => {
					const line = data.toString().trim();
					if (line) {
						this.logService.info(`[tarx-mesh stdout] ${line}`);
					}
				});

				this._process.stderr?.on('data', (data: Buffer) => {
					const line = data.toString().trim();
					if (line) {
						this.logService.info(`[tarx-mesh stderr] ${line}`);
					}
				});

				this._process.on('exit', (code, signal) => {
					this.logService.info(`[TARX Mesh] Server exited with code ${code}, signal ${signal}`);
					this._process = null;
					this._status = { ...this._status, running: false, healthState: TarxHealthState.Critical };
					this._onDidChangeStatus.fire(this._status);
				});

				this._process.on('error', (err) => {
					this.logService.error(`[TARX Mesh] Server error: ${err.message}`);
				});

				this.logService.info(`[TARX Mesh] Server spawned on port ${this.port} (PID: ${this._process.pid})`);

				try {
					await this.waitForHealth(10000);

					const peerCount = await this.getPeerCount();
					this._status = { ...this._status, running: true, healthState: TarxHealthState.Healthy, peerCount };
					this._onDidChangeStatus.fire(this._status);

					this.startHealthMonitoring();

					this.logService.info(`[TARX Mesh] Ready (${Date.now() - startTime}ms, ${peerCount} peers)`);

					return {
						success: true,
						attempt,
						elapsedMs: Date.now() - startTime,
						meshFallbackTriggered: false,
						pid: this._process?.pid
					};
				} catch (e) {
					const errorMsg = e instanceof Error ? e.message : String(e);
					this.logService.error(`[TARX Mesh] Attempt ${attempt} failed: ${errorMsg}`);
					await this.stopMesh();

					if (attempt < maxAttempts) {
						this.logService.info(`[TARX Mesh] Retrying in ${retryDelayMs}ms...`);
						await this.delay(retryDelayMs);
					} else {
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

	async stopMesh(): Promise<void> {
		this.stopHealthMonitoring();

		if (!this._process) {
			return;
		}

		const pid = this._process.pid;
		this.logService.info(`[TARX Mesh] Stopping server (PID: ${pid})...`);

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
				this._status = { ...this._status, running: false, healthState: TarxHealthState.Unknown, peerCount: 0 };
				this._onDidChangeStatus.fire(this._status);
				this.logService.info('[TARX Mesh] Server stopped');
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

	async getPeerCount(): Promise<number> {
		return new Promise((resolve) => {
			const req = http.request({
				hostname: '127.0.0.1',
				port: this.port,
				path: '/mesh/status',
				method: 'GET',
				timeout: 3000
			}, (res) => {
				let body = '';
				res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
				res.on('end', () => {
					try {
						const data = JSON.parse(body);
						resolve(data.peer_count ?? data.peers?.length ?? 0);
					} catch {
						resolve(0);
					}
				});
			});

			req.on('error', () => resolve(0));
			req.on('timeout', () => { req.destroy(); resolve(0); });
			req.end();
		});
	}

	// Private helpers

	private getMeshBinaryPath(): string {
		const appRoot = this.environmentMainService.appRoot;
		const possiblePaths = [
			path.join(appRoot, 'resources', 'binaries', 'tarx-mesh'),
			path.join(appRoot, '..', 'Resources', 'binaries', 'tarx-mesh'),
			path.join(appRoot, 'binaries', 'tarx-mesh'),
			path.join(appRoot, 'extensions', 'tarx-local', 'binaries', 'tarx-mesh'),
			path.join(process.env.HOME || '', 'Desktop', 'tarx-code-oss', 'extensions', 'tarx-local', 'binaries', 'tarx-mesh'),
			path.join(process.env.HOME || '', '.tarx', 'binaries', 'tarx-mesh')
		];

		for (const p of possiblePaths) {
			if (fs.existsSync(p)) {
				return p;
			}
		}

		return possiblePaths[0];
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

			for (const pidStr of pids) {
				const pid = parseInt(pidStr, 10);
				if (!isNaN(pid)) {
					try {
						const { stdout: psOutput } = await execAsync(`ps -p ${pid} -o comm= 2>/dev/null || true`);
						const processName = psOutput.trim().toLowerCase();

						if (processName.includes('tarx-mesh')) {
							this.logService.info(`[TARX Mesh] Killing orphaned tarx-mesh (PID: ${pid})`);
							try { process.kill(pid, 'SIGKILL'); } catch { /* ignore */ }
						} else {
							this.logService.info(`[TARX Mesh] Skipping non-mesh process on port ${this.port} (PID: ${pid}, name: ${processName})`);
						}
					} catch {
						this.logService.warn(`[TARX Mesh] Could not identify PID ${pid}, skipping`);
					}
				}
			}

			if (pids.length > 0) {
				await this.delay(1000);
			}
		} catch { /* ignore */ }
	}

	private async waitForHealth(timeoutMs: number): Promise<void> {
		const startTime = Date.now();
		const pollInterval = 500;

		while (Date.now() - startTime < 5000) {
			const portInUse = !(await this.isPortAvailable());
			if (portInUse) {
				this.logService.info(`[TARX Mesh] TCP port open after ${Date.now() - startTime}ms`);
				break;
			}
			await this.delay(pollInterval);
		}

		while (Date.now() - startTime < timeoutMs) {
			const result = await this.checkHealth();
			if (result.healthy) {
				this.logService.info(`[TARX Mesh] Health check passed after ${Date.now() - startTime}ms`);
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
			socket.on('connect', () => { socket.destroy(); resolve(false); });
			socket.on('timeout', () => { socket.destroy(); resolve(true); });
			socket.on('error', () => { resolve(true); });
			socket.connect(this.port, '127.0.0.1');
		});
	}

	private startHealthMonitoring(): void {
		this.stopHealthMonitoring();

		this._healthCheckInterval = setInterval(async () => {
			const result = await this.checkHealth();
			const newState = result.healthy ? TarxHealthState.Healthy : TarxHealthState.Critical;

			if (this._status.healthState !== newState) {
				const peerCount = result.healthy ? await this.getPeerCount() : 0;
				this._status = { ...this._status, healthState: newState, peerCount };
				this._onDidChangeStatus.fire(this._status);

				if (!result.healthy && !this._process) {
					this.logService.warn('[TARX Mesh] Server died, attempting restart...');
					this.startMesh().catch(e => {
						this.logService.error(`[TARX Mesh] Restart failed: ${e}`);
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
