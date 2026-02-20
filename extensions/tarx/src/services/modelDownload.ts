/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX Model Download Progress Tracker
 *  - Tracks download progress with toast updates
 *  - Shows ETA and download speed
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { toastManager } from './toastManager';

export interface DownloadProgress {
	downloaded: number;
	total: number;
	percent: number;
	speed_mbps: number;
	eta_seconds: number;
}

export interface ModelCheckResult {
	exists: boolean;
	modelPath?: string;
	modelSizeGB?: string;
	serverHealthy: boolean;
}

export async function trackModelDownload(
	model: string,
	totalSize: number,
	onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
	console.log(`[TARX] Starting model download: ${model} (${(totalSize / (1024 ** 3)).toFixed(1)}GB)`);

	// Show initial toast
	await toastManager.show('download', {
		message: `Downloading ${model} model...`,
		duration: 0,
		type: 'info'
	});

	// Use VS Code progress API for better UX
	return vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: `TARX: Downloading ${model}`,
			cancellable: false
		},
		async (progress) => {
			// Simulate download progress (in real implementation, this would track actual download)
			const downloadTime = 3 * 60 * 1000; // 3 minutes simulation
			const startTime = Date.now();
			const updateInterval = 1000;

			return new Promise<void>((resolve) => {
				const interval = setInterval(() => {
					const elapsed = Date.now() - startTime;
					const progressPercent = Math.min(elapsed / downloadTime, 1);

					const downloadedSize = totalSize * progressPercent;
					const percent = Math.round(progressPercent * 100);
					const speed_mbps = (downloadedSize / elapsed) * 1000 / (1024 ** 2);
					const eta_seconds = Math.max(0, (downloadTime - elapsed) / 1000);

					const downloaded_gb = (downloadedSize / (1024 ** 3)).toFixed(1);
					const total_gb = (totalSize / (1024 ** 3)).toFixed(1);
					const eta_min = Math.ceil(eta_seconds / 60);

					// Update progress bar
					progress.report({
						increment: (updateInterval / downloadTime) * 100,
						message: `${downloaded_gb}GB / ${total_gb}GB (${eta_min}m remaining)`
					});

					// Call progress callback if provided
					if (onProgress) {
						onProgress({
							downloaded: downloadedSize,
							total: totalSize,
							percent,
							speed_mbps,
							eta_seconds
						});
					}

					console.log(`[TARX] Download: ${percent}% (${downloaded_gb}GB / ${total_gb}GB)`);

					if (progressPercent >= 1) {
						clearInterval(interval);
						toastManager.hide('download');
						console.log('[TARX] Model download complete');
						resolve();
					}
				}, updateInterval);
			});
		}
	);
}

export async function checkModelExists(model: string): Promise<boolean> {
	const result = await checkModelStatus(model);
	console.log(`[TARX-CP] Model check: exists=${result.exists}, healthy=${result.serverHealthy}, path=${result.modelPath || 'none'}, size=${result.modelSizeGB || '?'}GB`);
	return result.exists && result.serverHealthy;
}

/**
 * Full model status check: disk scan + llama-server health.
 */
export async function checkModelStatus(model: string): Promise<ModelCheckResult> {
	const result: ModelCheckResult = { exists: false, serverHealthy: false };

	// 1. Scan disk for model files
	const blobsDir = path.join(os.homedir(), '.ollama', 'models', 'blobs');
	try {
		if (fs.existsSync(blobsDir)) {
			const files = fs.readdirSync(blobsDir);
			// Find the largest blob file (inference model GGUF)
			let largestFile = '';
			let largestSize = 0;
			for (const file of files) {
				try {
					const stat = fs.statSync(path.join(blobsDir, file));
					if (stat.size > largestSize) {
						largestSize = stat.size;
						largestFile = file;
					}
				} catch { /* skip unreadable files */ }
			}

			if (largestSize > 500 * 1024 * 1024) { // > 500MB = likely a real model
				result.exists = true;
				result.modelPath = path.join(blobsDir, largestFile);
				result.modelSizeGB = (largestSize / (1024 ** 3)).toFixed(1);
			}
		}
	} catch (e) {
		console.warn('[TARX-CP] Model disk scan failed:', e);
	}

	// Also check common GGUF locations if ollama blobs didn't yield results
	if (!result.exists) {
		const ggufDirs = [
			path.join(os.homedir(), '.cache', 'llama.cpp'),
			path.join(os.homedir(), 'models'),
			path.join(os.homedir(), '.local', 'share', 'llama-server'),
		];
		for (const dir of ggufDirs) {
			try {
				if (!fs.existsSync(dir)) { continue; }
				const files = fs.readdirSync(dir).filter(f => f.endsWith('.gguf'));
				for (const file of files) {
					const stat = fs.statSync(path.join(dir, file));
					if (stat.size > 500 * 1024 * 1024) {
						result.exists = true;
						result.modelPath = path.join(dir, file);
						result.modelSizeGB = (stat.size / (1024 ** 3)).toFixed(1);
						break;
					}
				}
				if (result.exists) { break; }
			} catch { /* skip */ }
		}
	}

	// 2. Check llama-server health (2s timeout)
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 2000);
		const resp = await fetch('http://localhost:11435/health', {
			signal: controller.signal
		});
		clearTimeout(timeout);
		if (resp.ok) {
			result.serverHealthy = true;
		}
	} catch {
		// Server not running or timeout - that's fine
		result.serverHealthy = false;
	}

	return result;
}
