/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * TarxDashboardPanel — manages a webview panel for the TARX dashboard in the center editor area.
 *
 * Opens in ViewColumn.Active (center tab), loads the same React bundle as the sidebar
 * but with data-mode="dashboard" so App.tsx renders the Dashboard component.
 */
export class TarxDashboardPanel {
	public static currentPanel: TarxDashboardPanel | undefined;
	private static readonly viewType = 'tarx.dashboardPanel';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _disposables: vscode.Disposable[] = [];

	/**
	 * Create or reveal the dashboard panel in the center editor area.
	 */
	public static createOrShow(extensionUri: vscode.Uri): TarxDashboardPanel {
		console.log('[TARX Dashboard] createOrShow called at', new Date().toISOString());

		try {
			if (TarxDashboardPanel.currentPanel) {
				TarxDashboardPanel.currentPanel._panel.reveal(vscode.ViewColumn.Active);
				console.log('[TARX Dashboard] Revealed existing panel');
				return TarxDashboardPanel.currentPanel;
			}

			console.log('[TARX Dashboard] Creating new panel...');
			const panel = vscode.window.createWebviewPanel(
				TarxDashboardPanel.viewType,
				'TARX Dashboard',
				vscode.ViewColumn.Active,
				{
					enableScripts: true,
					retainContextWhenHidden: true,
					localResourceRoots: [
						vscode.Uri.joinPath(extensionUri, 'out', 'webview'),
						vscode.Uri.joinPath(extensionUri, 'media')
					]
				}
			);

			TarxDashboardPanel.currentPanel = new TarxDashboardPanel(panel, extensionUri);
			console.log('[TARX Dashboard] Dashboard center opened - new panel created in ViewColumn.Active');
			return TarxDashboardPanel.currentPanel;
		} catch (err: unknown) {
			const errMsg = err instanceof Error ? err.stack || err.message : String(err);
			console.error('[TARX CRASH-GUARD] Dashboard createOrShow CRASHED:', errMsg);
			throw err; // re-throw so caller knows
		}
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;
		this._extensionUri = extensionUri;

		this._panel.webview.html = this._getHtml();

		this._panel.webview.onDidReceiveMessage(
			(msg) => this._handleMessage(msg),
			null,
			this._disposables
		);

		this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
	}

	private async _handleMessage(msg: Record<string, unknown>): Promise<void> {
		switch (msg.command) {
			case 'openChat':
				await vscode.commands.executeCommand('tarx.openChat');
				break;
			case 'openProjectTab':
				if (msg.projectId) {
					await vscode.commands.executeCommand('tarx.openProjectContext', msg.projectId);
				}
				break;
			case 'openCreateProjectTab':
				await vscode.commands.executeCommand('tarx.createProject');
				break;
			case 'openSettings':
				await vscode.commands.executeCommand('tarx.openSettings');
				break;
			case 'openView':
				if (msg.viewId && typeof msg.viewId === 'string') {
					await vscode.commands.executeCommand(msg.viewId);
				}
				break;
			case 'getServiceHealth':
				this._fetchServiceHealth();
				break;
			default:
				console.log('[TARX Dashboard] Unhandled message:', msg.command);
		}
	}

	private async _fetchServiceHealth(): Promise<void> {
		const health: Record<string, unknown> = {
			command: 'serviceHealth',
			inference: false,
			embeddings: false,
			mesh: false,
			meshPeers: 0,
			meshPeerId: null,
		};
		const fetchWithTimeout = (url: string, ms: number): Promise<Response> => {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), ms);
			return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeout));
		};
		try {
			const res = await fetchWithTimeout('http://localhost:11435/health', 2000);
			health.inference = res.ok;
		} catch { /* offline */ }
		try {
			const res = await fetchWithTimeout('http://localhost:11437/health', 2000);
			health.embeddings = res.ok;
		} catch { /* offline */ }
		try {
			const res = await fetchWithTimeout('http://localhost:11436/mesh/status', 2000);
			if (res.ok) {
				const data = await res.json() as { peer_count?: number; connected_peers?: number; local_peer_id?: string };
				health.mesh = true;
				health.meshPeers = data.connected_peers ?? data.peer_count ?? 0;
				health.meshPeerId = data.local_peer_id ?? null;
			}
		} catch { /* offline */ }
		this._panel.webview.postMessage(health);
	}

	private _dispose(): void {
		TarxDashboardPanel.currentPanel = undefined;
		this._panel.dispose();
		while (this._disposables.length) {
			const d = this._disposables.pop();
			if (d) { d.dispose(); }
		}
	}

	private _getHtml(): string {
		const webview = this._panel.webview;

		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'sidebar.js')
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'out', 'webview', 'sidebar.css')
		);
		const shadcnUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'media', 'shadcn.css')
		);
		const codiconsUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'media', 'codicon.css')
		);
		const codiconsFontUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'media', 'codicon.ttf')
		);
		const logoUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'media', 'tarx-logo.png')
		);
		const eyesUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'media', 'tarx-eyes.png')
		);

		const nonce = this._getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource} data:;">
	<style>
		@font-face {
			font-family: "codicon";
			font-display: block;
			src: url("${codiconsFontUri}") format("truetype");
		}
	</style>
	<link href="${codiconsUri}" rel="stylesheet">
	<link href="${shadcnUri}" rel="stylesheet">
	<link href="${styleUri}" rel="stylesheet">
	<title>TARX Dashboard</title>
</head>
<body>
	<div id="root" data-mode="dashboard" data-logo-uri="${logoUri}" data-eyes-uri="${eyesUri}"></div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}

	private _getNonce(): string {
		let text = '';
		const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}
}
