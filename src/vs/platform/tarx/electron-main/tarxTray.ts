/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Tray, Menu, nativeImage, BrowserWindow, MenuItemConstructorOptions } from 'electron';
import * as http from 'http';
import * as fs from 'fs';
import { join } from '../../../base/common/path.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { ILogService } from '../../log/common/log.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';

export const ITarxTrayService = createDecorator<ITarxTrayService>('tarxTrayService');

export type TarxTrayStatus = 'healthy' | 'degraded' | 'offline' | 'unknown';

export interface ITarxTrayStatus {
	inference: boolean;
	embeddings: boolean;
	mesh: boolean;
	meshPeers: number;
	memoryChunks: number;
	status: TarxTrayStatus;
	downloadProgress: number | null; // null = no download, 0-100 = in progress
}

export interface ITarxTrayService {
	readonly _serviceBrand: undefined;

	readonly onDidRequestShowWindow: Event<void>;
	readonly onDidRequestQuickChat: Event<void>;
	readonly onDidRequestSettings: Event<void>;
	readonly onDidRequestQuit: Event<void>;

	create(mainWindow: BrowserWindow): void;
	updateStatus(status: ITarxTrayStatus): void;
	setRecentProjects(projects: Array<{ name: string; path: string }>): void;
	dispose(): void;
}

/**
 * TARX System Tray Service
 *
 * Provides a system tray icon with:
 * - Health status indicator (green/yellow/red)
 * - Quick chat access via Cmd+Click
 * - Context menu with recent projects
 * - Health monitoring
 */
export class TarxTrayService extends Disposable implements ITarxTrayService {
	declare readonly _serviceBrand: undefined;

	private tray: Tray | null = null;
	private mainWindow: BrowserWindow | null = null;
	private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
	private currentStatus: ITarxTrayStatus = {
		inference: false,
		embeddings: false,
		mesh: false,
		meshPeers: 0,
		memoryChunks: 0,
		status: 'unknown',
		downloadProgress: null,
	};
	private readonly _onDidRequestShowWindow = this._register(new Emitter<void>());
	readonly onDidRequestShowWindow: Event<void> = this._onDidRequestShowWindow.event;

	private readonly _onDidRequestQuickChat = this._register(new Emitter<void>());
	readonly onDidRequestQuickChat: Event<void> = this._onDidRequestQuickChat.event;

	private readonly _onDidRequestSettings = this._register(new Emitter<void>());
	readonly onDidRequestSettings: Event<void> = this._onDidRequestSettings.event;

	private readonly _onDidRequestQuit = this._register(new Emitter<void>());
	readonly onDidRequestQuit: Event<void> = this._onDidRequestQuit.event;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService
	) {
		super();
		this.logService.info('[TARX Tray] Service initialized');
	}

	create(mainWindow: BrowserWindow): void {
		if (this.tray) {
			this.logService.warn('[TARX Tray] Tray already created');
			return;
		}

		this.mainWindow = mainWindow;

		// Create tray with initial icon (programmatic fallback if no PNG)
		const trayImage = this.getTrayImage('unknown');
		this.tray = new Tray(trayImage);

		// Set tooltip
		this.tray.setToolTip('TARX');

		// Build initial context menu
		this.updateContextMenu();

		// Handle click events
		this.tray.on('click', (event) => {
			if (event.metaKey || event.ctrlKey) {
				// Cmd+Click → Quick chat
				this._onDidRequestQuickChat.fire();
			} else {
				// Regular click → Show/hide window
				this.toggleMainWindow();
			}
		});

		// Handle right-click (same as left-click on Windows)
		this.tray.on('right-click', () => {
			this.tray?.popUpContextMenu();
		});

		// Start health monitoring
		this.startHealthMonitoring();

		this.logService.info('[TARX Tray] Tray created successfully');
	}

	updateStatus(status: ITarxTrayStatus): void {
		this.currentStatus = status;

		// Update icon based on status
		const trayImage = this.getTrayImage(status.status);
		this.tray?.setImage(trayImage);

		// Update tooltip
		const tooltipLines = ['TARX'];
		tooltipLines.push(`Inference: ${status.inference ? 'online' : 'offline'}`);
		tooltipLines.push(`Memory: ${status.embeddings ? 'online' : 'offline'}`);
		if (status.mesh) {
			tooltipLines.push(`SuperComputer: ${status.meshPeers} peers`);
		}
		if (status.downloadProgress !== null && status.downloadProgress < 100) {
			tooltipLines.push(`Download: ${status.downloadProgress}%`);
		}

		this.tray?.setToolTip(tooltipLines.join('\n'));

		// Rebuild context menu with new status
		this.updateContextMenu();
	}

	setRecentProjects(_projects: Array<{ name: string; path: string }>): void {
		// Reserved for future use
	}

	private updateContextMenu(): void {
		if (!this.tray) {
			return;
		}

		const statusDot = this.currentStatus.status === 'healthy' ? '\u25CF'
			: this.currentStatus.status === 'degraded' ? '\u25CB'
			: '\u2717';

		const statusLabel = this.currentStatus.status === 'healthy' ? 'Online'
			: this.currentStatus.status === 'degraded' ? 'Loading'
			: this.currentStatus.status === 'offline' ? 'Offline'
			: 'Checking...';

		const menuTemplate: MenuItemConstructorOptions[] = [
			// Header
			{
				label: `\u269B TARX        ${statusDot} ${statusLabel}`,
				enabled: false,
			},
			{
				label: 'Your personal SuperComputer',
				enabled: false,
			},
		];

		// Download progress (dynamic — shown only during download)
		if (this.currentStatus.downloadProgress !== null && this.currentStatus.downloadProgress < 100) {
			const pct = this.currentStatus.downloadProgress;
			const filled = Math.round(pct / 10);
			const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled);
			menuTemplate.push(
				{ type: 'separator' },
				{
					label: `SuperComputer: ${pct}% ${bar}`,
					enabled: false,
				}
			);
		}

		menuTemplate.push({ type: 'separator' });

		// Open Chat
		menuTemplate.push({
			label: 'Open Chat',
			accelerator: 'CmdOrCtrl+Shift+T',
			click: () => this._onDidRequestQuickChat.fire()
		});

		menuTemplate.push({ type: 'separator' });

		// Install items
		const cliInstalled = this.isCliInstalled();
		const workbenchInstalled = this.isWorkbenchInstalled();

		menuTemplate.push(
			{
				label: cliInstalled ? 'Install CLI               \u2713' : 'Install CLI',
				enabled: !cliInstalled,
				click: () => this.installCli()
			},
			{
				label: workbenchInstalled ? 'Install Workbench         \u2713' : 'Install Workbench',
				enabled: !workbenchInstalled,
				click: () => this._onDidRequestShowWindow.fire()
			},
			{ type: 'separator' },
			{
				label: 'Voice                     coming soon',
				enabled: false,
			},
			{
				label: 'TARX Art                  coming soon',
				enabled: false,
			}
		);

		menuTemplate.push({ type: 'separator' });

		// Status section
		const meshLabel = this.currentStatus.mesh
			? `SuperComputer: ${this.currentStatus.meshPeers} peer${this.currentStatus.meshPeers !== 1 ? 's' : ''} connected`
			: 'SuperComputer: offline';
		const memoryLabel = this.currentStatus.memoryChunks > 0
			? `Memory: ${this.currentStatus.memoryChunks.toLocaleString()} chunks indexed`
			: 'Memory: no chunks indexed';

		menuTemplate.push(
			{ label: meshLabel, enabled: false },
			{ label: memoryLabel, enabled: false }
		);

		menuTemplate.push({ type: 'separator' });

		menuTemplate.push(
			{
				label: 'Preferences...',
				click: () => this._onDidRequestSettings.fire()
			},
			{
				label: 'Quit TARX',
				click: () => this._onDidRequestQuit.fire()
			}
		);

		const contextMenu = Menu.buildFromTemplate(menuTemplate);
		this.tray.setContextMenu(contextMenu);
	}

	private isCliInstalled(): boolean {
		const tarxBin = join(process.env.HOME || '', '.tarx', 'bin', 'tarx');
		const usrLocalBin = '/usr/local/bin/tarx';
		return fs.existsSync(tarxBin) || fs.existsSync(usrLocalBin);
	}

	private isWorkbenchInstalled(): boolean {
		const paths = [
			'/Applications/TARX Workbench.app',
			join(process.env.HOME || '', 'Applications', 'TARX Workbench.app'),
		];
		return paths.some(p => fs.existsSync(p));
	}

	private installCli(): void {
		this.logService.info('[TARX Tray] Starting CLI install');
		const { exec } = require('child_process');
		exec('curl -fsSL tarx.com/install | sh', (err: Error | null) => {
			if (err) {
				this.logService.error(`[TARX Tray] CLI install failed: ${err.message}`);
			} else {
				this.logService.info('[TARX Tray] CLI install complete');
				this.updateContextMenu(); // Refresh to show checkmark
			}
		});
	}

	private getTrayImage(status: TarxTrayStatus): Electron.NativeImage {
		const iconPath = this.getIconPath(status);
		if (fs.existsSync(iconPath)) {
			return nativeImage.createFromPath(iconPath);
		}

		// Programmatic fallback when no PNG exists
		return this.createFallbackIcon(status);
	}

	private createFallbackIcon(status: TarxTrayStatus): Electron.NativeImage {
		// Create a 32x32 (retina) circle indicator via raw RGBA buffer
		// macOS template images: black pixels on transparent — system auto-inverts for dark mode
		const size = 32;
		const buf = Buffer.alloc(size * size * 4, 0); // RGBA, fully transparent

		const cx = size / 2, cy = size / 2, r = 10;
		// Alpha value encodes status: offline is dimmer
		const alpha = status === 'offline' ? 100 : 255;

		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				const dx = x - cx, dy = y - cy;
				if (dx * dx + dy * dy <= r * r) {
					const i = (y * size + x) * 4;
					buf[i] = 0;        // R (black for template)
					buf[i + 1] = 0;    // G
					buf[i + 2] = 0;    // B
					buf[i + 3] = alpha; // A
				}
			}
		}

		const img = nativeImage.createFromBuffer(buf, { width: size, height: size, scaleFactor: 2.0 });
		img.setTemplateImage(true); // macOS auto dark/light mode
		return img;
	}

	private getIconPath(status: TarxTrayStatus): string {
		const appRoot = this.environmentMainService.appRoot;

		// Icon naming convention: tray-<status>Template.png for macOS template images
		const iconName = process.platform === 'darwin'
			? `tray-${status}Template.png`
			: `tray-${status}.png`;

		const possiblePaths = [
			join(appRoot, 'resources', 'tarx', iconName),
			join(appRoot, 'resources', 'icons', iconName),
			join(appRoot, '..', 'Resources', 'tarx', iconName),
		];

		// Find existing icon or return first path (caller checks existence)
		for (const iconPath of possiblePaths) {
			if (fs.existsSync(iconPath)) {
				return iconPath;
			}
		}

		return possiblePaths[0];
	}

	private toggleMainWindow(): void {
		if (!this.mainWindow) {
			return;
		}

		if (this.mainWindow.isVisible() && this.mainWindow.isFocused()) {
			this.mainWindow.hide();
		} else {
			this.mainWindow.show();
			this.mainWindow.focus();
			this._onDidRequestShowWindow.fire();
		}
	}

	private startHealthMonitoring(): void {
		this.stopHealthMonitoring();

		// Check health every 30 seconds
		this.healthCheckInterval = setInterval(async () => {
			const status = await this.checkServices();
			this.updateStatus(status);
		}, 30000);

		// Do initial check
		this.checkServices().then(status => this.updateStatus(status));
	}

	private stopHealthMonitoring(): void {
		if (this.healthCheckInterval) {
			clearInterval(this.healthCheckInterval);
			this.healthCheckInterval = null;
		}
	}

	private async checkServices(): Promise<ITarxTrayStatus> {
		const [inference, embeddings, mesh, meshStatus] = await Promise.all([
			this.checkPort(11435),
			this.checkPort(11437),
			this.checkPort(11436),
			this.fetchJson<{ peer_count?: number }>(11436, '/mesh/status'),
		]);

		let status: TarxTrayStatus = 'unknown';
		if (inference && embeddings) {
			status = 'healthy';
		} else if (inference || embeddings) {
			status = 'degraded';
		} else {
			status = 'offline';
		}

		return {
			inference,
			embeddings,
			mesh,
			meshPeers: meshStatus?.peer_count ?? 0,
			memoryChunks: this.currentStatus.memoryChunks, // Preserved; updated externally
			status,
			downloadProgress: this.currentStatus.downloadProgress, // Preserved; updated externally
		};
	}

	private fetchJson<T>(port: number, path: string): Promise<T | null> {
		return new Promise((resolve) => {
			const req = http.request({
				hostname: '127.0.0.1',
				port,
				path,
				method: 'GET',
				timeout: 3000,
			}, (res) => {
				let data = '';
				res.on('data', (chunk) => { data += chunk; });
				res.on('end', () => {
					try {
						resolve(JSON.parse(data));
					} catch {
						resolve(null);
					}
				});
			});
			req.on('error', () => resolve(null));
			req.on('timeout', () => { req.destroy(); resolve(null); });
			req.end();
		});
	}

	private checkPort(port: number): Promise<boolean> {
		return new Promise((resolve) => {
			const req = http.request({
				hostname: '127.0.0.1',
				port,
				path: '/health',
				method: 'GET',
				timeout: 2000
			}, (res) => {
				resolve(res.statusCode === 200);
			});

			req.on('error', () => resolve(false));
			req.on('timeout', () => {
				req.destroy();
				resolve(false);
			});

			req.end();
		});
	}

	override dispose(): void {
		this.stopHealthMonitoring();
		if (this.tray) {
			this.tray.destroy();
			this.tray = null;
		}
		super.dispose();
	}
}
