/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Notification, shell } from 'electron';
import { join } from '../../../base/common/path.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { ILogService } from '../../log/common/log.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';

export const ITarxNotificationService = createDecorator<ITarxNotificationService>('tarxNotificationService');

export type TarxNotificationCategory = 'task-complete' | 'error' | 'suggestion' | 'update' | 'info';

export interface TarxNotificationAction {
	label: string;
	callback: () => void;
}

export interface TarxNotificationOptions {
	title: string;
	body: string;
	category: TarxNotificationCategory;
	actions?: TarxNotificationAction[];
	silent?: boolean;
	urgency?: 'low' | 'normal' | 'critical';
	/** Optional URL to open when notification is clicked */
	clickUrl?: string;
	/** Optional callback when notification is clicked */
	onClick?: () => void;
}

export interface ITarxNotificationService {
	readonly _serviceBrand: undefined;

	readonly onDidClick: Event<TarxNotificationOptions>;
	readonly onDidDismiss: Event<TarxNotificationOptions>;
	readonly onDidAction: Event<{ notification: TarxNotificationOptions; actionIndex: number }>;

	/**
	 * Show a notification
	 * Rate limited to max 3 per hour (unless critical)
	 */
	show(options: TarxNotificationOptions): boolean;

	/**
	 * Show a task completion notification
	 */
	showTaskComplete(title: string, body: string, onClick?: () => void): boolean;

	/**
	 * Show an error notification
	 */
	showError(title: string, body: string, actions?: TarxNotificationAction[]): boolean;

	/**
	 * Show a suggestion notification
	 */
	showSuggestion(title: string, body: string, actions?: TarxNotificationAction[]): boolean;

	/**
	 * Show an update available notification
	 */
	showUpdate(version: string, releaseNotes?: string): boolean;

	/**
	 * Check if notifications are supported
	 */
	isSupported(): boolean;

	/**
	 * Get notification count in current hour
	 */
	getHourlyCount(): number;

	/**
	 * Reset hourly rate limit (for testing)
	 */
	resetRateLimit(): void;
}

/**
 * TARX Notification Service
 *
 * Provides native OS notifications with:
 * - Rate limiting (max 3 per hour unless critical)
 * - Action buttons
 * - Category-based styling
 * - Click handling
 */
export class TarxNotificationService extends Disposable implements ITarxNotificationService {
	declare readonly _serviceBrand: undefined;

	private hourlyCount: number = 0;
	private hourStart: number = Date.now();
	private readonly maxPerHour: number = 3;
	private activeNotifications: Map<string, Notification> = new Map();

	private readonly _onDidClick = this._register(new Emitter<TarxNotificationOptions>());
	readonly onDidClick: Event<TarxNotificationOptions> = this._onDidClick.event;

	private readonly _onDidDismiss = this._register(new Emitter<TarxNotificationOptions>());
	readonly onDidDismiss: Event<TarxNotificationOptions> = this._onDidDismiss.event;

	private readonly _onDidAction = this._register(new Emitter<{ notification: TarxNotificationOptions; actionIndex: number }>());
	readonly onDidAction: Event<{ notification: TarxNotificationOptions; actionIndex: number }> = this._onDidAction.event;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService
	) {
		super();
		this.logService.info('[TARX Notifications] Service initialized');
	}

	show(options: TarxNotificationOptions): boolean {
		// Check if supported
		if (!this.isSupported()) {
			this.logService.warn('[TARX Notifications] Notifications not supported on this platform');
			return false;
		}

		// Check rate limit (skip for critical/error)
		if (!this.checkRateLimit(options)) {
			this.logService.info(`[TARX Notifications] Rate limited: ${options.title}`);
			return false;
		}

		try {
			// Build notification
			const notification = new Notification({
				title: this.formatTitle(options.title, options.category),
				body: options.body,
				icon: this.getIcon(options.category),
				silent: options.silent ?? this.shouldBeSilent(options.category),
				urgency: options.urgency ?? this.getDefaultUrgency(options.category),
				actions: options.actions?.map(a => ({
					type: 'button' as const,
					text: a.label
				}))
			});

			// Handle click
			notification.on('click', () => {
				this.logService.trace(`[TARX Notifications] Clicked: ${options.title}`);

				if (options.clickUrl) {
					shell.openExternal(options.clickUrl);
				}

				if (options.onClick) {
					options.onClick();
				}

				this._onDidClick.fire(options);
			});

			// Handle close
			notification.on('close', () => {
				this._onDidDismiss.fire(options);
				this.cleanupNotification(options.title);
			});

			// Handle actions
			notification.on('action', (_event, index) => {
				this.logService.trace(`[TARX Notifications] Action ${index}: ${options.title}`);

				if (options.actions && options.actions[index]) {
					options.actions[index].callback();
				}

				this._onDidAction.fire({ notification: options, actionIndex: index });
			});

			// Show notification
			notification.show();

			// Track active notification
			this.activeNotifications.set(options.title, notification);

			// Increment counter
			this.hourlyCount++;
			this.logService.info(`[TARX Notifications] Shown: ${options.title} (${this.hourlyCount}/${this.maxPerHour} this hour)`);

			return true;
		} catch (error) {
			this.logService.error(`[TARX Notifications] Failed to show: ${error}`);
			return false;
		}
	}

	showTaskComplete(title: string, body: string, onClick?: () => void): boolean {
		return this.show({
			title,
			body,
			category: 'task-complete',
			onClick,
			actions: [
				{ label: 'Open', callback: () => onClick?.() },
				{ label: 'Dismiss', callback: () => { } }
			]
		});
	}

	showError(title: string, body: string, actions?: TarxNotificationAction[]): boolean {
		return this.show({
			title,
			body,
			category: 'error',
			urgency: 'critical',
			actions: actions || [
				{ label: 'Details', callback: () => { } },
				{ label: 'Dismiss', callback: () => { } }
			]
		});
	}

	showSuggestion(title: string, body: string, actions?: TarxNotificationAction[]): boolean {
		return this.show({
			title,
			body,
			category: 'suggestion',
			silent: true, // Suggestions should never make sound
			actions
		});
	}

	showUpdate(version: string, releaseNotes?: string): boolean {
		return this.show({
			title: `TARX ${version} Available`,
			body: releaseNotes || 'A new version of TARX is available.',
			category: 'update',
			actions: [
				{ label: 'Update Now', callback: () => { /* Trigger update */ } },
				{ label: 'Later', callback: () => { } }
			]
		});
	}

	isSupported(): boolean {
		return Notification.isSupported();
	}

	getHourlyCount(): number {
		this.resetHourIfNeeded();
		return this.hourlyCount;
	}

	resetRateLimit(): void {
		this.hourlyCount = 0;
		this.hourStart = Date.now();
	}

	private checkRateLimit(options: TarxNotificationOptions): boolean {
		// Reset hour if needed
		this.resetHourIfNeeded();

		// Critical/error notifications bypass rate limit
		if (options.category === 'error' || options.urgency === 'critical') {
			return true;
		}

		// Check limit
		return this.hourlyCount < this.maxPerHour;
	}

	private resetHourIfNeeded(): void {
		const now = Date.now();
		const oneHour = 60 * 60 * 1000;

		if (now - this.hourStart >= oneHour) {
			this.hourlyCount = 0;
			this.hourStart = now;
		}
	}

	private formatTitle(title: string, category: TarxNotificationCategory): string {
		// Add TARX prefix for branding
		if (category === 'error') {
			return `TARX Error: ${title}`;
		}
		return `TARX: ${title}`;
	}

	private getIcon(category: TarxNotificationCategory): string {
		const appRoot = this.environmentMainService.appRoot;

		// Category-specific icons
		const iconNames: Record<TarxNotificationCategory, string> = {
			'task-complete': 'notification-success.png',
			'error': 'notification-error.png',
			'suggestion': 'notification-suggestion.png',
			'update': 'notification-update.png',
			'info': 'notification-info.png'
		};

		const iconPath = join(appRoot, 'resources', 'icons', iconNames[category]);

		// Fallback to default TARX icon
		const fallbackPath = join(appRoot, 'resources', 'icons', 'tarx-icon.png');

		return iconPath; // In production, would check existence
	}

	private shouldBeSilent(category: TarxNotificationCategory): boolean {
		// Suggestions and info should be silent by default
		return category === 'suggestion' || category === 'info';
	}

	private getDefaultUrgency(category: TarxNotificationCategory): 'low' | 'normal' | 'critical' {
		switch (category) {
			case 'error':
				return 'critical';
			case 'suggestion':
			case 'info':
				return 'low';
			default:
				return 'normal';
		}
	}

	private cleanupNotification(title: string): void {
		this.activeNotifications.delete(title);
	}

	override dispose(): void {
		// Close all active notifications
		for (const notification of this.activeNotifications.values()) {
			notification.close();
		}
		this.activeNotifications.clear();
		super.dispose();
	}
}
