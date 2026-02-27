/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
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
	ITarxSidecarService,
	ITarxInferenceStatus,
	ITarxSpawnResult,
	ITarxHardwareConfig,
	ITarxPreflightResult,
	ITarxModelInfo,
	ITarxSpawnRetryConfig,
	TarxHealthState,
	TARX_INFERENCE_PORT,
	DEFAULT_SPAWN_RETRY_CONFIG,
	getTarxModelsDir
} from '../common/tarx.js';
import { totalmem, cpus } from 'os';

/**
 * Model profile for RAM-based optimization
 * Ported from TARX inference_engine.rs ModelProfile
 */
interface ModelProfile {
	ctxSize: number;
	batchSize: number;
	ubatchSize: number;
	cacheType: string;
	gpuLayers: number;
	parallel: number;
}

function getModelProfileForRam(ramGb: number): ModelProfile {
	if (ramGb <= 8) {
		return { ctxSize: 4096, batchSize: 256, ubatchSize: 256, cacheType: 'q4_0', gpuLayers: 99, parallel: 1 };
	} else if (ramGb <= 12) {
		return { ctxSize: 8192, batchSize: 512, ubatchSize: 512, cacheType: 'q4_0', gpuLayers: 99, parallel: 1 };
	} else if (ramGb <= 16) {
		return { ctxSize: 16384, batchSize: 512, ubatchSize: 512, cacheType: 'q8_0', gpuLayers: 99, parallel: 2 };
	} else if (ramGb <= 32) {
		return { ctxSize: 8192, batchSize: 512, ubatchSize: 512, cacheType: 'q8_0', gpuLayers: 99, parallel: 1 };
	} else {
		return { ctxSize: 65536, batchSize: 2048, ubatchSize: 2048, cacheType: 'f16', gpuLayers: 99, parallel: 4 };
	}
}

export class TarxSidecarService extends Disposable implements ITarxSidecarService {
	declare readonly _serviceBrand: undefined;

	private _process: ChildProcess | null = null;
	private _status: ITarxInferenceStatus;
	private _healthCheckInterval: ReturnType<typeof setInterval> | null = null;

	private readonly _onDidChangeStatus = this._register(new Emitter<ITarxInferenceStatus>());
	readonly onDidChangeStatus: Event<ITarxInferenceStatus> = this._onDidChangeStatus.event;

	private readonly _onDidReceiveLog = this._register(new Emitter<string>());
	readonly onDidReceiveLog: Event<string> = this._onDidReceiveLog.event;

	readonly port = TARX_INFERENCE_PORT;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService
	) {
		super();

		this._status = {
			running: false,
			port: this.port,
			modelLoaded: false,
			loadedModels: [],
			healthState: TarxHealthState.Unknown,
			lastHealthCheckMs: 0,
			meshFallbackActive: false
		};

		this.logService.info('[TARX] Sidecar service initialized');
	}

	async startInference(config?: ITarxHardwareConfig): Promise<ITarxSpawnResult> {
		return this.startWithRetry(config, DEFAULT_SPAWN_RETRY_CONFIG);
	}

	private async startWithRetry(
		config: ITarxHardwareConfig = {},
		retryConfig: ITarxSpawnRetryConfig
	): Promise<ITarxSpawnResult> {
		const overallStart = Date.now();
		let lastError: string | undefined;
		let lastPid: number | undefined;

		// Detect external server (CLI-started, previous session, manual)
		if (!this._process) {
			const externalHealth = await this.checkHealth();
			if (externalHealth.healthy) {
				this.logService.info(`[TARX] External inference server detected on :${this.port} (${externalHealth.latencyMs}ms) - adopting`);
				this._status = {
					...this._status,
					running: true,
					healthState: TarxHealthState.Healthy,
					lastHealthCheckMs: externalHealth.latencyMs,
					meshFallbackActive: false
				};
				this._onDidChangeStatus.fire(this._status);
				this.startHealthMonitoring();
				return {
					success: true, attempt: 0,
					elapsedMs: Date.now() - overallStart,
					meshFallbackTriggered: false,
					healthCheckLatencyMs: externalHealth.latencyMs
				};
			}
		}

		// Run pre-flight validation
		const preflight = await this.preflightCheck();
		if (!preflight.isReady()) {
			const errorMsg = `Pre-flight validation failed: ${preflight.errors.join(', ')}`;
			this.logService.error(`[TARX] ${errorMsg}`);

			if (!preflight.modelFound) {
				// No model - trigger mesh fallback immediately
				this.logService.info('[TARX] No model found, activating mesh fallback');
				this._status = { ...this._status, meshFallbackActive: true };
				this._onDidChangeStatus.fire(this._status);

				return {
					success: false,
					attempt: 0,
					elapsedMs: Date.now() - overallStart,
					error: 'No valid model found',
					meshFallbackTriggered: true
				};
			}
		}

		this.logService.info(`[TARX] Starting llama-server with retry logic (max ${retryConfig.maxAttempts} attempts)`);

		for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
			// Calculate exponential backoff delay
			const delayMs = attempt > 1 ? retryConfig.baseDelayMs * (1 << (attempt - 2)) : 0;

			if (delayMs > 0) {
				this.logService.info(`[TARX] Retry attempt ${attempt} after ${delayMs}ms delay...`);
				await this.delay(delayMs);
			}

			try {
				await this.startInternal(config, preflight.modelPath);

				const elapsedMs = Date.now() - overallStart;
				const pid = this._process?.pid;

				// Measure health check latency
				const healthResult = await this.checkHealth();

				this.logService.info(`[TARX] llama-server started successfully on attempt ${attempt} (${elapsedMs}ms, PID: ${pid})`);

				// Clear mesh fallback on success
				this._status = { ...this._status, meshFallbackActive: false, running: true, healthState: TarxHealthState.Healthy };
				this._onDidChangeStatus.fire(this._status);

				// Start health monitoring
				this.startHealthMonitoring();

				return {
					success: true,
					attempt,
					elapsedMs,
					meshFallbackTriggered: false,
					pid,
					healthCheckLatencyMs: healthResult.latencyMs
				};
			} catch (e) {
				const error = e instanceof Error ? e.message : String(e);
				lastError = error;
				lastPid = this._process?.pid;
				this.logService.warn(`[TARX] Spawn attempt ${attempt} failed: ${error}`);

				// Check if we should trigger mesh fallback based on total elapsed time
				const totalElapsed = Date.now() - overallStart;
				if (totalElapsed >= retryConfig.meshFallbackTimeoutMs) {
					this.logService.info(`[TARX] Mesh fallback timeout reached (${totalElapsed}ms >= ${retryConfig.meshFallbackTimeoutMs}ms)`);
					break;
				}
			}
		}

		// All attempts failed - trigger mesh fallback
		const totalElapsed = Date.now() - overallStart;
		this.logService.error(`[TARX] All ${retryConfig.maxAttempts} spawn attempts failed after ${totalElapsed}ms, activating mesh fallback`);

		this._status = { ...this._status, meshFallbackActive: true, running: false, healthState: TarxHealthState.Critical };
		this._onDidChangeStatus.fire(this._status);

		return {
			success: false,
			attempt: retryConfig.maxAttempts,
			elapsedMs: totalElapsed,
			error: lastError,
			meshFallbackTriggered: true,
			pid: lastPid
		};
	}

	private async startInternal(config: ITarxHardwareConfig = {}, modelPath?: string): Promise<void> {
		// Check if already running
		if (this._process) {
			const healthResult = await this.checkHealth();
			if (healthResult.healthy) {
				this.logService.info('[TARX] Existing llama-server is healthy, skipping restart');
				return;
			}
			this.logService.warn('[TARX] Existing llama-server not responding, will restart...');
			await this.stopInference();
		}

		// Kill any orphaned processes
		await this.killOrphanedProcesses();

		// Find model if not provided
		if (!modelPath) {
			modelPath = await this.findModelPath();
		}

		// Get system RAM and select profile
		const systemRamGb = config.maxRamUsageGb || this.getSystemRamGb();
		const profile = getModelProfileForRam(systemRamGb);

		// Apply config overrides
		if (config.contextSize) {
			profile.ctxSize = config.contextSize;
		}
		if (config.gpuLayers !== undefined) {
			profile.gpuLayers = config.gpuLayers;
		}
		if (config.useGpu === false) {
			profile.gpuLayers = 0;
		}

		this.logService.info(`[TARX] Using profile for ${systemRamGb}GB RAM: ctx=${profile.ctxSize}, batch=${profile.batchSize}, cache=${profile.cacheType}`);

		// Calculate inference threads
		const cpuCores = cpus().length;
		const inferenceThreads = Math.max(2, Math.floor(cpuCores / 2) - 1);

		// Build command args
		const args = [
			'--host', '127.0.0.1',
			'--port', String(this.port),
			'--ctx-size', String(profile.ctxSize),
			'--batch-size', String(profile.batchSize),
			'--ubatch-size', String(profile.ubatchSize),
			'--cont-batching',
			'--parallel', '1',
			'--n-gpu-layers', String(profile.gpuLayers),
			'--flash-attn', 'on',
			'--cache-type-k', profile.cacheType,
			'--cache-type-v', profile.cacheType,
			'--threads', String(inferenceThreads),
			'--mlock',
			'--jinja',
			'--metrics',
			'--embeddings',
			'--no-warmup'
		];

		// Add model path if found
		if (modelPath) {
			this.logService.info(`[TARX] Loading model: ${modelPath}`);
			args.push('--model', modelPath);

			// Check for mmproj file
			const mmprojPath = this.findMmprojPath(modelPath);
			if (mmprojPath) {
				this.logService.info(`[TARX] Found mmproj for vision: ${mmprojPath}`);
				args.push('--mmproj', mmprojPath);
			}
		} else {
			this.logService.warn('[TARX] No model found, running in router mode');
		}

		// Get llama-server binary path
		const binaryPath = this.getLlamaServerPath();
		const binariesDir = path.dirname(binaryPath);

		this.logService.info(`[TARX] Spawning llama-server: ${binaryPath}`);

		// Spawn the process
		const env = {
			...process.env,
			DYLD_LIBRARY_PATH: binariesDir // macOS dynamic library path
		};

		this._process = spawn(binaryPath, args, {
			env,
			stdio: ['ignore', 'pipe', 'pipe'],
			detached: false
		});

		// Handle stdout
		this._process.stdout?.on('data', (data: Buffer) => {
			const line = data.toString().trim();
			if (line) {
				this.logService.trace(`[llama-server] ${line}`);
				this._onDidReceiveLog.fire(line);
			}
		});

		// Handle stderr
		this._process.stderr?.on('data', (data: Buffer) => {
			const line = data.toString().trim();
			if (line) {
				this.logService.trace(`[llama-server] ${line}`);
				this._onDidReceiveLog.fire(line);
			}
		});

		// Handle process exit
		this._process.on('exit', (code, signal) => {
			this.logService.info(`[TARX] llama-server exited with code ${code}, signal ${signal}`);
			this._process = null;
			this._status = { ...this._status, running: false, healthState: TarxHealthState.Critical };
			this._onDidChangeStatus.fire(this._status);
		});

		this._process.on('error', (err) => {
			this.logService.error(`[TARX] llama-server error: ${err.message}`);
		});

		this.logService.info(`[TARX] llama-server process spawned on port ${this.port} (PID: ${this._process.pid})`);

		// Wait for server to be ready
		await this.waitForHealth(30000);
	}

	async stopInference(): Promise<void> {
		this.stopHealthMonitoring();

		if (!this._process) {
			this.logService.warn('[TARX] llama-server was not running');
			return;
		}

		const pid = this._process.pid;
		this.logService.info(`[TARX] Stopping llama-server (PID: ${pid})...`);

		return new Promise((resolve) => {
			if (!this._process) {
				resolve();
				return;
			}

			const timeout = setTimeout(() => {
				this.logService.warn('[TARX] SIGTERM timeout, sending SIGKILL...');
				this._process?.kill('SIGKILL');
			}, 5000);

			this._process.once('exit', () => {
				clearTimeout(timeout);
				this._process = null;
				this._status = { ...this._status, running: false, healthState: TarxHealthState.Unknown };
				this._onDidChangeStatus.fire(this._status);
				this.logService.info('[TARX] llama-server stopped');
				resolve();
			});

			// Send SIGTERM for graceful shutdown
			this._process.kill('SIGTERM');
		});
	}

	async restartInference(config?: ITarxHardwareConfig): Promise<ITarxSpawnResult> {
		await this.stopInference();
		return this.startInference(config);
	}

	getStatus(): ITarxInferenceStatus {
		return { ...this._status };
	}

	isRunning(): boolean {
		return this._process !== null;
	}

	async preflightCheck(): Promise<ITarxPreflightResult> {
		const errors: string[] = [];

		// 1. Check if llama-server binary exists
		const binaryPath = this.getLlamaServerPath();
		const binaryExists = fs.existsSync(binaryPath);
		if (!binaryExists) {
			errors.push('llama-server binary not found');
		}

		// 2. Check if port is available
		const portAvailable = await this.isPortAvailable(this.port);
		if (!portAvailable) {
			errors.push(`Port ${this.port} is already in use`);
		}

		// 3. Check for model file
		const modelPath = await this.findModelPath();
		const modelFound = !!modelPath;
		if (!modelFound) {
			errors.push('No valid GGUF model found (>500MB)');
		}

		// 4. Get system RAM
		const systemRamGb = this.getSystemRamGb();
		const profile = getModelProfileForRam(systemRamGb);

		this.logService.info(`[TARX] Pre-flight: binary=${binaryExists}, port=${portAvailable}, model=${modelFound}, ram=${systemRamGb}GB`);

		return {
			binaryExists,
			portAvailable,
			modelFound,
			modelPath,
			systemRamGb,
			recommendedCtxSize: profile.ctxSize,
			errors,
			isReady() {
				return binaryExists && portAvailable && modelFound;
			}
		};
	}

	async checkHealth(): Promise<{ healthy: boolean; latencyMs: number }> {
		const start = Date.now();

		return new Promise((resolve) => {
			const req = http.request({
				hostname: '127.0.0.1',
				port: this.port,
				path: '/health',
				method: 'GET',
				timeout: 5000
			}, (res) => {
				const latencyMs = Date.now() - start;
				const healthy = res.statusCode === 200;
				resolve({ healthy, latencyMs });
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

	async listModels(): Promise<ITarxModelInfo[]> {
		const models: ITarxModelInfo[] = [];
		const minModelSize = 500 * 1024 * 1024; // 500MB

		const modelsDir = getTarxModelsDir();
		if (!fs.existsSync(modelsDir)) {
			return models;
		}

		try {
			const entries = fs.readdirSync(modelsDir);
			for (const entry of entries) {
				const fullPath = path.join(modelsDir, entry);
				const stat = fs.statSync(fullPath);

				if (entry.toLowerCase().endsWith('.gguf') && stat.size >= minModelSize) {
					const hasMmproj = !!this.findMmprojPath(fullPath);
					models.push({
						id: path.basename(entry, '.gguf'),
						path: fullPath,
						sizeBytes: stat.size,
						sizeDisplay: this.formatSize(stat.size),
						hasMmproj
					});
				}
			}
		} catch (e) {
			this.logService.warn(`[TARX] Failed to list models: ${e}`);
		}

		// Sort by size (largest first)
		models.sort((a, b) => b.sizeBytes - a.sizeBytes);
		return models;
	}

	// Private helpers

	private getLlamaServerPath(): string {
		// In development, look in resources directory
		// In production, look in bundled app resources
		const appRoot = this.environmentMainService.appRoot;
		const possiblePaths = [
			path.join(appRoot, 'resources', 'binaries', 'llama-server'),
			path.join(appRoot, '..', 'Resources', 'binaries', 'llama-server'),
			path.join(appRoot, 'binaries', 'llama-server'),
			// Development fallback: tarx-local extension
			path.join(appRoot, 'extensions', 'tarx-local', 'binaries', 'llama-server-darwin-arm64'),
			path.join(process.env.HOME || '', 'Desktop', 'tarx-code-oss', 'extensions', 'tarx-local', 'binaries', 'llama-server-darwin-arm64'),
			// Fallback to home directory
			path.join(process.env.HOME || '', '.tarx', 'bin', 'llama-server'),
			path.join(process.env.HOME || '', '.tarx', 'binaries', 'llama-server')
		];

		for (const p of possiblePaths) {
			if (fs.existsSync(p)) {
				return p;
			}
		}

		// Default path (may not exist)
		return possiblePaths[0];
	}

	private async findModelPath(): Promise<string | undefined> {
		const home = process.env.HOME || '';

		// V1.1: Fine-tuned TARX model - always prefer if present
		const fineTunedModel = path.join(home, 'Library/Application Support/tarx/models/tarx-qwen2.5-7b-deep-Q4_K_M.gguf');
		if (fs.existsSync(fineTunedModel)) {
			this.logService.info(`[TARX] Using fine-tuned model: ${fineTunedModel}`);
			return fineTunedModel;
		}

		// Fallback: scan directories for any valid GGUF
		const minModelSize = 500 * 1024 * 1024;
		const searchDirs = [
			path.join(home, 'Library/Application Support/tarx/models'),
			path.join(home, '.ollama/models/blobs'),
			path.join(home, 'Downloads')
		];

		for (const dir of searchDirs) {
			if (!fs.existsSync(dir)) {
				continue;
			}

			try {
				const entries = fs.readdirSync(dir);

				// Collect valid models
				const models: Array<{ path: string; size: number; isCoder: boolean }> = [];

				for (const entry of entries) {
					const fullPath = path.join(dir, entry);
					const lowerName = entry.toLowerCase();

					// Skip mmproj files
					if (lowerName.includes('mmproj')) {
						continue;
					}

					const isGguf = lowerName.endsWith('.gguf');
					const isOllamaBlob = entry.startsWith('sha256-') && !entry.includes('.');

					if (isGguf || isOllamaBlob) {
						try {
							const stat = fs.statSync(fullPath);
							if (stat.size >= minModelSize) {
								models.push({
									path: fullPath,
									size: stat.size,
									isCoder: lowerName.includes('coder')
								});
							}
						} catch { /* ignore */ }
					}
				}

				// Sort: coder models first, then by size
				models.sort((a, b) => {
					if (a.isCoder !== b.isCoder) {
						return a.isCoder ? -1 : 1;
					}
					return b.size - a.size;
				});

				if (models.length > 0) {
					const model = models[0];
					const sizeGb = (model.size / (1024 * 1024 * 1024)).toFixed(1);
					this.logService.info(`[TARX] Found ${model.isCoder ? 'CODER' : 'valid'} GGUF (${sizeGb}GB): ${model.path}`);
					return model.path;
				}
			} catch (e) {
				this.logService.warn(`[TARX] Failed to search ${dir}: ${e}`);
			}
		}

		this.logService.warn('[TARX] No valid GGUF model found (>500MB)');
		return undefined;
	}

	private findMmprojPath(modelPath: string): string | undefined {
		const modelDir = path.dirname(modelPath);

		try {
			const entries = fs.readdirSync(modelDir);
			for (const entry of entries) {
				const lowerName = entry.toLowerCase();
				if (lowerName.includes('mmproj') && lowerName.endsWith('.gguf')) {
					return path.join(modelDir, entry);
				}
			}
		} catch { /* ignore */ }

		return undefined;
	}

	private getSystemRamGb(): number {
		return Math.floor(totalmem() / (1024 * 1024 * 1024));
	}

	private async isPortAvailable(port: number): Promise<boolean> {
		return new Promise((resolve) => {
			const socket = new net.Socket();
			socket.setTimeout(100);

			socket.on('connect', () => {
				socket.destroy();
				resolve(false); // Port is in use
			});

			socket.on('timeout', () => {
				socket.destroy();
				resolve(true); // Port is available
			});

			socket.on('error', () => {
				resolve(true); // Port is available
			});

			socket.connect(port, '127.0.0.1');
		});
	}

	private async killOrphanedProcesses(): Promise<void> {
		if (process.platform !== 'darwin' && process.platform !== 'linux') {
			return;
		}

		const { exec } = await import('child_process');
		const { promisify } = await import('util');
		const execAsync = promisify(exec);

		try {
			// Find llama-server processes on our port
			const { stdout } = await execAsync(`lsof -ti :${this.port} 2>/dev/null || true`);
			const pids = stdout.trim().split('\n').filter(p => p);

			for (const pidStr of pids) {
				const pid = parseInt(pidStr, 10);
				if (!isNaN(pid)) {
					this.logService.info(`[TARX] Killing orphaned process on port ${this.port} (PID: ${pid})`);
					try {
						process.kill(pid, 'SIGKILL');
					} catch { /* ignore */ }
				}
			}

			if (pids.length > 0) {
				await this.delay(500);
			}
		} catch { /* ignore */ }
	}

	private async waitForHealth(timeoutMs: number): Promise<void> {
		const startTime = Date.now();
		const pollInterval = 500;

		// Phase 1: Wait for TCP port
		while (Date.now() - startTime < 10000) {
			const portInUse = !(await this.isPortAvailable(this.port));
			if (portInUse) {
				this.logService.info(`[TARX] TCP port open after ${Date.now() - startTime}ms`);
				break;
			}
			await this.delay(pollInterval);
		}

		// Phase 2: Wait for HTTP health endpoint
		while (Date.now() - startTime < timeoutMs) {
			const result = await this.checkHealth();
			if (result.healthy) {
				this.logService.info(`[TARX] Health check passed after ${Date.now() - startTime}ms`);
				return;
			}
			await this.delay(pollInterval);
		}

		this.logService.warn(`[TARX] Health check not confirmed after ${timeoutMs}ms, continuing anyway`);
	}

	private startHealthMonitoring(): void {
		this.stopHealthMonitoring();

		this._healthCheckInterval = setInterval(async () => {
			const result = await this.checkHealth();
			const newState = result.healthy ? TarxHealthState.Healthy : TarxHealthState.Critical;

			if (this._status.healthState !== newState) {
				this._status = {
					...this._status,
					healthState: newState,
					lastHealthCheckMs: result.latencyMs
				};
				this._onDidChangeStatus.fire(this._status);
			}
		}, 10000); // Check every 10 seconds
	}

	private stopHealthMonitoring(): void {
		if (this._healthCheckInterval) {
			clearInterval(this._healthCheckInterval);
			this._healthCheckInterval = null;
		}
	}

	private formatSize(bytes: number): string {
		if (bytes >= 1_000_000_000) {
			return `${(bytes / 1_000_000_000).toFixed(1)}GB`;
		}
		return `${Math.round(bytes / 1_000_000)}MB`;
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
