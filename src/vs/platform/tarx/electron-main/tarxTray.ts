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
	status: TarxTrayStatus;
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
		status: 'unknown'
	};
	private recentProjects: Array<{ name: string; path: string }> = [];

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

		// Create tray with initial icon
		const iconPath = this.getIconPath('unknown');
		this.tray = new Tray(nativeImage.createFromPath(iconPath));

		// Set tooltip
		this.tray.setToolTip('TARX Workbench');

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
		const iconPath = this.getIconPath(status.status);
		this.tray?.setImage(nativeImage.createFromPath(iconPath));

		// Update tooltip
		const tooltipLines = ['TARX Workbench'];
		if (status.inference) {
			tooltipLines.push('[OK] Inference ready');
		} else {
			tooltipLines.push('[X] Inference offline');
		}
		if (status.embeddings) {
			tooltipLines.push('[OK] Embeddings ready');
		} else {
			tooltipLines.push('[X] Embeddings offline');
		}
		if (status.mesh) {
			tooltipLines.push(`[OK] Mesh: ${status.meshPeers} peers`);
		}

		this.tray?.setToolTip(tooltipLines.join('\n'));

		// Rebuild context menu with new status
		this.updateContextMenu();
	}

	setRecentProjects(projects: Array<{ name: string; path: string }>): void {
		this.recentProjects = projects.slice(0, 5); // Keep only 5 most recent
		this.updateContextMenu();
	}

	private updateContextMenu(): void {
		if (!this.tray) {
			return;
		}

		const menuTemplate: MenuItemConstructorOptions[] = [
			{
				label: 'Quick Chat',
				accelerator: 'CmdOrCtrl+Shift+T',
				click: () => this._onDidRequestQuickChat.fire()
			},
			{ type: 'separator' },
			this.buildStatusMenuItem(),
			{ type: 'separator' }
		];

		// Add recent projects if available
		if (this.recentProjects.length > 0) {
			menuTemplate.push({
				label: 'Recent Projects',
				submenu: this.recentProjects.map(project => ({
					label: project.name,
					click: () => this.openProject(project.path)
				}))
			});
			menuTemplate.push({ type: 'separator' });
		}

		menuTemplate.push(
			{
				label: 'Open TARX Workbench',
				click: () => this._onDidRequestShowWindow.fire()
			},
			{
				label: 'Settings...',
				click: () => this._onDidRequestSettings.fire()
			},
			{ type: 'separator' },
			{
				label: 'Quit TARX',
				click: () => this._onDidRequestQuit.fire()
			}
		);

		const contextMenu = Menu.buildFromTemplate(menuTemplate);
		this.tray.setContextMenu(contextMenu);
	}

	private buildStatusMenuItem(): MenuItemConstructorOptions {
		const statusLabels: Record<TarxTrayStatus, string> = {
			healthy: 'All Systems Healthy',
			degraded: 'Degraded Performance',
			offline: 'Offline',
			unknown: 'Checking...'
		};

		const details: string[] = [];
		details.push(`Inference: ${this.currentStatus.inference ? 'localhost:11435' : 'offline'}`);
		details.push(`Embeddings: ${this.currentStatus.embeddings ? 'localhost:11437' : 'offline'}`);
		if (this.currentStatus.mesh) {
			details.push(`Mesh: ${this.currentStatus.meshPeers} peers`);
		}

		return {
			label: statusLabels[this.currentStatus.status],
			enabled: false,
			sublabel: details.join(' | ')
		};
	}

	private getIconPath(status: TarxTrayStatus): string {
		const appRoot = this.environmentMainService.appRoot;

		// Icon naming convention: tray-<status>Template.png for macOS template images
		const iconName = process.platform === 'darwin'
			? `tray-${status}Template.png`
			: `tray-${status}.png`;

		const possiblePaths = [
			join(appRoot, 'resources', 'icons', iconName),
			join(appRoot, '..', 'Resources', 'icons', iconName),
			join(appRoot, 'extensions', 'tarx', 'media', iconName)
		];

		// Find existing icon or use default
		for (const iconPath of possiblePaths) {
			if (fs.existsSync(iconPath)) {
				return iconPath;
			}
		}

		// Fallback to default icon path
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

	private openProject(projectPath: string): void {
		// This would integrate with the window service to open a project
		this.logService.info(`[TARX Tray] Opening project: ${projectPath}`);
		// Emit event or call window service
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
		const [inference, embeddings, mesh] = await Promise.all([
			this.checkPort(11435),
			this.checkPort(11437),
			this.checkPort(11436)
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
			meshPeers: 0, // Would need to query mesh for actual peer count
			status
		};
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
