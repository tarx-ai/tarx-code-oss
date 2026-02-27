/**
 * TARX CLI — Shared inference engine manager.
 * Detect-or-start: whoever launches first starts llama-server,
 * whoever launches second connects to the existing one.
 * No VS Code dependencies — standalone Node.js module.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const PORT = 11435;
const PID_FILE = path.join(os.homedir(), '.tarx', 'inference.pid');

export async function isInferenceRunning(): Promise<boolean> {
	try {
		const res = await fetch(`http://localhost:${PORT}/health`, {
			signal: AbortSignal.timeout(2000)
		});
		return res.ok;
	} catch {
		return false;
	}
}

export function findBinary(): string | null {
	const home = os.homedir();
	const candidates = [
		path.join(home, '.tarx', 'bin', 'llama-server'),
		// Dev mode: running from repo
		path.join(__dirname, '..', '..', '..', 'tarx-local', 'binaries', 'llama-server-darwin-arm64'),
		path.join(home, 'Desktop', 'tarx-code-oss', 'extensions', 'tarx-local', 'binaries', 'llama-server-darwin-arm64'),
		path.join(home, '.tarx', 'binaries', 'llama-server'),
	];
	for (const p of candidates) {
		if (fs.existsSync(p)) return p;
	}
	return null;
}

export function findModel(): string | null {
	const home = os.homedir();

	// Fine-tuned TARX model — always prefer
	const fineTuned = path.join(home, 'Library/Application Support/tarx/models/tarx-qwen2.5-7b-deep-Q4_K_M.gguf');
	if (fs.existsSync(fineTuned)) return fineTuned;

	// Fallback: scan directories for any valid model
	const searchDirs = [
		path.join(home, 'Library/Application Support/tarx/models'),
		path.join(home, '.ollama/models/blobs'),
	];
	const MIN_SIZE = 500 * 1024 * 1024; // 500MB

	for (const dir of searchDirs) {
		if (!fs.existsSync(dir)) continue;
		try {
			const entries = fs.readdirSync(dir);
			for (const e of entries) {
				const full = path.join(dir, e);
				if (e.toLowerCase().includes('mmproj')) continue;
				if (e.endsWith('.gguf') || e.startsWith('sha256-')) {
					try {
						if (fs.statSync(full).size >= MIN_SIZE) return full;
					} catch { /* skip */ }
				}
			}
		} catch { /* skip */ }
	}

	return null;
}

export function findEmbeddingModel(): string | null {
	const blobsDir = path.join(os.homedir(), '.ollama', 'models', 'blobs');
	if (!fs.existsSync(blobsDir)) return null;
	const PATTERN = 'sha256-970aa74c'; // nomic-embed-text-v1.5
	try {
		for (const entry of fs.readdirSync(blobsDir)) {
			if (entry.startsWith(PATTERN)) {
				const full = path.join(blobsDir, entry);
				if (fs.statSync(full).size > 200 * 1024 * 1024) return full;
			}
		}
	} catch {}
	return null;
}

export async function ensureInferenceRunning(): Promise<{ started: boolean; error?: string }> {
	// Fast path: already healthy
	if (await isInferenceRunning()) return { started: false };

	// Try daemon first
	try {
		const { isDaemonRunning, restartInference } = await import('../daemon-client');
		if (isDaemonRunning()) {
			await restartInference();
			// Wait for health after daemon restart
			for (let i = 0; i < 15; i++) {
				await new Promise(r => setTimeout(r, 1000));
				if (await isInferenceRunning()) return { started: true };
			}
		}
	} catch {}

	// Fallback: direct spawn (original behavior)
	const binary = findBinary();
	if (!binary) return { started: false, error: 'llama-server not found. Install: curl -fsSL tarx.com/install | sh' };

	const model = findModel();
	if (!model) return { started: false, error: 'No AI model found. Download one to ~/Library/Application Support/tarx/models/' };

	const binDir = path.dirname(binary);
	const logFile = path.join(os.homedir(), '.tarx', 'inference.log');
	fs.mkdirSync(path.dirname(logFile), { recursive: true });

	const out = fs.openSync(logFile, 'a');
	const proc = spawn(binary, [
		'--model', model,
		'--host', '127.0.0.1', '--port', String(PORT),
		'--ctx-size', '4096', '--parallel', '1',
		'--n-gpu-layers', '99', '--flash-attn', 'on',
		'--no-warmup', '--metrics'
	], {
		detached: true,
		stdio: ['ignore', out, out],
		env: { ...process.env, DYLD_LIBRARY_PATH: binDir }
	});
	proc.unref();

	fs.writeFileSync(PID_FILE, String(proc.pid));

	// Wait up to 45s for health
	for (let i = 0; i < 45; i++) {
		await new Promise(r => setTimeout(r, 1000));
		if (await isInferenceRunning()) return { started: true };
	}
	return { started: false, error: 'Server started but failed health check after 45s' };
}

const EMBEDDINGS_PORT = 11437;
const EMBEDDINGS_PID_FILE = path.join(os.homedir(), '.tarx', 'embeddings.pid');

export async function isEmbeddingsRunning(): Promise<boolean> {
	try {
		const res = await fetch(`http://localhost:${EMBEDDINGS_PORT}/health`, {
			signal: AbortSignal.timeout(2000)
		});
		return res.ok;
	} catch {
		return false;
	}
}

export async function ensureEmbeddingsRunning(): Promise<{ started: boolean; error?: string }> {
	// Fast path: already healthy
	if (await isEmbeddingsRunning()) return { started: false };

	// Try daemon first
	try {
		const { isDaemonRunning, restartEmbeddings } = await import('../daemon-client');
		if (isDaemonRunning()) {
			await restartEmbeddings();
			for (let i = 0; i < 15; i++) {
				await new Promise(r => setTimeout(r, 1000));
				if (await isEmbeddingsRunning()) return { started: true };
			}
		}
	} catch {}

	// Fallback: direct spawn
	const binary = findBinary();
	if (!binary) return { started: false, error: 'llama-server not found' };

	const model = findEmbeddingModel();
	if (!model) return { started: false, error: 'Embedding model not found (nomic-embed-text-v1.5)' };

	const logFile = path.join(os.homedir(), '.tarx', 'embeddings.log');
	fs.mkdirSync(path.dirname(logFile), { recursive: true });

	const out = fs.openSync(logFile, 'a');
	const proc = spawn(binary, [
		'--model', model,
		'--host', '127.0.0.1', '--port', String(EMBEDDINGS_PORT),
		'--ctx-size', '8192', '--embeddings', '--pooling', 'mean',
		'--parallel', '1', '--no-warmup'
	], {
		detached: true,
		stdio: ['ignore', out, out],
		env: { ...process.env, DYLD_LIBRARY_PATH: path.dirname(binary) }
	});
	proc.unref();

	fs.writeFileSync(EMBEDDINGS_PID_FILE, String(proc.pid));

	for (let i = 0; i < 30; i++) {
		await new Promise(r => setTimeout(r, 1000));
		if (await isEmbeddingsRunning()) return { started: true };
	}
	return { started: false, error: 'Embedding server failed health check after 30s' };
}

export async function stopInference(): Promise<void> {
	// Try daemon first
	try {
		const { isDaemonRunning, stopDaemon } = await import('../daemon-client');
		if (isDaemonRunning()) {
			await stopDaemon();
			return;
		}
	} catch {}

	// Fallback: PID file kill
	if (fs.existsSync(PID_FILE)) {
		const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
		try {
			process.kill(pid, 'SIGTERM');
		} catch { /* already dead */ }
		fs.unlinkSync(PID_FILE);
	}
}
