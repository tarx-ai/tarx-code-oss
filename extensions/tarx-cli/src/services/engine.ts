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

export async function ensureInferenceRunning(): Promise<{ started: boolean; error?: string }> {
	if (await isInferenceRunning()) return { started: false };

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

export async function stopInference(): Promise<void> {
	if (fs.existsSync(PID_FILE)) {
		const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
		try {
			process.kill(pid, 'SIGTERM');
		} catch { /* already dead */ }
		fs.unlinkSync(PID_FILE);
	}
}
