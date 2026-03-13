/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';

export const IAnalyticsService = createDecorator<IAnalyticsService>('analyticsService');

/**
 * Analytics event entry
 */
export interface IAnalyticsEvent {
	event: string;
	properties: Record<string, unknown>;
	timestamp: number;
}

/**
 * TARX Analytics Service Interface
 *
 * Lightweight analytics that:
 * 1. Logs events to console
 * 2. Stores events in memory for later sync
 * 3. Respects tarx.telemetry setting
 */
export interface IAnalyticsService {
	readonly _serviceBrand: undefined;

	/**
	 * Track an analytics event
	 */
	track(event: string, properties?: Record<string, unknown>): void;

	/**
	 * Track an error event
	 */
	trackError(error: Error, context?: Record<string, unknown>): void;

	/**
	 * Check if analytics is enabled
	 */
	isEnabled(): boolean;

	/**
	 * Set analytics enabled state
	 */
	setEnabled(enabled: boolean): void;

	/**
	 * Get all stored events (for debugging/sync)
	 */
	getEvents(): IAnalyticsEvent[];

	/**
	 * Get session duration in milliseconds
	 */
	getSessionDuration(): number;

	/**
	 * Clear stored events
	 */
	clearEvents(): void;
}

/**
 * TARX Analytics Event Names
 */
export const AnalyticsEvents = {
	APP_LAUNCHED: 'app_launched',
	FIRST_CHAT_SENT: 'first_chat_sent',
	CHAT_SENT: 'chat_sent',
	PROJECT_CREATED: 'project_created',
	FILE_UPLOADED: 'file_uploaded',
	VOICE_USED: 'voice_used',
	MESH_CONNECTED: 'mesh_connected',
	ERROR_OCCURRED: 'error_occurred',
	SESSION_ENDED: 'session_ended'
} as const;

/**
 * Configuration key for tarx telemetry setting
 */
export const TARX_TELEMETRY_SETTING = 'tarx.telemetry';

/**
 * TARX Analytics Service Implementation
 *
 * Lightweight analytics without external dependency.
 * Events are logged to console and stored in memory.
 * Later can be synced to SQLite or backend.
 */
export class AnalyticsService extends Disposable implements IAnalyticsService {

	declare readonly _serviceBrand: undefined;

	private _enabled: boolean = true;
	private readonly _sessionStart: number = Date.now();
	private readonly _events: IAnalyticsEvent[] = [];
	private _firstChatSent: boolean = false;

	private static readonly MAX_EVENTS = 1000;
	private static readonly MAX_STACK_LENGTH = 500;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		// Read initial telemetry setting
		this._enabled = this.configurationService.getValue<boolean>(TARX_TELEMETRY_SETTING) ?? true;

		// Listen for configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TARX_TELEMETRY_SETTING)) {
				this._enabled = this.configurationService.getValue<boolean>(TARX_TELEMETRY_SETTING) ?? true;
				this.logService.info(`[TARX Analytics] Telemetry ${this._enabled ? 'enabled' : 'disabled'}`);
			}
		}));

		this.logService.info('[TARX Analytics] Service initialized');
	}

	track(event: string, properties?: Record<string, unknown>): void {
		if (!this._enabled) {
			return;
		}

		// Special handling for first chat
		if (event === AnalyticsEvents.CHAT_SENT && !this._firstChatSent) {
			this._firstChatSent = true;
			this.track(AnalyticsEvents.FIRST_CHAT_SENT, properties);
		}

		const entry: IAnalyticsEvent = {
			event,
			properties: {
				...properties,
				session_ms: Date.now() - this._sessionStart
			},
			timestamp: Date.now()
		};

		// Store event (with max limit to prevent memory issues)
		if (this._events.length < AnalyticsService.MAX_EVENTS) {
			this._events.push(entry);
		}

		// Log to console for debugging
		this.logService.info(`[TARX Analytics] ${event}`, properties || {});
	}

	trackError(error: Error, context?: Record<string, unknown>): void {
		this.track(AnalyticsEvents.ERROR_OCCURRED, {
			error_type: error.name,
			message: error.message,
			stack: error.stack?.slice(0, AnalyticsService.MAX_STACK_LENGTH),
			...context
		});
	}

	isEnabled(): boolean {
		return this._enabled;
	}

	setEnabled(enabled: boolean): void {
		this._enabled = enabled;
		this.logService.info(`[TARX Analytics] Telemetry ${enabled ? 'enabled' : 'disabled'}`);
	}

	getEvents(): IAnalyticsEvent[] {
		return [...this._events];
	}

	getSessionDuration(): number {
		return Date.now() - this._sessionStart;
	}

	clearEvents(): void {
		this._events.length = 0;
	}
}

/**
 * Null implementation for when analytics is completely disabled
 */
export class NullAnalyticsService implements IAnalyticsService {

	declare readonly _serviceBrand: undefined;

	track(_event: string, _properties?: Record<string, unknown>): void {
		// no-op
	}

	trackError(_error: Error, _context?: Record<string, unknown>): void {
		// no-op
	}

	isEnabled(): boolean {
		return false;
	}

	setEnabled(_enabled: boolean): void {
		// no-op
	}

	getEvents(): IAnalyticsEvent[] {
		return [];
	}

	getSessionDuration(): number {
		return 0;
	}

	clearEvents(): void {
		// no-op
	}
}
