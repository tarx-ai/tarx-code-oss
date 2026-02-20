/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TarxClient } from './tarxClient';

/**
 * Status bar item showing TARX connection status
 */
export class TarxStatusBar implements vscode.Disposable {
	private readonly _statusBarItem: vscode.StatusBarItem;
	private _pollInterval: NodeJS.Timeout | undefined;
	private _disposed = false;

	constructor(private readonly _tarxClient: TarxClient) {
		this._statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			100
		);
		this._statusBarItem.command = 'tarx.showStatus';
		this._statusBarItem.name = 'TARX Status';

		this._update();
		this._startPolling();
		this._statusBarItem.show();
	}

	private async _update(): Promise<void> {
		if (this._disposed) return;

		try {
			const health = await this._tarxClient.checkHealth();

			// Guard: check disposed again after async operation
			if (this._disposed || !this._statusBarItem) return;

			if (health.healthy) {
				this._statusBarItem.text = `$(circle-filled) TARX \u00B7 Local`;
				this._statusBarItem.tooltip = `TARX running locally (${health.latencyMs}ms)`;
				this._statusBarItem.backgroundColor = undefined;
			} else {
				this._statusBarItem.text = `$(loading~spin) TARX \u00B7 Starting`;
				this._statusBarItem.tooltip = 'TARX: Local AI server starting up';
				this._statusBarItem.backgroundColor = undefined;
			}
		} catch {
			if (this._disposed || !this._statusBarItem) { return; }
			this._statusBarItem.text = `$(circle-outline) TARX \u00B7 Offline`;
			this._statusBarItem.tooltip = 'TARX: Local AI server not running';
			this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
		}
	}

	private _startPolling(): void {
		// Poll every 10 seconds
		this._pollInterval = setInterval(() => {
			this._update();
		}, 10000);
	}

	dispose(): void {
		this._disposed = true;
		if (this._pollInterval) {
			clearInterval(this._pollInterval);
			this._pollInterval = undefined;
		}
		try {
			this._statusBarItem?.dispose();
		} catch {
			// Ignore - already disposed
		}
	}
}
