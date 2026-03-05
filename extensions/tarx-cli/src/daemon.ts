#!/usr/bin/env node
/**
 * TARX Daemon — Always-on background service managing inference + embeddings.
 *
 * Owns llama-server lifecycle for both ports.
 * Survives IDE/CLI close. Restarts crashed services.
 * IPC via Unix socket at ~/.tarx/daemon.sock.
 *
 * Usage: node daemon.js [--foreground]
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';
import * as http from 'http';
import { findBinary, findModel, findEmbeddingModel } from './services/engine';
import { downloadModelsIfNeeded } from './model-download';

const TARX_DIR = path.join(os.homedir(), '.tarx');
const LOGS_DIR = path.join(TARX_DIR, 'logs');
const PID_FILE = path.join(TARX_DIR, 'daemon.pid');
const SOCK_PATH = path.join(TARX_DIR, 'daemon.sock');

const HEALTH_INTERVAL_MS = 10_000;
const RESTART_COOLDOWN_MS = 5_000;
const HEALTH_TIMEOUT_MS = 3_000;
const STARTUP_WAIT_MS = 30_000;

interface ServiceHealth {
	healthy: boolean;
	latencyMs: number;
}

class ServiceManager {
	private _process: ChildProcess | null = null;
	private _startedAt: number = 0;
	private _restartCount: number = 0;

	constructor(
		readonly name: string,
		readonly port: number,
		private readonly buildArgs: (binary: string, model: string) => string[],
		private readonly logFile: string
	) {}

	get pid(): number | undefined { return this._process?.pid; }
	get running(): boolean { return this._process !== null; }
	get uptime(): number { return this._startedAt ? Date.now() - this._startedAt : 0; }

	async start(binary: string, model: string): Promise<boolean> {
		// Fast path: adopt already-healthy external server
		const health = await this.checkHealth();
		if (health.healthy) {
			log(`[${this.name}] External server on :${this.port} (${health.latencyMs}ms) — adopting`);
			this._startedAt = Date.now();
			return true;
		}

		const args = this.buildArgs(binary, model);
		log(`[${this.name}] Spawning: ${binary} ${args.join(' ')}`);

		const out = fs.openSync(this.logFile, 'a');
		try {
			this._process = spawn(binary, args, {
				stdio: ['ignore', out, out],
				env: { ...process.env, DYLD_LIBRARY_PATH: path.dirname(binary) }
			});
		} catch (e: any) {
			log(`[${this.name}] Spawn failed: ${e.message}`);
			fs.closeSync(out);
			return false;
		}

		this._process.on('exit', (code, signal) => {
			log(`[${this.name}] Exited code=${code} signal=${signal}`);
			this._process = null;
		});

		this._process.on('error', (err) => {
			log(`[${this.name}] Error: ${err.message}`);
		});

		this._startedAt = Date.now();
		log(`[${this.name}] PID ${this._process.pid} — waiting for health`);

		// Wait for health
		const deadline = Date.now() + STARTUP_WAIT_MS;
		while (Date.now() < deadline) {
			await delay(1000);
			const h = await this.checkHealth();
			if (h.healthy) {
				log(`[${this.name}] Healthy (${h.latencyMs}ms) after ${Date.now() - this._startedAt}ms`);
				return true;
			}
			if (!this._process) {
				log(`[${this.name}] Process died during startup`);
				return false;
			}
		}

		log(`[${this.name}] Health timeout after ${STARTUP_WAIT_MS}ms`);
		await this.stop();
		return false;
	}

	async stop(): Promise<void> {
		if (!this._process) return;

		const pid = this._process.pid;
		log(`[${this.name}] Stopping PID ${pid}`);

		return new Promise<void>((resolve) => {
			if (!this._process) { resolve(); return; }

			const timeout = setTimeout(() => {
				log(`[${this.name}] SIGKILL after 5s timeout`);
				this._process?.kill('SIGKILL');
			}, 5000);

			this._process.once('exit', () => {
				clearTimeout(timeout);
				this._process = null;
				resolve();
			});

			this._process.kill('SIGTERM');
		});
	}

	async restart(binary: string, model: string): Promise<boolean> {
		await this.stop();
		await delay(RESTART_COOLDOWN_MS);
		this._restartCount++;
		return this.start(binary, model);
	}

	async checkHealth(): Promise<ServiceHealth> {
		const start = Date.now();
		return new Promise((resolve) => {
			const req = http.request({
				hostname: '127.0.0.1',
				port: this.port,
				path: '/health',
				method: 'GET',
				timeout: HEALTH_TIMEOUT_MS
			}, (res) => {
				resolve({ healthy: res.statusCode === 200, latencyMs: Date.now() - start });
				res.resume(); // drain
			});
			req.on('error', () => resolve({ healthy: false, latencyMs: Date.now() - start }));
			req.on('timeout', () => { req.destroy(); resolve({ healthy: false, latencyMs: Date.now() - start }); });
			req.end();
		});
	}

	toJSON() {
		return {
			running: this.running || false,
			pid: this.pid,
			port: this.port,
			healthy: false, // filled by caller after checkHealth
			latencyMs: undefined as number | undefined,
			uptime: this.uptime,
			restarts: this._restartCount
		};
	}
}

// ── Globals ──

const daemonStart = Date.now();
let inference: ServiceManager;
let embeddings: ServiceManager;
let socketServer: net.Server | null = null;
let healthTimer: ReturnType<typeof setInterval> | null = null;
let shuttingDown = false;

function log(msg: string): void {
	const ts = new Date().toISOString();
	const line = `[${ts}] ${msg}\n`;
	process.stderr.write(line);
	try {
		fs.appendFileSync(path.join(LOGS_DIR, 'daemon.log'), line);
	} catch {}
}

function delay(ms: number): Promise<void> {
	return new Promise(r => setTimeout(r, ms));
}

function ctxSize(): string {
	const totalGB = os.totalmem() / (1024 ** 3);
	if (totalGB >= 32) return '16384';
	if (totalGB >= 16) return '8192';
	return '4096';
}

// ── Main ──

async function main() {
	const foreground = process.argv.includes('--foreground');

	// Ensure dirs exist
	fs.mkdirSync(LOGS_DIR, { recursive: true });

	// Check for existing daemon
	if (fs.existsSync(PID_FILE)) {
		try {
			const existingPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
			process.kill(existingPid, 0); // throws if not alive
			log(`Daemon already running (PID ${existingPid}). Exiting.`);
			process.exit(1);
		} catch {
			// stale PID file
			fs.unlinkSync(PID_FILE);
		}
	}

	// Write PID file
	fs.writeFileSync(PID_FILE, String(process.pid));
	log(`Daemon starting (PID ${process.pid})`);

	// Find binary
	const binary = findBinary();
	if (!binary) {
		log('FATAL: llama-server binary not found');
		cleanup();
		process.exit(1);
	}
	log(`Binary: ${binary}`);

	// Download models if needed (first run auto-fetches from HuggingFace)
	log('Checking models...');
	const models = await downloadModelsIfNeeded(
		(p) => {
			process.stderr.write(`\r[tarxd] ${p.file}: ${p.percent}% (${p.speed})   `);
		},
		log
	);

	// Resolve model paths (download result or local discovery fallback)
	const inferenceModel = models.inference || findModel();
	if (!inferenceModel) {
		log('WARNING: No inference model found — inference service will not start');
	}

	const embeddingModel = models.embeddings || findEmbeddingModel();
	if (!embeddingModel) {
		log('WARNING: No embedding model found — embedding service will not start');
	}

	// Create service managers
	inference = new ServiceManager('inference', 11435, (bin, model) => [
		'--model', model,
		'--host', '127.0.0.1', '--port', '11435',
		'--ctx-size', ctxSize(), '--parallel', '1',
		'--n-gpu-layers', '99', '--flash-attn', 'on',
		'--no-warmup', '--metrics'
	], path.join(LOGS_DIR, 'inference.log'));

	embeddings = new ServiceManager('embeddings', 11437, (bin, model) => [
		'--model', model,
		'--host', '127.0.0.1', '--port', '11437',
		'--ctx-size', '8192', '--embeddings', '--pooling', 'mean',
		'--parallel', '1', '--no-warmup'
	], path.join(LOGS_DIR, 'embeddings.log'));

	// Start services (2s stagger)
	if (inferenceModel) {
		const ok = await inference.start(binary, inferenceModel);
		log(`Inference: ${ok ? 'UP' : 'FAILED'}`);
	}

	await delay(2000);

	if (embeddingModel) {
		const ok = await embeddings.start(binary, embeddingModel);
		log(`Embeddings: ${ok ? 'UP' : 'FAILED'}`);
	}

	// Start Unix socket server
	startSocketServer();

	// Start health monitoring
	healthTimer = setInterval(async () => {
		if (shuttingDown) return;

		const binaryPath = findBinary();
		if (!binaryPath) return;

		// Check inference
		if (inferenceModel) {
			const ih = await inference.checkHealth();
			if (!ih.healthy && !inference.running) {
				log('Inference unhealthy + not running — auto-restarting');
				await delay(RESTART_COOLDOWN_MS);
				inference.restart(binaryPath, inferenceModel);
			}
		}

		// Check embeddings
		if (embeddingModel) {
			const eh = await embeddings.checkHealth();
			if (!eh.healthy && !embeddings.running) {
				log('Embeddings unhealthy + not running — auto-restarting');
				await delay(RESTART_COOLDOWN_MS);
				embeddings.restart(binaryPath, embeddingModel);
			}
		}
	}, HEALTH_INTERVAL_MS);

	log('Daemon ready');

	// Signal handlers
	process.on('SIGTERM', gracefulShutdown);
	process.on('SIGINT', gracefulShutdown);
}

function startSocketServer(): void {
	// Remove stale socket
	if (fs.existsSync(SOCK_PATH)) {
		try { fs.unlinkSync(SOCK_PATH); } catch {}
	}

	socketServer = net.createServer((conn) => {
		let buf = '';
		conn.on('data', async (chunk) => {
			buf += chunk.toString();
			const newlineIdx = buf.indexOf('\n');
			if (newlineIdx === -1) return;

			const line = buf.slice(0, newlineIdx);
			buf = buf.slice(newlineIdx + 1);

			let msg: { action: string };
			try {
				msg = JSON.parse(line);
			} catch {
				conn.write(JSON.stringify({ error: 'Invalid JSON' }) + '\n');
				return;
			}

			const response = await handleCommand(msg.action);
			try {
				conn.write(JSON.stringify(response) + '\n');
			} catch {}
		});
	});

	socketServer.listen(SOCK_PATH, () => {
		fs.chmodSync(SOCK_PATH, 0o600);
		log(`Socket server listening at ${SOCK_PATH}`);
	});

	socketServer.on('error', (err) => {
		log(`Socket server error: ${err.message}`);
	});
}

async function handleCommand(action: string): Promise<any> {
	const binary = findBinary();
	const inferenceModel = findModel();
	const embeddingModel = findEmbeddingModel();

	switch (action) {
		case 'status': {
			const ih = await inference.checkHealth();
			const eh = await embeddings.checkHealth();
			const infStatus = inference.toJSON();
			infStatus.healthy = ih.healthy;
			infStatus.latencyMs = ih.latencyMs;
			const embStatus = embeddings.toJSON();
			embStatus.healthy = eh.healthy;
			embStatus.latencyMs = eh.latencyMs;
			return {
				daemon: { pid: process.pid, uptime: Date.now() - daemonStart },
				inference: infStatus,
				embeddings: embStatus
			};
		}

		case 'stop':
			log('Stop command received');
			// Respond first, then shutdown
			setTimeout(() => gracefulShutdown(), 100);
			return { ok: true, message: 'Shutting down' };

		case 'restart':
			log('Restart command received');
			if (binary && inferenceModel) await inference.restart(binary, inferenceModel);
			if (binary && embeddingModel) await embeddings.restart(binary, embeddingModel);
			return { ok: true, message: 'Services restarted' };

		case 'restart-inference':
			if (binary && inferenceModel) {
				const ok = await inference.restart(binary, inferenceModel);
				return { ok, message: ok ? 'Inference restarted' : 'Inference restart failed' };
			}
			return { ok: false, message: 'No binary or model found' };

		case 'restart-embeddings':
			if (binary && embeddingModel) {
				const ok = await embeddings.restart(binary, embeddingModel);
				return { ok, message: ok ? 'Embeddings restarted' : 'Embeddings restart failed' };
			}
			return { ok: false, message: 'No binary or model found' };

		default:
			return { error: `Unknown action: ${action}` };
	}
}

async function gracefulShutdown(): Promise<void> {
	if (shuttingDown) return;
	shuttingDown = true;
	log('Graceful shutdown initiated');

	if (healthTimer) { clearInterval(healthTimer); healthTimer = null; }

	await Promise.all([
		inference?.stop(),
		embeddings?.stop()
	]);

	socketServer?.close();
	cleanup();
	log('Daemon stopped');
	process.exit(0);
}

function cleanup(): void {
	try { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch {}
	try { if (fs.existsSync(SOCK_PATH)) fs.unlinkSync(SOCK_PATH); } catch {}
}

// Run
main().catch((err) => {
	log(`FATAL: ${err.message}`);
	cleanup();
	process.exit(1);
});
