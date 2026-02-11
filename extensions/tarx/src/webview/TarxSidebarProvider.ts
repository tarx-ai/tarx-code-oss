/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

// ═══════════════════════════════════════════════════════════════════════════════
// QA LOGGING FLAG - Set to false for production
// ═══════════════════════════════════════════════════════════════════════════════
const QA_LOGGING = true;

/**
 * Project data from database
 */
export interface TarxProject {
	id: string;
	name: string;
	path: string;
	type: string | null;
	isActive: boolean;
	createdAt: number;
}

/**
 * History item from conversation database
 */
export interface TarxHistoryItem {
	id: string;
	title: string;
	timestamp: number;
	source: 'claude' | 'tarx';
	spaceId?: string;
	spaceName?: string;
}

/**
 * Uploaded file item
 */
export interface TarxUploadedFile {
	id: string;
	filename: string;
	size: number;
	uploadedAt: number;
}

/**
 * Connection status
 */
export type ConnectionStatus = 'online' | 'offline' | 'connecting' | 'reconnecting';

/**
 * Message types from webview to extension
 */
export type WebviewMessage =
	| { command: 'ready' }
	| { command: 'getProjects' }
	| { command: 'getHistory' }
	| { command: 'getUploadedFiles' }
	| { command: 'getConnectionStatus' }
	| { command: 'getDaemonStatus' }
	| { command: 'createProject'; name: string; mode: 'create' | 'import'; path?: string; instructions?: string }
	| { command: 'openCreateProjectTab' }
	| { command: 'openProjectTab'; projectId: string }
	| { command: 'openProject'; projectPath: string }
	| { command: 'selectProject'; projectId: string }
	| { command: 'openChat' }
	| { command: 'newChat' }
	| { command: 'openSession'; sessionId: string; spaceId?: string }
	| { command: 'openConversation'; conversationId: string }
	| { command: 'uploadFile'; filename: string; content: string; size: number; mimeType: string }
	| { command: 'deleteFile'; fileId: string }
	| { command: 'attachFileToChat'; fileId: string }
	| { command: 'openView'; viewId: string }
	| { command: 'openSettings' }
	| { command: 'openExtensions' }
	| { command: 'toggleSection'; sectionId: string; collapsed: boolean }
	| { command: 'showAllHistory' }
	// Settings messages
	| { command: 'getSettings' }
	| { command: 'saveClaudeApiKey'; key: string }
	| { command: 'deleteClaudeApiKey' }
	| { command: 'testClaudeConnection' }
	| { command: 'setMemoryEnabled'; enabled: boolean }
	| { command: 'setThreadConversations'; enabled: boolean }
	| { command: 'clearMemory' }
	| { command: 'openTarxSettings' }
	// Billing messages
	| { command: 'getBillingStatus' }
	| { command: 'startCheckout'; tier: string }
	| { command: 'openBillingPortal' }
	// QA/Error reporting messages
	| { command: 'webviewError'; error: string; stack?: string; componentStack?: string };

/**
 * TARX Sidebar Webview Provider
 *
 * Provides the webview-based sidebar for TARX, replacing the VS Code core sidebar.
 * Uses React for the UI and communicates with the extension via message passing.
 */
export class TarxSidebarProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'tarx.sidebarWebview';

	private _view?: vscode.WebviewView;
	private _connectionCheckInterval?: NodeJS.Timeout;

	constructor(private readonly _extensionUri: vscode.Uri) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void {
		console.log('[TARX Webview] resolveWebviewView called');

		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
		console.log('[TARX Webview] Webview HTML set');

		// Handle messages from webview with QA logging
		webviewView.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
			const startTime = Date.now();
			if (QA_LOGGING) {
				console.log(`[TARX QA] >> RECV: ${JSON.stringify(message).substring(0, 200)}`);
			}

			await this._handleMessage(message);

			if (QA_LOGGING) {
				console.log(`[TARX QA] << DONE: ${message.command} (${Date.now() - startTime}ms)`);
			}
		});

		// Start connection status polling
		this._startConnectionStatusPolling();

		// Cleanup on dispose
		webviewView.onDidDispose(() => {
			if (this._connectionCheckInterval) {
				clearInterval(this._connectionCheckInterval);
			}
		});
	}

	/**
	 * Post message to webview with QA logging
	 */
	private _postMessage(message: { command: string; [key: string]: unknown }): void {
		if (this._view) {
			if (QA_LOGGING) {
				console.log(`[TARX QA] << SEND: ${JSON.stringify(message).substring(0, 200)}`);
			}
			this._view.webview.postMessage(message);
		}
	}

	/**
	 * Refresh the webview
	 */
	public refresh(): void {
		this._postMessage({ command: 'refresh' });
	}

	/**
	 * Update projects list in webview
	 */
	public updateProjects(projects: TarxProject[]): void {
		console.log('[TARX SIDEBAR] updateProjects called with', projects.length, 'projects');
		console.log('[TARX SIDEBAR] First 3 projects:', JSON.stringify(projects.slice(0, 3)));
		this._postMessage({ command: 'projectsLoaded', projects });
	}

	/**
	 * Update history in webview
	 */
	public updateHistory(items: TarxHistoryItem[]): void {
		this._postMessage({ command: 'historyLoaded', items });
	}

	/**
	 * Update connection status in webview
	 */
	public updateConnectionStatus(status: ConnectionStatus): void {
		this._postMessage({ command: 'connectionStatusChanged', status });
	}

	/**
	 * Show upload progress in webview
	 */
	public showUploadProgress(text: string, percent: number): void {
		this._postMessage({ command: 'uploadProgress', text, percent });
	}

	/**
	 * Hide upload progress in webview
	 */
	public hideUploadProgress(): void {
		this._postMessage({ command: 'uploadProgressHide' });
	}

	/**
	 * Handle messages from the webview
	 */
	private async _handleMessage(message: WebviewMessage): Promise<void> {
		switch (message.command) {
			case 'ready':
				// Webview is ready, send initial data
				console.log('[TARX SIDEBAR] >>>>>> RECEIVED "ready" FROM WEBVIEW <<<<<<');
				await this._sendInitialData();
				console.log('[TARX SIDEBAR] _sendInitialData completed');
				break;

			case 'getProjects':
				await this._loadProjects();
				break;

			case 'getHistory':
				await this._loadHistory();
				break;

			case 'getUploadedFiles':
				await this._loadUploadedFiles();
				break;

			case 'getConnectionStatus':
				await this._checkConnectionStatus();
				break;

			case 'getDaemonStatus':
				await this._getDaemonStatusAndInjectToChat();
				break;

			case 'openCreateProjectTab':
				await vscode.commands.executeCommand('tarx.openCreateProject');
				break;

			case 'openProjectTab':
				await vscode.commands.executeCommand('tarx.openProjectContext', message.projectId);
				await vscode.commands.executeCommand('tarx.projects.select', message.projectId);
				this._postMessage({ command: 'projectSelected', data: { projectId: message.projectId } });
				break;

			case 'createProject':
				await vscode.commands.executeCommand('tarx.projects.create', message.name, message.mode, message.path, message.instructions);
				await this._loadProjects();
				break;

			case 'openProject':
				await vscode.commands.executeCommand('tarx.projects.open', message.projectPath);
				break;

			case 'selectProject':
				// Select project and load its sessions
				await vscode.commands.executeCommand('tarx.projects.select', message.projectId);
				// Notify webview that project was selected
				this._postMessage({ command: 'projectSelected', data: { projectId: message.projectId } });
				break;

			case 'openChat':
				await vscode.commands.executeCommand('workbench.action.chat.open');
				break;

			case 'newChat':
				await vscode.commands.executeCommand('tarx.chat.new');
				break;

			case 'openSession':
				await vscode.commands.executeCommand('tarx.openSession', message.sessionId, message.spaceId);
				break;

			case 'openConversation':
				await vscode.commands.executeCommand('tarx.openConversation', message.conversationId);
				break;

			case 'uploadFile':
				await vscode.commands.executeCommand('tarx.uploadFile', {
					filename: message.filename,
					content: message.content,
					size: message.size,
					mimeType: message.mimeType
				});
				await this._loadUploadedFiles();
				break;

			case 'deleteFile':
				await vscode.commands.executeCommand('tarx.deleteUploadedFile', message.fileId);
				await this._loadUploadedFiles();
				break;

			case 'attachFileToChat':
				await vscode.commands.executeCommand('tarx.attachUploadedFileToChat', message.fileId);
				break;

			case 'openView':
				await this._openViewInAuxiliaryBar(message.viewId);
				break;

			case 'openSettings':
				// Now handled in webview - sends navigate to settings view
				// This fallback still exists for legacy calls
				await vscode.commands.executeCommand('workbench.action.openSettings', 'tarx');
				break;

			case 'openExtensions':
				await vscode.commands.executeCommand('workbench.view.extensions');
				break;

			case 'showAllHistory':
				await vscode.commands.executeCommand('tarx.history.showAll');
				break;

			// ════════════════════════════════════════════════════════════════
			// SETTINGS MESSAGES
			// ════════════════════════════════════════════════════════════════

			case 'getSettings':
				await this._loadSettings();
				break;

			case 'saveClaudeApiKey':
				await this._saveClaudeApiKey(message.key);
				break;

			case 'deleteClaudeApiKey':
				await this._deleteClaudeApiKey();
				break;

			case 'testClaudeConnection':
				await this._testClaudeConnection();
				break;

			case 'setMemoryEnabled':
				await this._setMemorySetting('enabled', message.enabled);
				break;

			case 'setThreadConversations':
				await this._setMemorySetting('threadConversations', message.enabled);
				break;

			case 'clearMemory':
				await this._clearMemory();
				break;

			case 'openTarxSettings':
				// Open VS Code settings filtered to TARX
				await vscode.commands.executeCommand('workbench.action.openSettings', 'tarx');
				break;

			// ════════════════════════════════════════════════════════════════
			// BILLING
			// ════════════════════════════════════════════════════════════════

			case 'getBillingStatus':
				try {
					const billing = await vscode.commands.executeCommand('tarx.billing.getStatus');
					if (billing) {
						this._postMessage({ command: 'billingStatusLoaded', billing } as any);
					}
				} catch (e) {
					console.error('[TarxSidebarProvider] Failed to load billing:', e);
				}
				break;

			case 'startCheckout':
				try {
					await vscode.commands.executeCommand('tarx.billing.createCheckout', message.tier);
				} catch (e) {
					this._postMessage({ command: 'billingError', error: String(e) } as any);
				}
				break;

			case 'openBillingPortal':
				try {
					await vscode.commands.executeCommand('tarx.billing.openPortal');
				} catch (e) {
					this._postMessage({ command: 'billingError', error: String(e) } as any);
				}
				break;

			// ════════════════════════════════════════════════════════════════
			// QA/ERROR REPORTING
			// ════════════════════════════════════════════════════════════════

			case 'webviewError':
				// Log webview errors for QA tracking
				console.error('[TARX QA] WEBVIEW ERROR:', message.error);
				if (message.stack) {
					console.error('[TARX QA] Stack:', message.stack);
				}
				if (message.componentStack) {
					console.error('[TARX QA] Component Stack:', message.componentStack);
				}
				// Optionally show notification in development
				if (QA_LOGGING) {
					vscode.window.showErrorMessage(`TARX Webview Error: ${message.error}`);
				}
				break;
		}
	}

	/**
	 * Fetch daemon status and inject as conversational message into chat
	 */
	private async _getDaemonStatusAndInjectToChat(): Promise<void> {
		try {
			// Fetch status from daemon admin API
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 3000);

			const response = await fetch('http://localhost:11439/status', {
				signal: controller.signal
			});
			clearTimeout(timeout);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const status = await response.json() as {
				mode?: string;
				startedAt?: number;
				errorsAnalyzed?: number;
				errorsHealed?: number;
				meshNodesReached?: number;
				reputation?: number;
				killSwitchActive?: boolean;
			};

			// Format as conversational message
			const message = this._formatDaemonStatusMessage(status);

			// Inject into chat via command
			await vscode.commands.executeCommand('tarx.injectDaemonStatus', message);

		} catch (error) {
			// Daemon offline or error
			const offlineMessage = 'TARX Daemon offline. Check if the daemon is running.';
			await vscode.commands.executeCommand('tarx.injectDaemonStatus', offlineMessage);
		}
	}

	/**
	 * Format daemon status as a conversational message
	 */
	private _formatDaemonStatusMessage(status: {
		mode?: string;
		startedAt?: number;
		errorsAnalyzed?: number;
		errorsHealed?: number;
		meshNodesReached?: number;
		reputation?: number;
		killSwitchActive?: boolean;
	}): string {
		const mode = status.mode || 'UNKNOWN';

		// Calculate uptime
		let uptime = 'unknown';
		if (status.startedAt) {
			const uptimeMs = Date.now() - status.startedAt;
			const uptimeMin = Math.floor(uptimeMs / 60000);
			if (uptimeMin < 60) {
				uptime = `${uptimeMin}m`;
			} else {
				const hours = Math.floor(uptimeMin / 60);
				const mins = uptimeMin % 60;
				uptime = `${hours}h ${mins}m`;
			}
		}

		// Format reputation
		const reputation = status.reputation !== undefined
			? status.reputation.toFixed(2)
			: 'N/A';

		// Build message
		const parts = [
			`TARX Daemon: ${mode} mode`,
			`Uptime: ${uptime}`,
			`Healed: ${status.errorsHealed || 0}/${status.errorsAnalyzed || 0} errors`,
			`Mesh: ${status.meshNodesReached || 0} nodes`,
			`Rep: ${reputation}`
		];

		if (status.killSwitchActive) {
			parts.push('(observe only)');
		}

		return parts.join(' | ');
	}

	/**
	 * Send initial data when webview is ready
	 */
	private async _sendInitialData(): Promise<void> {
		console.log('[TARX SIDEBAR] _sendInitialData starting...');
		await Promise.all([
			this._loadProjects(),
			this._loadHistory(),
			this._loadUploadedFiles(),
			this._checkConnectionStatus()
		]);
		console.log('[TARX SIDEBAR] _sendInitialData all promises resolved');
	}

	/**
	 * Load projects from database with retry logic for race condition
	 */
	private async _loadProjects(retryCount = 0, maxRetries = 5): Promise<void> {
		console.log('[TARX DIAG] _loadProjects called (attempt', retryCount + 1, 'of', maxRetries + 1, ')');
		try {
			// Check if command exists first
			const commands = await vscode.commands.getCommands(true);
			const hasCommand = commands.includes('tarx.projects.list');
			console.log('[TARX DIAG] tarx.projects.list registered:', hasCommand);

			if (!hasCommand) {
				if (retryCount < maxRetries) {
					// Exponential backoff: 200ms, 400ms, 800ms, 1600ms, 3200ms
					const delay = Math.min(200 * Math.pow(2, retryCount), 5000);
					console.log(`[TARX DIAG] Command not registered yet - retrying in ${delay}ms`);
					setTimeout(() => this._loadProjects(retryCount + 1, maxRetries), delay);
					return;
				}
				console.warn('[TARX DIAG] Command still not registered after max retries');
				this.updateProjects([]);
				return;
			}

			const projects = await vscode.commands.executeCommand<TarxProject[]>('tarx.projects.list');
			console.log('[TARX DIAG] _loadProjects received:', projects?.length ?? 'null/undefined', 'projects');

			// If we got empty projects but command exists, the database might not be ready yet
			if ((!projects || projects.length === 0) && retryCount < maxRetries) {
				const delay = Math.min(300 * Math.pow(2, retryCount), 5000);
				console.log(`[TARX DIAG] Got empty projects - retrying in ${delay}ms`);
				setTimeout(() => this._loadProjects(retryCount + 1, maxRetries), delay);
				return;
			}

			this.updateProjects(projects || []);
		} catch (e) {
			console.error('[TarxSidebarProvider] Failed to load projects:', e);
			console.error('[TARX DIAG] _loadProjects error:', e instanceof Error ? e.message : e);

			// Retry on error too
			if (retryCount < maxRetries) {
				const delay = Math.min(500 * Math.pow(2, retryCount), 5000);
				console.log(`[TARX DIAG] Error loading projects - retrying in ${delay}ms`);
				setTimeout(() => this._loadProjects(retryCount + 1, maxRetries), delay);
				return;
			}

			this.updateProjects([]);
		}
	}

	/**
	 * Load history from both tables
	 */
	private async _loadHistory(): Promise<void> {
		try {
			const allItems: TarxHistoryItem[] = [];

			// Load in parallel
			const [convResult, sessResult] = await Promise.all([
				Promise.resolve(vscode.commands.executeCommand<{
					conversations: Array<{
						id: string;
						title: string;
						timestamp: number;
						source?: 'claude' | 'tarx';
					}>;
				}>('tarx.getConversationHistory', 50)).catch(() => undefined),

				Promise.resolve(vscode.commands.executeCommand<{
					sessions: Array<{
						id: string;
						title: string;
						updatedAt: number;
						spaceId: string;
						spaceName: string;
						model?: string;
					}>;
				}>('tarx.getSessionHistory', 50)).catch(() => undefined)
			]);

			// Process conversations
			if (convResult?.conversations) {
				for (const c of convResult.conversations) {
					allItems.push({
						id: c.id,
						title: c.title || 'Untitled',
						timestamp: c.timestamp,
						source: c.source || (c.title?.startsWith('Claude') ? 'claude' : 'tarx')
					});
				}
			}

			// Process sessions
			if (sessResult?.sessions) {
				for (const s of sessResult.sessions) {
					allItems.push({
						id: s.id,
						title: s.title || 'Untitled',
						timestamp: s.updatedAt,
						source: s.model === 'claude' ? 'claude' : 'tarx',
						spaceId: s.spaceId,
						spaceName: s.spaceName
					});
				}
			}

			// Deduplicate and sort
			const uniqueMap = new Map<string, TarxHistoryItem>();
			for (const item of allItems) {
				const existing = uniqueMap.get(item.id);
				if (!existing || item.timestamp > existing.timestamp) {
					uniqueMap.set(item.id, item);
				}
			}

			const uniqueItems = Array.from(uniqueMap.values());
			uniqueItems.sort((a, b) => b.timestamp - a.timestamp);

			this.updateHistory(uniqueItems);
		} catch (e) {
			console.error('[TarxSidebarProvider] Failed to load history:', e);
			this.updateHistory([]);
		}
	}

	/**
	 * Load uploaded files
	 */
	private async _loadUploadedFiles(): Promise<void> {
		try {
			const files = await vscode.commands.executeCommand<TarxUploadedFile[]>('tarx.getUploadedFiles');
			this._postMessage({ command: 'uploadedFilesLoaded', files: files || [] });
		} catch (e) {
			console.error('[TarxSidebarProvider] Failed to load uploaded files:', e);
			this._postMessage({ command: 'uploadedFilesLoaded', files: [] });
		}
	}

	/**
	 * Check connection status
	 */
	private async _checkConnectionStatus(): Promise<void> {
		try {
			const status = await vscode.commands.executeCommand<{
				status: ConnectionStatus;
				isOnline: boolean;
			}>('tarx.getConnectionStatus');

			if (status) {
				this.updateConnectionStatus(status.status);
			}
		} catch {
			// Extension not ready yet
		}
	}

	/**
	 * Start polling connection status
	 */
	private _startConnectionStatusPolling(): void {
		this._connectionCheckInterval = setInterval(() => {
			this._checkConnectionStatus();
		}, 5000);
	}

	/**
	 * Open a view in the Auxiliary Bar (right side)
	 */
	private async _openViewInAuxiliaryBar(viewId: string): Promise<void> {
		try {
			// First ensure auxiliary bar is visible
			await vscode.commands.executeCommand('workbench.action.toggleAuxiliaryBar', true);

			// Then open the view
			await vscode.commands.executeCommand(viewId);
		} catch (e) {
			console.error(`[TarxSidebarProvider] Failed to open view: ${viewId}`, e);
		}
	}

	/**
	 * Generate HTML for the webview
	 */
	private _getHtmlForWebview(webview: vscode.Webview): string {
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

		// Logo URI
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
		/* Inline @font-face for codicon - ensures font loads reliably */
		@font-face {
			font-family: "codicon";
			font-display: block;
			src: url("${codiconsFontUri}") format("truetype");
		}
	</style>
	<link href="${codiconsUri}" rel="stylesheet">
	<link href="${shadcnUri}" rel="stylesheet">
	<link href="${styleUri}" rel="stylesheet">
	<title>TARX</title>
</head>
<body>
	<div id="root" data-logo-uri="${logoUri}" data-eyes-uri="${eyesUri}"></div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}

	/**
	 * Generate a nonce for CSP
	 */
	private _getNonce(): string {
		let text = '';
		const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}

	// ════════════════════════════════════════════════════════════════════════════
	// SETTINGS METHODS
	// ════════════════════════════════════════════════════════════════════════════

	/**
	 * Load all settings and send to webview
	 */
	private async _loadSettings(): Promise<void> {
		try {
			const settings = await vscode.commands.executeCommand('tarx.settings.get');
			if (settings) {
				this._postMessage({ command: 'settingsLoaded', settings });
			}
		} catch (e) {
			console.error('[TarxSidebarProvider] Failed to load settings:', e);
		}
	}

	/**
	 * Save Claude API key securely
	 */
	private async _saveClaudeApiKey(key: string): Promise<void> {
		try {
			await vscode.commands.executeCommand('tarx.settings.saveApiKey', key);
			this._postMessage({
				command: 'apiKeySaved',
				success: true
			});
			// Refresh settings to update UI
			await this._loadSettings();
		} catch (e) {
			console.error('[TarxSidebarProvider] Failed to save API key:', e);
			this._postMessage({
				command: 'apiKeySaved',
				success: false,
				error: String(e)
			});
		}
	}

	/**
	 * Delete Claude API key
	 */
	private async _deleteClaudeApiKey(): Promise<void> {
		try {
			await vscode.commands.executeCommand('tarx.settings.deleteApiKey');
			this._postMessage({ command: 'apiKeyDeleted' });
			// Refresh settings to update UI
			await this._loadSettings();
		} catch (e) {
			console.error('[TarxSidebarProvider] Failed to delete API key:', e);
		}
	}

	/**
	 * Test Claude API connection
	 */
	private async _testClaudeConnection(): Promise<void> {
		try {
			const result = await vscode.commands.executeCommand<{
				success: boolean;
				error?: string;
				model?: string;
			}>('tarx.settings.testConnection');
			if (result) {
				this._postMessage({
					command: 'connectionTestResult',
					result
				});
			}
		} catch (e) {
			console.error('[TarxSidebarProvider] Failed to test connection:', e);
			this._postMessage({
				command: 'connectionTestResult',
				result: { success: false, error: String(e) }
			});
		}
	}

	/**
	 * Set memory setting
	 */
	private async _setMemorySetting(setting: 'enabled' | 'threadConversations', value: boolean): Promise<void> {
		try {
			await vscode.commands.executeCommand('tarx.settings.setMemory', { [setting]: value });
			// Refresh settings to update UI
			await this._loadSettings();
		} catch (e) {
			console.error(`[TarxSidebarProvider] Failed to set memory ${setting}:`, e);
		}
	}

	/**
	 * Clear all memory
	 */
	private async _clearMemory(): Promise<void> {
		try {
			const success = await vscode.commands.executeCommand<boolean>('tarx.settings.clearMemory');
			this._postMessage({
				command: 'memoryClearResult',
				success: success ?? false
			});
		} catch (e) {
			console.error('[TarxSidebarProvider] Failed to clear memory:', e);
			this._postMessage({
				command: 'memoryClearResult',
				success: false
			});
		}
	}
}
