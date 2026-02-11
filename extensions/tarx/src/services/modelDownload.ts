/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX Model Download Progress Tracker
 *  - Tracks download progress with toast updates
 *  - Shows ETA and download speed
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { toastManager } from './toastManager';

export interface DownloadProgress {
	downloaded: number;
	total: number;
	percent: number;
	speed_mbps: number;
	eta_seconds: number;
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
	// In real implementation, check if model file exists on disk
	// For now, return false to trigger download flow
	console.log(`[TARX] Checking if model exists: ${model}`);
	return false;
}
