/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  Health Service - Monitors llama-server connection with auto-reconnect
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TarxClient, ChatMessage } from './tarxClient';

export type ConnectionStatus = 'online' | 'offline' | 'connecting' | 'reconnecting';

export interface HealthStatus {
	status: ConnectionStatus;
	latencyMs?: number;
	model?: string;
	lastCheck: number;
	consecutiveFailures: number;
}

export interface QueuedMessage {
	id: string;
	messages: ChatMessage[];
	options: {
		temperature?: number;
		maxTokens?: number;
	};
	timestamp: number;
	retryCount: number;
}

/**
 * Health Service - Monitors server health with auto-reconnect and message queue
 */
export class HealthService implements vscode.Disposable {
	private readonly _onStatusChange = new vscode.EventEmitter<HealthStatus>();
	readonly onStatusChange = this._onStatusChange.event;

	private readonly _onMessageQueued = new vscode.EventEmitter<QueuedMessage>();
	readonly onMessageQueued = this._onMessageQueued.event;

	private readonly _onQueueProcessed = new vscode.EventEmitter<{ success: boolean; messageId: string }>();
	readonly onQueueProcessed = this._onQueueProcessed.event;

	private pollInterval: NodeJS.Timeout | undefined;
	private reconnectTimeout: NodeJS.Timeout | undefined;
	private messageQueue: QueuedMessage[] = [];

	// Storage for queue persistence
	private extensionContext: vscode.ExtensionContext | undefined;
	private readonly QUEUE_STORAGE_KEY = 'tarx.messageQueue';
	private isProcessingQueue = false;

	// State
	private _status: ConnectionStatus = 'connecting';
	private _latencyMs: number | undefined;
	private _model: string | undefined;
	private _lastCheck = 0;
	private _consecutiveFailures = 0;

	// Config
	private readonly POLL_INTERVAL_MS = 10000; // 10 seconds
	private readonly HEALTH_TIMEOUT_MS = 5000; // 5 seconds
	private readonly MAX_BACKOFF_MS = 30000; // 30 seconds max
	private readonly BASE_BACKOFF_MS = 1000; // 1 second initial
	private readonly MAX_RETRY_COUNT = 5;

	constructor(private readonly client: TarxClient) {
		console.log('[TARX Health] Service initialized');
	}

	/**
	 * Initialize with extension context for queue persistence
	 */
	initialize(context: vscode.ExtensionContext): void {
		this.extensionContext = context;
		this.loadPersistedQueue();
		console.log('[TARX Health] Initialized with persistence');
	}

	/**
	 * Load queued messages from persistent storage
	 */
	private loadPersistedQueue(): void {
		if (!this.extensionContext) {
			return;
		}

		try {
			const stored = this.extensionContext.globalState.get<QueuedMessage[]>(this.QUEUE_STORAGE_KEY);
			if (stored && Array.isArray(stored) && stored.length > 0) {
				this.messageQueue = stored;
				console.log(`[TARX Health] Loaded ${stored.length} queued messages from storage`);
			}
		} catch (error) {
			console.error('[TARX Health] Failed to load persisted queue:', error);
		}
	}

	/**
	 * Persist queue to storage
	 */
	private persistQueue(): void {
		if (!this.extensionContext) {
			return;
		}

		try {
			this.extensionContext.globalState.update(this.QUEUE_STORAGE_KEY, this.messageQueue);
		} catch (error) {
			console.error('[TARX Health] Failed to persist queue:', error);
		}
	}

	/**
	 * Get current connection status
	 */
	get status(): ConnectionStatus {
		return this._status;
	}

	/**
	 * Get current health status
	 */
	get healthStatus(): HealthStatus {
		return {
			status: this._status,
			latencyMs: this._latencyMs,
			model: this._model,
			lastCheck: this._lastCheck,
			consecutiveFailures: this._consecutiveFailures
		};
	}

	/**
	 * Check if currently online
	 */
	get isOnline(): boolean {
		return this._status === 'online';
	}

	/**
	 * Get queued message count
	 */
	get queueLength(): number {
		return this.messageQueue.length;
	}

	/**
	 * Start health monitoring
	 */
	startPolling(): void {
		console.log('[TARX Health] Starting health polling');

		// Initial check
		this.checkHealth();

		// Start periodic polling
		this.pollInterval = setInterval(() => {
			this.checkHealth();
		}, this.POLL_INTERVAL_MS);
	}

	/**
	 * Stop health monitoring
	 */
	stopPolling(): void {
		if (this.pollInterval) {
			clearInterval(this.pollInterval);
			this.pollInterval = undefined;
		}
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = undefined;
		}
		console.log('[TARX Health] Polling stopped');
	}

	/**
	 * Check server health
	 */
	async checkHealth(): Promise<boolean> {
		const previousStatus = this._status;
		this._lastCheck = Date.now();

		try {
			const health = await this.client.checkHealth();

			if (health.healthy) {
				this._status = 'online';
				this._latencyMs = health.latencyMs;
				this._model = health.model;
				this._consecutiveFailures = 0;

				// Process queued messages when back online
				if (previousStatus !== 'online' && this.messageQueue.length > 0) {
					console.log(`[TARX Health] Back online, processing ${this.messageQueue.length} queued messages`);
					this.processQueue();
				}

				if (previousStatus !== 'online') {
					console.log(`[TARX Health] Connected to ${health.model} (${health.latencyMs}ms)`);
				}
			} else {
				this.handleOffline();
			}
		} catch {
			this.handleOffline();
		}

		// Emit status change
		if (previousStatus !== this._status) {
			this._onStatusChange.fire(this.healthStatus);
		}

		return this._status === 'online';
	}

	/**
	 * Handle offline state
	 */
	private handleOffline(): void {
		this._consecutiveFailures++;
		const wasOnline = this._status === 'online';

		if (this._consecutiveFailures === 1) {
			this._status = 'offline';
			console.log('[TARX Health] Server offline');
		} else {
			this._status = 'reconnecting';
		}

		// Schedule reconnect with exponential backoff
		if (wasOnline || this._status === 'reconnecting') {
			this.scheduleReconnect();
		}
	}

	/**
	 * Schedule reconnection with exponential backoff
	 */
	private scheduleReconnect(): void {
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
		}

		// Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
		const backoff = Math.min(
			this.BASE_BACKOFF_MS * Math.pow(2, this._consecutiveFailures - 1),
			this.MAX_BACKOFF_MS
		);

		console.log(`[TARX Health] Reconnecting in ${backoff}ms (attempt ${this._consecutiveFailures})`);

		this.reconnectTimeout = setTimeout(() => {
			this.checkHealth();
		}, backoff);
	}

	/**
	 * Force immediate reconnection attempt
	 */
	async forceReconnect(): Promise<boolean> {
		console.log('[TARX Health] Force reconnect requested');
		this._status = 'connecting';
		this._consecutiveFailures = 0;
		this._onStatusChange.fire(this.healthStatus);

		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = undefined;
		}

		return this.checkHealth();
	}

	/**
	 * Queue a message to send when back online
	 */
	queueMessage(messages: ChatMessage[], options: { temperature?: number; maxTokens?: number } = {}): string {
		const queuedMessage: QueuedMessage = {
			id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
			messages,
			options,
			timestamp: Date.now(),
			retryCount: 0
		};

		this.messageQueue.push(queuedMessage);
		this.persistQueue();
		console.log(`[TARX Health] Message queued (${this.messageQueue.length} in queue)`);

		this._onMessageQueued.fire(queuedMessage);

		// Try to process immediately if online
		if (this.isOnline && !this.isProcessingQueue) {
			this.processQueue();
		}

		return queuedMessage.id;
	}

	/**
	 * Get all queued messages
	 */
	getQueuedMessages(): QueuedMessage[] {
		return [...this.messageQueue];
	}

	/**
	 * Clear the message queue
	 */
	clearQueue(): void {
		const count = this.messageQueue.length;
		this.messageQueue = [];
		this.persistQueue();
		console.log(`[TARX Health] Queue cleared (${count} messages removed)`);
	}

	/**
	 * Process queued messages
	 */
	private async processQueue(): Promise<void> {
		if (this.isProcessingQueue || !this.isOnline || this.messageQueue.length === 0) {
			return;
		}

		this.isProcessingQueue = true;
		console.log(`[TARX Health] Processing message queue (${this.messageQueue.length} messages)`);

		while (this.messageQueue.length > 0 && this.isOnline) {
			const message = this.messageQueue[0];

			try {
				// Send the message
				await this.client.chatCompletion(message.messages, message.options);

				// Remove from queue on success
				this.messageQueue.shift();
				this._onQueueProcessed.fire({ success: true, messageId: message.id });
				console.log(`[TARX Health] Queued message sent successfully`);

			} catch (error) {
				message.retryCount++;

				if (message.retryCount >= this.MAX_RETRY_COUNT) {
					// Give up on this message
					this.messageQueue.shift();
					this._onQueueProcessed.fire({ success: false, messageId: message.id });
					console.log(`[TARX Health] Queued message failed after ${this.MAX_RETRY_COUNT} retries`);
				} else {
					// Will retry later
					console.log(`[TARX Health] Queued message failed, will retry (attempt ${message.retryCount})`);
					break;
				}
			}
		}

		this.isProcessingQueue = false;
	}

	/**
	 * Get status text for UI display
	 */
	getStatusText(): string {
		switch (this._status) {
			case 'online':
				return this._model ? `Connected (${this._model})` : 'Connected';
			case 'offline':
				return 'Offline';
			case 'connecting':
				return 'Connecting...';
			case 'reconnecting':
				return `Reconnecting... (${this._consecutiveFailures})`;
			default:
				return 'Unknown';
		}
	}

	/**
	 * Get status icon name for UI
	 */
	getStatusIcon(): string {
		switch (this._status) {
			case 'online':
				return 'check';
			case 'offline':
				return 'error';
			case 'connecting':
			case 'reconnecting':
				return 'sync~spin';
			default:
				return 'question';
		}
	}

	dispose(): void {
		this.stopPolling();
		this._onStatusChange.dispose();
		this._onMessageQueued.dispose();
		this._onQueueProcessed.dispose();
	}
}
