/**
 * Model download — auto-fetches inference + embedding models on first daemon start.
 * Uses native https (no deps). Follows HuggingFace redirects.
 */

import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import * as path from 'path';
import * as os from 'os';

const MODELS_DIR = path.join(os.homedir(), 'Library/Application Support/tarx/models');

const INFERENCE_MODEL = {
	file: 'tarx-v3.Q4_K_M.gguf',
	url: 'https://huggingface.co/Tarxxxxxx/tarx-v3/resolve/main/tarx-v3.Q4_K_M.gguf',
	label: 'Inference model (~4.7 GB)',
	minSize: 500_000_000,
};

const EMBEDDING_MODEL = {
	file: 'nomic-embed-text-v1.5.Q4_K_M.gguf',
	url: 'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q4_K_M.gguf',
	label: 'Embedding model (~95 MB)',
	minSize: 50_000_000,
};

export interface DownloadProgress {
	file: string;
	downloaded: number;
	total: number;
	percent: number;
	speed: string;
}

export type ProgressCallback = (p: DownloadProgress) => void;

function followRedirects(
	url: string,
	onResponse: (res: http.IncomingMessage) => void,
	onError: (err: Error) => void,
	maxRedirects = 5
): void {
	if (maxRedirects <= 0) { onError(new Error('Too many redirects')); return; }

	const mod = url.startsWith('https') ? https : http;
	mod.get(url, { headers: { 'User-Agent': 'tarxd/1.0' } }, (res) => {
		if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
			const loc = res.headers.location;
			if (!loc) { onError(new Error('Redirect without location')); return; }
			res.resume();
			followRedirects(loc, onResponse, onError, maxRedirects - 1);
			return;
		}
		onResponse(res);
	}).on('error', onError);
}

async function downloadFile(
	url: string,
	dest: string,
	label: string,
	minSize: number,
	onProgress?: ProgressCallback
): Promise<void> {
	fs.mkdirSync(path.dirname(dest), { recursive: true });

	// Already present and valid?
	if (fs.existsSync(dest)) {
		try {
			if (fs.statSync(dest).size >= minSize) {
				return; // already downloaded
			}
		} catch {}
	}

	const tmp = dest + '.download';

	return new Promise((resolve, reject) => {
		const file = fs.createWriteStream(tmp);
		let downloaded = 0;
		let total = 0;
		const startTime = Date.now();

		followRedirects(url, (res) => {
			if (res.statusCode !== 200) {
				file.close();
				try { fs.unlinkSync(tmp); } catch {}
				reject(new Error(`HTTP ${res.statusCode} downloading ${label}`));
				return;
			}

			total = parseInt(res.headers['content-length'] || '0', 10);

			res.on('data', (chunk: Buffer) => {
				downloaded += chunk.length;
				file.write(chunk);
				if (onProgress && total > 0) {
					const elapsed = (Date.now() - startTime) / 1000;
					const speed = elapsed > 0 ? downloaded / elapsed : 0;
					const speedStr = speed > 1_000_000
						? `${(speed / 1_000_000).toFixed(1)} MB/s`
						: `${(speed / 1_000).toFixed(0)} KB/s`;
					onProgress({
						file: label,
						downloaded,
						total,
						percent: Math.round((downloaded / total) * 100),
						speed: speedStr,
					});
				}
			});

			res.on('end', () => {
				file.close(() => {
					try {
						const size = fs.statSync(tmp).size;
						if (size < minSize) {
							fs.unlinkSync(tmp);
							reject(new Error(`${label}: download incomplete (${size} bytes)`));
							return;
						}
						fs.renameSync(tmp, dest);
						resolve();
					} catch (e) {
						reject(e);
					}
				});
			});

			res.on('error', (err) => {
				file.close();
				try { fs.unlinkSync(tmp); } catch {}
				reject(err);
			});
		}, (err) => {
			file.close();
			try { fs.unlinkSync(tmp); } catch {}
			reject(err);
		});

		file.on('error', (err) => {
			try { fs.unlinkSync(tmp); } catch {}
			reject(err);
		});
	});
}

export interface ModelPaths {
	inference: string | null;
	embeddings: string | null;
}

export async function downloadModelsIfNeeded(
	onProgress?: ProgressCallback,
	log?: (msg: string) => void
): Promise<ModelPaths> {
	const _log = log || ((msg: string) => process.stderr.write(`[tarxd] ${msg}\n`));

	const inferencePath = path.join(MODELS_DIR, INFERENCE_MODEL.file);
	const embeddingPath = path.join(MODELS_DIR, EMBEDDING_MODEL.file);

	// Check inference model
	const hasInference = fs.existsSync(inferencePath) &&
		fs.statSync(inferencePath).size >= INFERENCE_MODEL.minSize;

	// Check embedding model — also look in Ollama blobs
	const ollamaBlobsDir = path.join(os.homedir(), '.ollama', 'models', 'blobs');
	let embeddingActualPath: string | null = embeddingPath;
	const hasEmbedding = (() => {
		if (fs.existsSync(embeddingPath) && fs.statSync(embeddingPath).size >= EMBEDDING_MODEL.minSize) return true;
		// Check Ollama blobs fallback
		if (fs.existsSync(ollamaBlobsDir)) {
			try {
				for (const entry of fs.readdirSync(ollamaBlobsDir)) {
					if (entry.startsWith('sha256-970aa74c')) {
						const full = path.join(ollamaBlobsDir, entry);
						if (fs.statSync(full).size > 200_000_000) {
							embeddingActualPath = full;
							return true;
						}
					}
				}
			} catch {}
		}
		return false;
	})();

	if (hasInference && hasEmbedding) {
		_log('All models present');
		return { inference: inferencePath, embeddings: embeddingActualPath };
	}

	if (!hasInference) {
		_log(`Downloading ${INFERENCE_MODEL.label}...`);
		try {
			await downloadFile(INFERENCE_MODEL.url, inferencePath, INFERENCE_MODEL.label, INFERENCE_MODEL.minSize, onProgress);
			_log(`${INFERENCE_MODEL.label}: complete`);
		} catch (e: any) {
			_log(`${INFERENCE_MODEL.label}: FAILED — ${e.message}`);
			return {
				inference: null,
				embeddings: hasEmbedding ? embeddingActualPath : null,
			};
		}
	}

	if (!hasEmbedding) {
		_log(`Downloading ${EMBEDDING_MODEL.label}...`);
		try {
			await downloadFile(EMBEDDING_MODEL.url, embeddingPath, EMBEDDING_MODEL.label, EMBEDDING_MODEL.minSize, onProgress);
			_log(`${EMBEDDING_MODEL.label}: complete`);
			embeddingActualPath = embeddingPath;
		} catch (e: any) {
			_log(`${EMBEDDING_MODEL.label}: FAILED — ${e.message}`);
			embeddingActualPath = null;
		}
	}

	return {
		inference: fs.existsSync(inferencePath) ? inferencePath : null,
		embeddings: embeddingActualPath,
	};
}
