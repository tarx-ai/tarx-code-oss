/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Health status for all TARX services
 */
export interface HealthStatus {
	inference: boolean;
	mesh: boolean;
	embeddings: boolean;
	inferenceLatency?: number;
	meshLatency?: number;
	embeddingsLatency?: number;
	memoryCount?: number;
	modelName?: string;
	tokensPerSecond?: number;
}

/**
 * Model routing type
 */
export type ModelRoute = 'local' | 'mesh' | 'cloud';

/**
 * TARX Status Bar Manager
 * Creates and manages two status bar items:
 * 1. Health Indicator (left side) - Shows system health with color coding
 * 2. Model Indicator (right side) - Shows current model and allows switching
 */
export class TarxStatusBarManager implements vscode.Disposable {
	private readonly healthItem: vscode.StatusBarItem;
	private readonly modelItem: vscode.StatusBarItem;
	private healthCheckInterval?: NodeJS.Timeout;
	private disposed = false;
	private currentHealth: HealthStatus = {
		inference: false,
		mesh: false,
		embeddings: false
	};
	private currentRoute: ModelRoute = 'local';
	private lastNotificationTime: Map<string, number> = new Map();

	constructor() {
		// Create health indicator (left side, high priority)
		this.healthItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			1000
		);
		this.healthItem.name = 'TARX Health';
		this.healthItem.command = 'tarx.status.showDetails';

		// Create model indicator (right side, near language indicator)
		this.modelItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			100
		);
		this.modelItem.name = 'TARX Model';
		this.modelItem.command = 'tarx.status.switchModel';

		// Initial update
		this.updateStatusBars();

		// Show both items
		this.healthItem.show();
		this.modelItem.show();

		// Start health polling
		this.startHealthPolling();
	}

	/**
	 * Start polling health endpoints every 30 seconds
	 */
	private startHealthPolling(): void {
		// Initial check
		this.checkHealth();

		// Poll every 30 seconds
		this.healthCheckInterval = setInterval(() => {
			this.checkHealth();
		}, 30000);
	}

	/**
	 * Check health of all TARX services
	 */
	private async checkHealth(): Promise<void> {
		if (this.disposed) return;

		const startTime = Date.now();
		const previousHealth = { ...this.currentHealth };

		try {
			const [inference, mesh, embeddings] = await Promise.allSettled([
				this.fetchWithTimeout('http://localhost:11435/health', 3000),
				this.fetchWithTimeout('http://localhost:11436/health', 3000),
				this.fetchWithTimeout('http://localhost:11437/health', 3000),
			]);

			// Update health status
			this.currentHealth.inference = inference.status === 'fulfilled' && inference.value.ok;
			this.currentHealth.mesh = mesh.status === 'fulfilled' && mesh.value.ok;
			this.currentHealth.embeddings = embeddings.status === 'fulfilled' && embeddings.value.ok;

			// Calculate latencies
			if (this.currentHealth.inference && inference.status === 'fulfilled') {
				this.currentHealth.inferenceLatency = Date.now() - startTime;
			}
			if (this.currentHealth.mesh && mesh.status === 'fulfilled') {
				this.currentHealth.meshLatency = Date.now() - startTime;
			}
			if (this.currentHealth.embeddings && embeddings.status === 'fulfilled') {
				this.currentHealth.embeddingsLatency = Date.now() - startTime;
			}

			// Try to get additional metadata from inference server
			if (this.currentHealth.inference) {
				await this.fetchInferenceMetadata();
			}

			// Try to get memory count
			await this.fetchMemoryCount();

			// Check for status changes and notify
			this.checkHealthChanges(previousHealth, this.currentHealth);

			// Update status bars
			this.updateStatusBars();

		} catch (error) {
			console.error('[TARX Status] Health check error:', error);
		}
	}

	/**
	 * Fetch with timeout
	 */
	private async fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetch(url, { signal: controller.signal });
			clearTimeout(timeout);
			return response;
		} catch (error) {
			clearTimeout(timeout);
			throw error;
		}
	}

	/**
	 * Fetch inference server metadata (model name, tokens/sec)
	 */
	private async fetchInferenceMetadata(): Promise<void> {
		try {
			const response = await this.fetchWithTimeout('http://localhost:11435/v1/models', 2000);
			if (response.ok) {
				const data = await response.json();
				// Extract model name if available
				if (data.data && data.data.length > 0) {
					this.currentHealth.modelName = data.data[0].id || 'Qwen 8.2B';
				}
			}
		} catch {
			// Fallback to default
			this.currentHealth.modelName = 'Qwen 8.2B';
		}

		// Mock tokens/sec for now (would need actual endpoint)
		this.currentHealth.tokensPerSecond = 18;
	}

	/**
	 * Fetch memory count from database
	 */
	private async fetchMemoryCount(): Promise<void> {
		try {
			// This would need an actual endpoint - for now we'll skip it
			// const response = await this.fetchWithTimeout('http://localhost:11435/memory/stats', 2000);
			// if (response.ok) {
			//   const data = await response.json();
			//   this.currentHealth.memoryCount = data.count;
			// }
		} catch {
			// Ignore
		}
	}

	/**
	 * Check for health status changes and show notifications
	 */
	private checkHealthChanges(previous: HealthStatus, current: HealthStatus): void {
		const now = Date.now();
		const notificationCooldown = 60000; // 1 minute between same notifications

		// Check inference
		if (previous.inference && !current.inference) {
			if (this.shouldNotify('inference-down', now, notificationCooldown)) {
				vscode.window.showWarningMessage('TARX: Inference server offline. Local AI unavailable.');
			}
		} else if (!previous.inference && current.inference) {
			if (this.shouldNotify('inference-up', now, notificationCooldown)) {
				vscode.window.showInformationMessage('TARX: Inference server restored. Local AI ready.');
			}
		}

		// Check mesh
		if (previous.mesh && !current.mesh) {
			if (this.shouldNotify('mesh-down', now, notificationCooldown)) {
				console.log('[TARX Status] Mesh server offline');
			}
		} else if (!previous.mesh && current.mesh) {
			if (this.shouldNotify('mesh-up', now, notificationCooldown)) {
				console.log('[TARX Status] Mesh server restored');
			}
		}

		// Check embeddings
		if (previous.embeddings && !current.embeddings) {
			if (this.shouldNotify('embeddings-down', now, notificationCooldown)) {
				console.log('[TARX Status] Embeddings server offline');
			}
		} else if (!previous.embeddings && current.embeddings) {
			if (this.shouldNotify('embeddings-up', now, notificationCooldown)) {
				console.log('[TARX Status] Embeddings server restored');
			}
		}

		// Log status changes
		if (previous.inference !== current.inference ||
			previous.mesh !== current.mesh ||
			previous.embeddings !== current.embeddings) {
			console.log('[TARX Status] Health changed:', {
				inference: current.inference,
				mesh: current.mesh,
				embeddings: current.embeddings
			});
		}
	}

	/**
	 * Check if we should show a notification (respects cooldown)
	 */
	private shouldNotify(key: string, now: number, cooldown: number): boolean {
		const last = this.lastNotificationTime.get(key);
		if (!last || now - last > cooldown) {
			this.lastNotificationTime.set(key, now);
			return true;
		}
		return false;
	}

	/**
	 * Update both status bar items
	 */
	private updateStatusBars(): void {
		if (this.disposed) return;

		this.updateHealthItem();
		this.updateModelItem();
	}

	/**
	 * Update health indicator (left side)
	 */
	private updateHealthItem(): void {
		if (this.disposed || !this.healthItem) return;

		try {
			const { inference, mesh, embeddings } = this.currentHealth;

			// Determine overall health status
			let icon = '$(check)';
			let backgroundColor: vscode.ThemeColor | undefined = undefined;

			if (!inference) {
				// Critical: inference down
				icon = '$(error)';
				backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
			} else if (!embeddings) {
				// Warning: embeddings down
				icon = '$(warning)';
				backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
			}

			this.healthItem.text = `${icon} TARX`;
			this.healthItem.backgroundColor = backgroundColor;

		// Build detailed tooltip
		const tooltip: string[] = [];

		// Inference status
		if (inference) {
			const model = this.currentHealth.modelName || 'Qwen 8.2B';
			const speed = this.currentHealth.tokensPerSecond || '?';
			tooltip.push(`🟢 Inference: ${model} (${speed} tok/s)`);
		} else {
			tooltip.push('🔴 Inference: Offline');
		}

		// Mesh status
		if (mesh) {
			tooltip.push('🟢 Mesh: 0 peers');
		} else {
			tooltip.push('🔴 Mesh: Offline');
		}

		// Embeddings status
		if (embeddings) {
			tooltip.push('🟢 Embeddings: Online');
		} else {
			tooltip.push('🔴 Embeddings: Offline');
		}

		// Memory count if available
		if (this.currentHealth.memoryCount !== undefined) {
			tooltip.push(`Memory: ${this.currentHealth.memoryCount} items`);
		}

		tooltip.push('', 'Click for details');

			this.healthItem.tooltip = tooltip.join('\n');
		} catch {
			// Silently ignore errors during status bar updates
		}
	}

	/**
	 * Update model indicator (right side)
	 */
	private updateModelItem(): void {
		if (this.disposed || !this.modelItem) return;

		try {
			let icon = '🏠';
			let label = 'Qwen 8.2B';

			switch (this.currentRoute) {
				case 'local':
					icon = '🏠';
					label = this.currentHealth.modelName || 'Qwen 8.2B';
					break;
				case 'mesh':
					icon = '🌐';
					label = 'Mesh';
					break;
				case 'cloud':
					icon = '☁️';
					label = 'Cloud';
					break;
			}

			this.modelItem.text = `${icon} ${label}`;
			this.modelItem.tooltip = `Current: TARX ${this.currentRoute === 'local' ? 'Local' : this.currentRoute === 'mesh' ? 'Mesh' : 'Cloud'}\n\nClick to switch`;
		} catch {
			// Silently ignore errors during status bar updates
		}
	}

	/**
	 * Show detailed system status
	 */
	async showDetails(): Promise<void> {
		const { inference, mesh, embeddings } = this.currentHealth;

		const lines: string[] = [];
		lines.push('=== TARX System Status ===');
		lines.push('');

		// Inference
		lines.push(`Inference (11435): ${inference ? '✓ Online' : '✗ Offline'}`);
		if (inference && this.currentHealth.inferenceLatency) {
			lines.push(`  Latency: ${this.currentHealth.inferenceLatency}ms`);
			if (this.currentHealth.modelName) {
				lines.push(`  Model: ${this.currentHealth.modelName}`);
			}
			if (this.currentHealth.tokensPerSecond) {
				lines.push(`  Speed: ${this.currentHealth.tokensPerSecond} tok/s`);
			}
		}

		// Mesh
		lines.push(`Mesh (11436): ${mesh ? '✓ Online' : '✗ Offline'}`);
		if (mesh && this.currentHealth.meshLatency) {
			lines.push(`  Latency: ${this.currentHealth.meshLatency}ms`);
		}

		// Embeddings
		lines.push(`Embeddings (11437): ${embeddings ? '✓ Online' : '✗ Offline'}`);
		if (embeddings && this.currentHealth.embeddingsLatency) {
			lines.push(`  Latency: ${this.currentHealth.embeddingsLatency}ms`);
		}

		// Memory
		if (this.currentHealth.memoryCount !== undefined) {
			lines.push('');
			lines.push(`Memory: ${this.currentHealth.memoryCount} items`);
		}

		vscode.window.showInformationMessage(lines.join('\n'));
	}

	/**
	 * Switch model routing
	 */
	async switchModel(): Promise<void> {
		const items: vscode.QuickPickItem[] = [
			{
				label: '$(home) Local',
				description: 'TARX Local (Qwen 8.2B on localhost)',
				detail: this.currentHealth.inference ? 'Available' : 'Offline'
			},
			{
				label: '$(globe) Mesh',
				description: 'TARX Mesh (Distributed inference)',
				detail: this.currentHealth.mesh ? 'Available' : 'Offline'
			},
			{
				label: '$(cloud) Cloud',
				description: 'TARX Cloud (Remote inference)',
				detail: 'Coming soon'
			}
		];

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: 'Select TARX model routing',
			title: 'TARX Model Selection'
		});

		if (!selected) return;

		if (selected.label.includes('Local')) {
			this.currentRoute = 'local';
			vscode.window.showInformationMessage('Switched to TARX Local');
		} else if (selected.label.includes('Mesh')) {
			this.currentRoute = 'mesh';
			vscode.window.showInformationMessage('Switched to TARX Mesh');
		} else if (selected.label.includes('Cloud')) {
			vscode.window.showWarningMessage('TARX Cloud is not yet available');
			return;
		}

		this.updateModelItem();
	}

	/**
	 * Get current health status (for external use)
	 */
	getHealthStatus(): HealthStatus {
		return { ...this.currentHealth };
	}

	/**
	 * Get current model route (for external use)
	 */
	getModelRoute(): ModelRoute {
		return this.currentRoute;
	}

	dispose(): void {
		this.disposed = true;

		if (this.healthCheckInterval) {
			clearInterval(this.healthCheckInterval);
			this.healthCheckInterval = undefined;
		}

		try {
			this.healthItem?.dispose();
		} catch {
			// Ignore - already disposed
		}

		try {
			this.modelItem?.dispose();
		} catch {
			// Ignore - already disposed
		}
	}
}
