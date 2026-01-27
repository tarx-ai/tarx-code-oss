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

		const health = await this._tarxClient.checkHealth();

		if (this._disposed) return;

		if (health.healthy) {
			this._statusBarItem.text = `$(robot) TARX`;
			this._statusBarItem.tooltip = health.model
				? `TARX: Connected (${health.model}) - ${health.latencyMs}ms`
				: `TARX: Connected - ${health.latencyMs}ms`;
			this._statusBarItem.backgroundColor = undefined;
		} else {
			this._statusBarItem.text = `$(robot) TARX`;
			this._statusBarItem.tooltip = 'TARX: Not Connected - Click to check status';
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
		}
		this._statusBarItem.dispose();
	}
}
