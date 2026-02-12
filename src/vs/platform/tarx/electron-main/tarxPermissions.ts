/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { join, dirname, normalize } from '../../../base/common/path.js';
import { dialog, app } from 'electron';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { ILogService } from '../../log/common/log.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';

export const ITarxPermissionService = createDecorator<ITarxPermissionService>('tarxPermissionService');

/**
 * Permission tiers for TARX
 *
 * Tier 0: Zero permissions (default)
 * Tier 1: Basic (file read, clipboard, notifications) - after 3+ sessions
 * Tier 2: Productive (file write, file watcher, system tray, global shortcut)
 * Tier 3: Proactive (background indexing, app awareness, auto-start)
 * Tier 4: Full Agent (shell commands, app automation, per-action approval)
 */
export type TarxPermissionTier = 0 | 1 | 2 | 3 | 4;

export interface TarxPermissionGrant {
	grantedAt: Date;
	scope?: string[]; // For path-scoped permissions
	neverAsk?: boolean; // User selected "Never Ask Again"
}

export interface TarxPermissions {
	tier: TarxPermissionTier;
	sessionCount: number;
	grants: Record<string, TarxPermissionGrant>;
	denials: string[]; // Permissions where user said "Never Ask Again"
}

export interface TarxPermissionRequest {
	key: string;
	reason: string;
	whatItEnables: string[];
	requiredTier: TarxPermissionTier;
	scope?: string[]; // For path-scoped permissions
}

export type TarxPermissionDecision = 'allow' | 'deny' | 'never';

export interface ITarxPermissionService {
	readonly _serviceBrand: undefined;

	readonly onDidChangePermissions: Event<TarxPermissions>;
	readonly onDidChangeTier: Event<TarxPermissionTier>;

	/**
	 * Get current permission tier
	 */
	getTier(): TarxPermissionTier;

	/**
	 * Check if a specific permission is granted
	 */
	hasPermission(key: string): boolean;

	/**
	 * Check if a path is allowed for a permission
	 */
	isPathAllowed(key: string, filePath: string): boolean;

	/**
	 * Request a permission from the user
	 */
	requestPermission(request: TarxPermissionRequest): Promise<TarxPermissionDecision>;

	/**
	 * Request tier upgrade
	 */
	requestTierUpgrade(targetTier: TarxPermissionTier): Promise<boolean>;

	/**
	 * Grant a permission programmatically (for testing/migration)
	 */
	grantPermission(key: string, scope?: string[]): void;

	/**
	 * Revoke a permission
	 */
	revokePermission(key: string): void;

	/**
	 * Increment session count (called on app start)
	 */
	incrementSessionCount(): void;

	/**
	 * Check if we should prompt for tier upgrade
	 */
	shouldPromptForTierUpgrade(): boolean;

	/**
	 * Get all current permissions
	 */
	getPermissions(): TarxPermissions;

	/**
	 * Export permissions for backup/migration
	 */
	exportPermissions(): string;

	/**
	 * Import permissions from backup
	 */
	importPermissions(data: string): boolean;
}

/**
 * TARX Permission Manager
 *
 * Implements progressive permission model:
 * - Users start at Tier 0 (zero permissions)
 * - After 3+ sessions, prompt for Tier 1
 * - Higher tiers require explicit user opt-in
 * - All permissions stored locally, never sent to cloud
 */
export class TarxPermissionService extends Disposable implements ITarxPermissionService {
	declare readonly _serviceBrand: undefined;

	private permissions: TarxPermissions;
	private readonly storagePath: string;

	private readonly _onDidChangePermissions = this._register(new Emitter<TarxPermissions>());
	readonly onDidChangePermissions: Event<TarxPermissions> = this._onDidChangePermissions.event;

	private readonly _onDidChangeTier = this._register(new Emitter<TarxPermissionTier>());
	readonly onDidChangeTier: Event<TarxPermissionTier> = this._onDidChangeTier.event;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IEnvironmentMainService environmentMainService: IEnvironmentMainService
	) {
		super();

		// Initialize storage path
		this.storagePath = this.getStoragePath();

		// Load or initialize permissions
		this.permissions = this.loadPermissions();

		this.logService.info(`[TARX Permissions] Initialized: Tier ${this.permissions.tier}, Sessions: ${this.permissions.sessionCount}`);
	}

	getTier(): TarxPermissionTier {
		return this.permissions.tier;
	}

	hasPermission(key: string): boolean {
		return Object.prototype.hasOwnProperty.call(this.permissions.grants, key);
	}

	isPathAllowed(key: string, filePath: string): boolean {
		const grant = this.permissions.grants[key];
		if (!grant) {
			return false;
		}

		// If no scope, permission applies to everything
		if (!grant.scope || grant.scope.length === 0) {
			return true;
		}

		// Check if path is within any allowed scope
		const normalizedPath = normalize(filePath);
		return grant.scope.some(allowedPath => {
			const normalizedAllowed = normalize(allowedPath);
			return normalizedPath.startsWith(normalizedAllowed);
		});
	}

	async requestPermission(request: TarxPermissionRequest): Promise<TarxPermissionDecision> {
		// Check if already granted
		if (this.hasPermission(request.key)) {
			return 'allow';
		}

		// Check if user said "Never Ask Again"
		if (this.permissions.denials.includes(request.key)) {
			return 'deny';
		}

		// Check tier requirement
		if (this.permissions.tier < request.requiredTier) {
			const tierUpgraded = await this.requestTierUpgrade(request.requiredTier);
			if (!tierUpgraded) {
				return 'deny';
			}
		}

		// Show consent dialog
		const decision = await this.showConsentDialog(request);

		// Process decision
		if (decision === 'allow') {
			this.grantPermission(request.key, request.scope);
		} else if (decision === 'never') {
			this.permissions.denials.push(request.key);
			this.savePermissions();
		}

		return decision;
	}

	async requestTierUpgrade(targetTier: TarxPermissionTier): Promise<boolean> {
		if (this.permissions.tier >= targetTier) {
			return true;
		}

		const tierDescriptions: Record<TarxPermissionTier, { title: string; features: string[] }> = {
			0: { title: 'Zero Permissions', features: [] },
			1: {
				title: 'Basic Access',
				features: [
					'Read files in Documents, Desktop, Downloads',
					'Read clipboard to paste context',
					'Show notifications when tasks complete'
				]
			},
			2: {
				title: 'Productive Mode',
				features: [
					'Write files in your project directories',
					'Watch files for changes and auto-index',
					'System tray with quick access',
					'Global keyboard shortcut (Cmd+Shift+T)'
				]
			},
			3: {
				title: 'Proactive Assistant',
				features: [
					'Index files in the background when idle',
					'Detect which app is focused for context',
					'Proactive suggestions based on your activity',
					'Start automatically on login'
				]
			},
			4: {
				title: 'Full Agent Mode',
				features: [
					'Execute shell commands (with your approval each time)',
					'Automate apps via AppleScript/PowerShell',
					'Act on your behalf (with confirmation)'
				]
			}
		};

		const tierInfo = tierDescriptions[targetTier];

		const result = await dialog.showMessageBox({
			type: 'question',
			title: `Upgrade to ${tierInfo.title}?`,
			message: `TARX can be more helpful with ${tierInfo.title.toLowerCase()} capabilities.`,
			detail: `This enables:\n${tierInfo.features.map(f => `• ${f}`).join('\n')}\n\nYour data stays on this device. TARX never sends your files to the cloud.`,
			buttons: ['Enable', 'Not Now'],
			defaultId: 0,
			cancelId: 1
		});

		if (result.response === 0) {
			const oldTier = this.permissions.tier;
			this.permissions.tier = targetTier;
			this.savePermissions();
			this._onDidChangeTier.fire(targetTier);
			this.logService.info(`[TARX Permissions] Tier upgraded: ${oldTier} → ${targetTier}`);
			return true;
		}

		return false;
	}

	grantPermission(key: string, scope?: string[]): void {
		this.permissions.grants[key] = {
			grantedAt: new Date(),
			scope
		};
		this.savePermissions();
		this._onDidChangePermissions.fire(this.permissions);
		this.logService.info(`[TARX Permissions] Granted: ${key}${scope ? ` (scope: ${scope.join(', ')})` : ''}`);
	}

	revokePermission(key: string): void {
		if (Object.prototype.hasOwnProperty.call(this.permissions.grants, key)) {
			delete this.permissions.grants[key];
			this.savePermissions();
			this._onDidChangePermissions.fire(this.permissions);
			this.logService.info(`[TARX Permissions] Revoked: ${key}`);
		}
	}

	incrementSessionCount(): void {
		this.permissions.sessionCount++;
		this.savePermissions();
		this.logService.info(`[TARX Permissions] Session count: ${this.permissions.sessionCount}`);
	}

	shouldPromptForTierUpgrade(): boolean {
		// Prompt for Tier 1 after 3 sessions
		if (this.permissions.tier === 0 && this.permissions.sessionCount >= 3) {
			return true;
		}
		return false;
	}

	getPermissions(): TarxPermissions {
		return { ...this.permissions };
	}

	exportPermissions(): string {
		return JSON.stringify(this.permissions, null, 2);
	}

	importPermissions(data: string): boolean {
		try {
			const imported = JSON.parse(data) as TarxPermissions;

			// Validate structure
			if (typeof imported.tier !== 'number' ||
				typeof imported.sessionCount !== 'number' ||
				typeof imported.grants !== 'object' ||
				!Array.isArray(imported.denials)) {
				throw new Error('Invalid permissions format');
			}

			this.permissions = imported;
			this.savePermissions();
			this._onDidChangePermissions.fire(this.permissions);
			this._onDidChangeTier.fire(this.permissions.tier);

			this.logService.info('[TARX Permissions] Imported permissions');
			return true;
		} catch (error) {
			this.logService.error(`[TARX Permissions] Import failed: ${error}`);
			return false;
		}
	}

	private async showConsentDialog(request: TarxPermissionRequest): Promise<TarxPermissionDecision> {
		const result = await dialog.showMessageBox({
			type: 'question',
			title: 'TARX Permission Request',
			message: `TARX would like to ${request.reason}`,
			detail: `This enables:\n${request.whatItEnables.map(e => `• ${e}`).join('\n')}\n\nYour data stays on this device.`,
			buttons: ['Allow', 'Not Now', 'Never Ask Again'],
			defaultId: 0,
			cancelId: 1
		});

		const decisions: TarxPermissionDecision[] = ['allow', 'deny', 'never'];
		return decisions[result.response];
	}

	private getStoragePath(): string {
		const userDataPath = app.getPath('userData');
		return join(userDataPath, 'tarx-permissions.json');
	}

	private loadPermissions(): TarxPermissions {
		try {
			if (fs.existsSync(this.storagePath)) {
				const data = fs.readFileSync(this.storagePath, 'utf8');
				const loaded = JSON.parse(data) as TarxPermissions;

				// Migrate old format if needed
				if (!loaded.denials) {
					loaded.denials = [];
				}

				return loaded;
			}
		} catch (error) {
			this.logService.error(`[TARX Permissions] Failed to load: ${error}`);
		}

		// Return default permissions (Tier 0)
		return {
			tier: 0,
			sessionCount: 0,
			grants: {},
			denials: []
		};
	}

	private savePermissions(): void {
		try {
			const dir = dirname(this.storagePath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			fs.writeFileSync(this.storagePath, JSON.stringify(this.permissions, null, 2), 'utf8');
		} catch (error) {
			this.logService.error(`[TARX Permissions] Failed to save: ${error}`);
		}
	}

	override dispose(): void {
		this.savePermissions();
		super.dispose();
	}
}

/**
 * Standard permission keys
 */
export const TarxPermissionKeys = {
	// Tier 1
	FILE_READ_DOCUMENTS: 'fileRead.documents',
	FILE_READ_DESKTOP: 'fileRead.desktop',
	FILE_READ_DOWNLOADS: 'fileRead.downloads',
	CLIPBOARD_READ: 'clipboard.read',
	NOTIFICATIONS: 'notifications',

	// Tier 2
	FILE_WRITE: 'fileWrite',
	FILE_WATCH: 'fileWatch',
	SYSTEM_TRAY: 'systemTray',
	GLOBAL_SHORTCUT: 'globalShortcut',
	CONTEXT_MENU: 'contextMenu',

	// Tier 3
	BACKGROUND_INDEX: 'backgroundIndex',
	APP_AWARENESS: 'appAwareness',
	AUTO_START: 'autoStart',
	PROACTIVE_SUGGESTIONS: 'proactiveSuggestions',

	// Tier 4
	SHELL_EXECUTION: 'shellExecution',
	APP_AUTOMATION: 'appAutomation',
	BROWSER_INTEGRATION: 'browserIntegration'
} as const;
