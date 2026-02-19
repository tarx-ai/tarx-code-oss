/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *
 *  Credit Bridge — Polls mesh daemon for compute stats, reports delta
 *  to Stripe metered billing every 5 minutes.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { reportMeshUsage, hasStripeKey, getCurrentSubscription } from './stripeService';

const MESH_STATS_URL = 'http://localhost:11436/mesh/status';
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const FETCH_TIMEOUT_MS = 5000;
const LAST_CONSUMED_KEY = 'tarx.creditBridge.lastKnownConsumed';

interface MeshStats {
	connectedNodes: number;
	pendingProposals: number;
	appliedFixes: number;
	computeCreditsConsumed?: number;
	computeCreditsContributed?: number;
}

export class CreditBridge implements vscode.Disposable {
	private _pollInterval: ReturnType<typeof setInterval> | undefined;
	private _lastKnownConsumed: number = 0;
	private _totalReported: number = 0;
	private _globalState: vscode.Memento | undefined;

	constructor() {
		console.log('[TARX CreditBridge] Constructed');
	}

	initialize(context: vscode.ExtensionContext): void {
		this._globalState = context.globalState;
		this._lastKnownConsumed = context.globalState.get(LAST_CONSUMED_KEY, 0);
		console.log('[TARX CreditBridge] Initialized, last consumed:', this._lastKnownConsumed);
	}

	async startPolling(): Promise<void> {
		const hasKey = await hasStripeKey();
		if (!hasKey) {
			console.log('[TARX CreditBridge] No Stripe key, skipping polling');
			return;
		}

		const sub = await getCurrentSubscription();
		if (!sub) {
			console.log('[TARX CreditBridge] No active subscription, skipping polling');
			return;
		}

		console.log('[TARX CreditBridge] Starting 5-minute polling');
		await this._pollAndReport();

		this._pollInterval = setInterval(() => {
			this._pollAndReport();
		}, POLL_INTERVAL_MS);
	}

	stopPolling(): void {
		if (this._pollInterval) {
			clearInterval(this._pollInterval);
			this._pollInterval = undefined;
		}
		console.log('[TARX CreditBridge] Polling stopped');
	}

	private async _pollAndReport(): Promise<void> {
		try {
			const stats = await this._fetchMeshStats();
			if (!stats) { return; }

			// Use actual credits if available, else estimate from fixes
			const consumed = stats.computeCreditsConsumed ?? (stats.appliedFixes * 10);
			const contributed = stats.computeCreditsContributed ?? 0;

			// Only report net consumption (consumed > contributed)
			const netConsumed = Math.max(0, consumed - contributed);
			const delta = netConsumed - this._lastKnownConsumed;

			if (delta <= 0) { return; }

			const success = await reportMeshUsage(delta);
			if (success) {
				this._lastKnownConsumed = netConsumed;
				this._totalReported += delta;
				if (this._globalState) {
					await this._globalState.update(LAST_CONSUMED_KEY, netConsumed);
				}
				console.log(`[TARX CreditBridge] Reported ${delta} credits (total: ${this._totalReported})`);
			}
		} catch (error) {
			console.error('[TARX CreditBridge] Poll error:', error);
		}
	}

	private async _fetchMeshStats(): Promise<MeshStats | null> {
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

			const response = await fetch(MESH_STATS_URL, { signal: controller.signal });
			clearTimeout(timeout);

			if (!response.ok) { return null; }
			return (await response.json()) as MeshStats;
		} catch {
			return null;
		}
	}

	dispose(): void {
		this.stopPolling();
	}
}