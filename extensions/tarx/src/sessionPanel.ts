/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { execSync } from 'child_process';

interface SessionMessage {
	id: string;
	role: string;
	content: string;
	created_at: number;
}

interface SessionInfo {
	id: string;
	title: string;
	space_id: string;
	space_name: string | null;
	space_emoji: string | null;
}

/**
 * TARX Session Panel - Webview with live polling for real-time message updates
 */
export class TarxSessionPanel {
	public static currentPanel: TarxSessionPanel | undefined;
	private static readonly viewType = 'tarxSession';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _disposables: vscode.Disposable[] = [];
	private _sessionId: string;
	private _session: SessionInfo | null = null;
	private _pollInterval: NodeJS.Timeout | null = null;
	private _lastMessageCount: number = 0;
	private _sessionDrafts: Map<string, string> = new Map();

	public static createOrShow(extensionUri: vscode.Uri, sessionId: string, spaceId?: string): void {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		// If we already have a panel, show it with the new session
		if (TarxSessionPanel.currentPanel) {
			TarxSessionPanel.currentPanel._panel.reveal(column);
			TarxSessionPanel.currentPanel.loadSession(sessionId);
			return;
		}

		// Create a new panel
		const panel = vscode.window.createWebviewPanel(
			TarxSessionPanel.viewType,
			'TARX Session',
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [extensionUri]
			}
		);

		TarxSessionPanel.currentPanel = new TarxSessionPanel(panel, extensionUri, sessionId);
	}

	/**
	 * Create or show panel with pre-fetched messages (for TARX native conversations)
	 * This bypasses the database query and directly renders provided messages
	 */
	public static createOrShowWithMessages(
		extensionUri: vscode.Uri,
		conversationId: string,
		title: string,
		messages: Array<{ id: string; role: string; content: string; created_at: number }>
	): void {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		// If we already have a panel, show it with the new conversation
		if (TarxSessionPanel.currentPanel) {
			TarxSessionPanel.currentPanel._panel.reveal(column);
			TarxSessionPanel.currentPanel.loadConversationWithMessages(conversationId, title, messages);
			return;
		}

		// Create a new panel
		const panel = vscode.window.createWebviewPanel(
			TarxSessionPanel.viewType,
			'TARX Conversation',
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [extensionUri]
			}
		);

		TarxSessionPanel.currentPanel = new TarxSessionPanel(panel, extensionUri, conversationId);
		TarxSessionPanel.currentPanel.loadConversationWithMessages(conversationId, title, messages);
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, sessionId: string) {
		this._panel = panel;
		this._extensionUri = extensionUri;
		this._sessionId = sessionId;

		// Set initial content
		this._panel.webview.html = this._getLoadingHtml(panel.webview);

		// Handle messages from webview
		this._panel.webview.onDidReceiveMessage(
			message => this._handleMessage(message),
			null,
			this._disposables
		);

		// Handle panel disposal
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Load session and start polling
		this.loadSession(sessionId);
	}

	private async loadSession(sessionId: string): Promise<void> {
		this._sessionId = sessionId;
		this.stopPolling();

		try {
			const mcpDbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');

			if (!fs.existsSync(mcpDbPath)) {
				this._panel.webview.html = this._getErrorHtml(this._panel.webview, 'Database not found');
				return;
			}

			// Use sqlite3 CLI to avoid better-sqlite3 version mismatch
			// Get session info
			const sessionQuery = `
				SELECT s.id, s.title, s.space_id,
				       sp.name as space_name, sp.emoji as space_emoji
				FROM sessions s
				LEFT JOIN spaces sp ON s.space_id = sp.id
				WHERE s.id = '${sessionId.replace(/'/g, "''")}'
				LIMIT 1;
			`;
			const sessionResult = execSync(`sqlite3 "${mcpDbPath}" -json`, {
				encoding: 'utf8',
				input: sessionQuery
			});
			const sessions = JSON.parse(sessionResult || '[]') as SessionInfo[];

			if (sessions.length === 0) {
				this._panel.webview.html = this._getErrorHtml(this._panel.webview, 'Session not found');
				return;
			}

			const session = sessions[0];
			this._session = session;
			this._panel.title = `TARX: ${session.title || 'Session'}`;

			// Load messages
			const messagesQuery = `
				SELECT id, role, content, created_at
				FROM messages
				WHERE session_id = '${sessionId.replace(/'/g, "''")}'
				ORDER BY created_at ASC;
			`;
			const messagesResult = execSync(`sqlite3 "${mcpDbPath}" -json`, {
				encoding: 'utf8',
				input: messagesQuery
			});
			const messages = JSON.parse(messagesResult || '[]') as SessionMessage[];

			this._lastMessageCount = messages.length;
			this._panel.webview.html = this._getSessionHtml(this._panel.webview, session, messages);

			// Start polling for updates
			this.startPolling();

			console.log(`[TARX SessionPanel] Loaded session ${sessionId} with ${messages.length} messages`);
		} catch (error) {
			console.error('[TARX SessionPanel] Error loading session:', error);
			this._panel.webview.html = this._getErrorHtml(this._panel.webview, 'Failed to load session');
		}
	}

	/**
	 * Load conversation with pre-fetched messages (for TARX native conversations)
	 * Renders provided messages and starts polling for new messages
	 */
	private loadConversationWithMessages(
		conversationId: string,
		title: string,
		messages: Array<{ id: string; role: string; content: string; created_at: number }>
	): void {
		this._sessionId = conversationId;

		// Create pseudo-session info
		this._session = {
			id: conversationId,
			title: title,
			space_id: '',
			space_name: 'TARX Conversation',
			space_emoji: null // Not rendered in UI
		};

		this._panel.title = `TARX: ${title || 'Conversation'}`;
		this._lastMessageCount = messages.length;

		// Render the messages directly
		this._panel.webview.html = this._getSessionHtml(this._panel.webview, this._session, messages as SessionMessage[]);

		// Start polling for new messages (after sends)
		this.startPolling();

		console.log(`[TARX SessionPanel] Loaded conversation ${conversationId} with ${messages.length} messages`);
	}

	private startPolling(): void {
		this.stopPolling();

		// Poll every 3 seconds
		this._pollInterval = setInterval(async () => {
			await this._checkForNewMessages();
		}, 3000);

		console.log('[TARX SessionPanel] Started polling');
	}

	private stopPolling(): void {
		if (this._pollInterval) {
			clearInterval(this._pollInterval);
			this._pollInterval = null;
			console.log('[TARX SessionPanel] Stopped polling');
		}
	}

	private async _checkForNewMessages(): Promise<void> {
		try {
			const mcpDbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
			if (!fs.existsSync(mcpDbPath)) return;

			// Use sqlite3 CLI to avoid better-sqlite3 version mismatch
			const messagesQuery = `
				SELECT id, role, content, created_at
				FROM messages
				WHERE session_id = '${this._sessionId.replace(/'/g, "''")}'
				ORDER BY created_at ASC;
			`;
			const messagesResult = execSync(`sqlite3 "${mcpDbPath}" -json`, {
				encoding: 'utf8',
				input: messagesQuery
			});
			const messages = JSON.parse(messagesResult || '[]') as SessionMessage[];

			// Only update if message count changed
			if (messages.length !== this._lastMessageCount) {
				console.log(`[TARX SessionPanel] Messages changed: ${this._lastMessageCount} -> ${messages.length}`);
				this._lastMessageCount = messages.length;

				// Send update to webview
				this._panel.webview.postMessage({
					type: 'updateMessages',
					messages: messages
				});
			}
		} catch (error) {
			console.error('[TARX SessionPanel] Polling error:', error);
		}
	}

	private _handleMessage(message: any): void {
		switch (message.type) {
			case 'refresh':
				this.loadSession(this._sessionId);
				break;
			case 'sendMessage':
				// TODO: Integrate with chat to send messages
				vscode.window.showInformationMessage('Send message feature coming soon');
				break;
			case 'sendMessageWithFiles':
				this._sendMessageWithFiles(message.message, message.files);
				// Clear draft on send
				this._sessionDrafts.delete(this._sessionId);
				break;
			case 'draftChanged':
				// Persist draft input per session
				if (message.value) {
					this._sessionDrafts.set(this._sessionId, message.value);
				} else {
					this._sessionDrafts.delete(this._sessionId);
				}
				break;
		}
	}

	/**
	 * Post a streaming token to the webview for real-time display.
	 * Called by the tarx.chat.sendMessage command handler during streaming inference.
	 */
	public postStreamToken(token: string): void {
		this._panel.webview.postMessage({ type: 'streamToken', token });
	}

	/**
	 * Signal that streaming is complete.
	 * Called by the tarx.chat.sendMessage command handler when inference finishes.
	 */
	public postStreamEnd(fullResponse: string): void {
		this._panel.webview.postMessage({
			type: 'streamEnd',
			message: {
				id: `msg-${Date.now()}`,
				role: 'assistant',
				content: fullResponse,
				created_at: Math.floor(Date.now() / 1000)
			}
		});
		this._lastMessageCount += 2; // User + assistant messages
	}

	/**
	 * Send a message with attached files to the LLM.
	 * PERF: Uses streaming command — tokens appear in real-time via postStreamToken.
	 */
	private async _sendMessageWithFiles(
		text: string,
		files: Array<{ filename: string; content: string; size: number }>
	): Promise<void> {
		try {
			// Build enriched prompt with file contents
			let enrichedPrompt = text;
			const fileRefs: string[] = [];

			if (files.length > 0) {
				const filesSection = files.map(f => {
					fileRefs.push(f.filename);
					const ext = f.filename.split('.').pop() || '';
					const lang = this._getLanguageFromExt(ext);
					return `### ${f.filename} (${this._formatFileSize(f.size)})\n\`\`\`${lang}\n${f.content}\n\`\`\``;
				}).join('\n\n');

				enrichedPrompt = `## Attached Files\n\n${filesSection}\n\n---\n\n${text}`;
			}

			// Optimistic UI update - add user message to panel first
			const userMsgId = `msg-${Date.now()}`;
			this._panel.webview.postMessage({
				type: 'messageSent',
				message: {
					id: userMsgId,
					role: 'user',
					content: text + (files.length > 0 ? `\n\n[${files.length} file(s) attached]` : ''),
					created_at: Math.floor(Date.now() / 1000)
				}
			});

			// Show "Thinking..." while pre-processing (RAG, history loading)
			this._panel.webview.postMessage({ type: 'showLoading' });

			// Send via TARX chat command — streaming tokens will arrive via postStreamToken
			const result = await vscode.commands.executeCommand<{ success: boolean; response?: string; error?: string }>(
				'tarx.chat.sendMessage',
				{
					sessionId: this._sessionId,
					message: enrichedPrompt,
					fileRefs: fileRefs
				}
			);

			// Hide loading indicator (streamEnd may have already removed it)
			this._panel.webview.postMessage({ type: 'hideLoading' });

			if (result?.error) {
				vscode.window.showErrorMessage(`Failed to send message: ${result.error}`);
			}

		} catch (error) {
			console.error('[TARX SessionPanel] Error sending message:', error);
			this._panel.webview.postMessage({ type: 'hideLoading' });
			vscode.window.showErrorMessage('Failed to send message');
		}
	}

	private _getLanguageFromExt(ext: string): string {
		const langMap: Record<string, string> = {
			'ts': 'typescript', 'tsx': 'typescript',
			'js': 'javascript', 'jsx': 'javascript',
			'py': 'python', 'rs': 'rust', 'go': 'go',
			'java': 'java', 'json': 'json', 'yaml': 'yaml',
			'yml': 'yaml', 'xml': 'xml', 'html': 'html',
			'css': 'css', 'md': 'markdown', 'txt': 'text'
		};
		return langMap[ext] || ext;
	}

	private _formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	private _getCodiconUri(webview: vscode.Webview): vscode.Uri {
		return webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'media', 'codicon.css')
		);
	}

	private _getLoadingHtml(webview: vscode.Webview): string {
		const codiconsUri = this._getCodiconUri(webview);
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link rel="stylesheet" type="text/css" href="${codiconsUri}">
	<title>Loading...</title>
	<style>
		body {
			font-family: var(--vscode-font-family);
			background: var(--vscode-editor-background);
			color: var(--vscode-foreground);
			display: flex;
			justify-content: center;
			align-items: center;
			height: 100vh;
			margin: 0;
		}
		.loading {
			text-align: center;
		}
		.spinner {
			width: 40px;
			height: 40px;
			border: 3px solid var(--vscode-input-border);
			border-top-color: var(--vscode-textLink-foreground);
			border-radius: 50%;
			animation: spin 1s linear infinite;
			margin: 0 auto 16px;
		}
		@keyframes spin {
			to { transform: rotate(360deg); }
		}
	</style>
</head>
<body>
	<div class="loading">
		<div class="spinner"></div>
		<div>Loading session...</div>
	</div>
</body>
</html>`;
	}

	private _getErrorHtml(webview: vscode.Webview, error: string): string {
		const codiconsUri = this._getCodiconUri(webview);
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link rel="stylesheet" type="text/css" href="${codiconsUri}">
	<title>Error</title>
	<style>
		body {
			font-family: var(--vscode-font-family);
			background: var(--vscode-editor-background);
			color: var(--vscode-foreground);
			display: flex;
			justify-content: center;
			align-items: center;
			height: 100vh;
			margin: 0;
		}
		.error {
			text-align: center;
			color: var(--vscode-errorForeground);
		}
	</style>
</head>
<body>
	<div class="error">
		<h2>Error</h2>
		<p>${this._escapeHtml(error)}</p>
	</div>
</body>
</html>`;
	}

	private _getSessionHtml(webview: vscode.Webview, session: SessionInfo, messages: SessionMessage[]): string {
		const codiconsUri = this._getCodiconUri(webview);
		const messagesHtml = messages.length > 0
			? messages.map(msg => `
				<div class="message ${this._escapeHtml(msg.role)}" data-id="${this._escapeHtml(msg.id)}">
					<div class="role">${msg.role === 'user' ? 'You' : 'TARX'}</div>
					<div class="content">${this._escapeHtml(msg.content)}</div>
					<div class="timestamp">${this._formatTimestamp(msg.created_at)}</div>
				</div>
			`).join('')
			: '<div class="empty-state">No messages yet. Start a conversation!</div>';

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link rel="stylesheet" type="text/css" href="${codiconsUri}">
	<title>TARX Session</title>
	<style>
		* {
			box-sizing: border-box;
			margin: 0;
			padding: 0;
		}

		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background: var(--vscode-editor-background);
			line-height: 1.6;
			height: 100vh;
			display: flex;
			flex-direction: column;
		}

		.header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 16px 20px;
			border-bottom: 1px solid var(--vscode-panel-border);
			background: var(--vscode-sideBar-background);
		}

		.header-content h1 {
			font-size: 16px;
			font-weight: 600;
			margin-bottom: 4px;
		}

		.header-meta {
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
		}

		.status-badge {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			padding: 4px 10px;
			background: var(--vscode-badge-background);
			color: var(--vscode-badge-foreground);
			border-radius: 12px;
			font-size: 11px;
		}

		.status-dot {
			width: 8px;
			height: 8px;
			background: #4caf50;
			border-radius: 50%;
			animation: pulse 2s infinite;
		}

		@keyframes pulse {
			0%, 100% { opacity: 1; }
			50% { opacity: 0.5; }
		}

		.messages-container {
			flex: 1;
			overflow-y: auto;
			padding: 20px;
		}

		.messages {
			display: flex;
			flex-direction: column;
			gap: 16px;
			max-width: 800px;
			margin: 0 auto;
		}

		.message {
			padding: 12px 16px;
			border-radius: 8px;
			background: var(--vscode-input-background);
		}

		.message.user {
			background: var(--vscode-input-background);
			border-left: 3px solid var(--vscode-textLink-foreground);
		}

		.message.assistant {
			background: var(--vscode-editor-selectionBackground);
			border-left: 3px solid #4caf50;
		}

		.role {
			font-weight: 600;
			font-size: 11px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			margin-bottom: 8px;
			color: var(--vscode-descriptionForeground);
		}

		.message.user .role {
			color: var(--vscode-textLink-foreground);
		}

		.message.assistant .role {
			color: #4caf50;
		}

		.message.loading {
			opacity: 0.7;
		}

		.typing-dots span {
			animation: blink 1.4s infinite both;
		}
		.typing-dots span:nth-child(2) {
			animation-delay: 0.2s;
		}
		.typing-dots span:nth-child(3) {
			animation-delay: 0.4s;
		}
		@keyframes blink {
			0%, 80%, 100% { opacity: 0; }
			40% { opacity: 1; }
		}

		.content {
			white-space: pre-wrap;
			word-wrap: break-word;
		}

		.timestamp {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			margin-top: 8px;
			text-align: right;
		}

		.empty-state {
			text-align: center;
			padding: 60px 20px;
			color: var(--vscode-descriptionForeground);
		}

		.new-message-indicator {
			position: fixed;
			bottom: 140px;
			left: 50%;
			transform: translateX(-50%);
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			padding: 8px 16px;
			border-radius: 20px;
			font-size: 13px;
			cursor: pointer;
			display: none;
			animation: slideUp 0.3s ease;
			z-index: 100;
		}

		@keyframes slideUp {
			from { opacity: 0; transform: translateX(-50%) translateY(20px); }
			to { opacity: 1; transform: translateX(-50%) translateY(0); }
		}

		/* ===== Chat Input Area ===== */
		.chat-input-wrapper {
			border-top: 1px solid var(--vscode-panel-border);
			background: var(--vscode-sideBar-background);
		}

		.file-pills {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			padding: 8px 20px;
			min-height: 0;
		}

		.file-pills:empty {
			display: none;
		}

		.file-pill {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			padding: 6px 12px;
			background: var(--vscode-badge-background);
			color: var(--vscode-badge-foreground);
			border-radius: 16px;
			font-size: 12px;
			max-width: 200px;
		}

		.file-pill-icon {
			flex-shrink: 0;
		}

		.file-pill-name {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.file-pill-size {
			color: var(--vscode-descriptionForeground);
			font-size: 11px;
			flex-shrink: 0;
		}

		.file-pill-remove {
			cursor: pointer;
			opacity: 0.7;
			flex-shrink: 0;
			padding: 2px;
			border-radius: 50%;
		}

		.file-pill-remove:hover {
			opacity: 1;
			background: rgba(255,255,255,0.1);
		}

		.chat-input-container {
			display: flex;
			align-items: flex-end;
			gap: 8px;
			padding: 12px 20px;
		}

		.attach-btn {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 36px;
			height: 36px;
			border: none;
			border-radius: 8px;
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			cursor: pointer;
			font-size: 16px;
			flex-shrink: 0;
			transition: background 0.15s ease;
		}

		.attach-btn:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}

		.chat-textarea {
			flex: 1;
			min-height: 36px;
			max-height: 150px;
			padding: 8px 12px;
			border: 1px solid var(--vscode-input-border);
			border-radius: 8px;
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			resize: none;
			outline: none;
			line-height: 1.4;
		}

		.chat-textarea:focus {
			border-color: var(--vscode-focusBorder);
		}

		.chat-textarea::placeholder {
			color: var(--vscode-input-placeholderForeground);
		}

		.send-btn {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 36px;
			height: 36px;
			border: none;
			border-radius: 8px;
			background: linear-gradient(135deg, #2A8BC2 0%, #40B6FB 50%, #6DD0FF 100%);
			color: white;
			cursor: pointer;
			font-size: 16px;
			flex-shrink: 0;
			transition: opacity 0.15s ease, transform 0.15s ease;
		}

		.send-btn:hover {
			opacity: 0.9;
			transform: scale(1.02);
		}

		.send-btn:disabled {
			opacity: 0.5;
			cursor: not-allowed;
			transform: none;
		}

		/* ===== Drop Overlay ===== */
		.drop-overlay {
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			background: rgba(42, 139, 194, 0.15);
			border: 3px dashed var(--vscode-focusBorder, #2A8BC2);
			display: none;
			align-items: center;
			justify-content: center;
			z-index: 1000;
			pointer-events: none;
		}

		.drop-overlay.active {
			display: flex;
		}

		.drop-content {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 12px;
			padding: 40px;
			background: var(--vscode-editor-background);
			border-radius: 16px;
			box-shadow: 0 8px 32px rgba(0,0,0,0.3);
		}

		.drop-icon {
			font-size: 48px;
		}

		.drop-text {
			font-size: 16px;
			font-weight: 500;
		}

		.drop-hint {
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
		}

		/* ===== Error Toast ===== */
		.error-toast {
			position: fixed;
			bottom: 160px;
			left: 50%;
			transform: translateX(-50%);
			background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
			border: 1px solid var(--vscode-inputValidation-errorBorder, #be1100);
			color: var(--vscode-inputValidation-errorForeground, #fff);
			padding: 10px 16px;
			border-radius: 8px;
			font-size: 13px;
			z-index: 1001;
			display: none;
			animation: fadeInOut 3s ease forwards;
		}

		@keyframes fadeInOut {
			0% { opacity: 0; transform: translateX(-50%) translateY(10px); }
			10% { opacity: 1; transform: translateX(-50%) translateY(0); }
			90% { opacity: 1; transform: translateX(-50%) translateY(0); }
			100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
		}
	</style>
</head>
<body>
	<div class="header">
		<div class="header-content">
			<h1>${this._escapeHtml(session.title || 'Session')}</h1>
			<div class="header-meta">
				<i class="codicon codicon-folder"></i> ${this._escapeHtml(session.space_name || 'Unknown Space')} • <span id="messageCount">${messages.length}</span> messages
			</div>
		</div>
		<div class="status-badge">
			<div class="status-dot"></div>
			Live
		</div>
	</div>

	<div class="messages-container" id="messagesContainer">
		<div class="messages" id="messages">
			${messagesHtml}
		</div>
	</div>

	<div class="new-message-indicator" id="newMessageIndicator" onclick="scrollToBottom()">
		New messages ↓
	</div>

	<!-- Chat Input Area -->
	<div class="chat-input-wrapper">
		<div class="file-pills" id="filePills"></div>
		<div class="chat-input-container">
			<button class="attach-btn" id="attachBtn" title="Attach files"><i class="codicon codicon-attach"></i></button>
			<textarea
				class="chat-textarea"
				id="chatInput"
				placeholder="Type a message... (drag files here to attach)"
				rows="1"
			>${this._escapeHtml(this._sessionDrafts.get(this._sessionId) || '')}</textarea>
			<button class="send-btn" id="sendBtn" title="Send message"><i class="codicon codicon-send"></i></button>
			<input type="file" id="fileInput" multiple hidden
				accept=".txt,.md,.py,.js,.ts,.tsx,.jsx,.json,.yaml,.yml,.xml,.html,.css,.rs,.go,.java,.c,.cpp,.h,.hpp,.sh,.sql" />
		</div>
	</div>

	<!-- Drop Overlay -->
	<div class="drop-overlay" id="dropOverlay">
		<div class="drop-content">
			<i class="codicon codicon-cloud-upload drop-icon"></i>
			<div class="drop-text">Drop files here</div>
			<div class="drop-hint">Supported: .txt, .md, .py, .js, .ts, .json, .yaml, .html, .css, etc.</div>
		</div>
	</div>

	<!-- Error Toast -->
	<div class="error-toast" id="errorToast"></div>

	<script>
		const vscode = acquireVsCodeApi();
		let isAtBottom = true;

		// DOM Elements
		const messagesContainer = document.getElementById('messagesContainer');
		const messagesEl = document.getElementById('messages');
		const messageCountEl = document.getElementById('messageCount');
		const newMessageIndicator = document.getElementById('newMessageIndicator');
		const filePills = document.getElementById('filePills');
		const chatInput = document.getElementById('chatInput');
		const attachBtn = document.getElementById('attachBtn');
		const sendBtn = document.getElementById('sendBtn');
		const fileInput = document.getElementById('fileInput');
		const dropOverlay = document.getElementById('dropOverlay');
		const errorToast = document.getElementById('errorToast');

		// File state
		const attachedFiles = [];
		const MAX_FILE_SIZE = 1024 * 1024; // 1MB
		const MAX_TOTAL_SIZE = 5 * 1024 * 1024; // 5MB total
		const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.py', '.js', '.ts', '.tsx', '.jsx', '.json', '.yaml', '.yml', '.xml', '.html', '.css', '.rs', '.go', '.java', '.c', '.cpp', '.h', '.hpp', '.sh', '.sql'];

		// Track scroll position
		messagesContainer.addEventListener('scroll', () => {
			const threshold = 100;
			isAtBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < threshold;
			if (isAtBottom) {
				newMessageIndicator.style.display = 'none';
			}
		});

		// Scroll to bottom initially — delay to ensure layout is complete
		requestAnimationFrame(() => {
			setTimeout(() => scrollToBottom(), 50);
		});

		// Auto-resize textarea if draft was restored
		if (chatInput.value) {
			chatInput.style.height = 'auto';
			chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
		}

		function scrollToBottom() {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
			newMessageIndicator.style.display = 'none';
		}

		// ===== File Upload Handlers =====

		// Attach button click
		attachBtn.addEventListener('click', () => {
			fileInput.click();
		});

		// File input change
		fileInput.addEventListener('change', async (e) => {
			const files = Array.from(e.target.files || []);
			for (const file of files) {
				await addFile(file);
			}
			fileInput.value = ''; // Reset for next selection
		});

		// Drag and drop
		let dragCounter = 0;

		document.addEventListener('dragenter', (e) => {
			e.preventDefault();
			dragCounter++;
			if (e.dataTransfer.types.includes('Files')) {
				dropOverlay.classList.add('active');
			}
		});

		document.addEventListener('dragleave', (e) => {
			e.preventDefault();
			dragCounter--;
			if (dragCounter === 0) {
				dropOverlay.classList.remove('active');
			}
		});

		document.addEventListener('dragover', (e) => {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'copy';
		});

		document.addEventListener('drop', async (e) => {
			e.preventDefault();
			dragCounter = 0;
			dropOverlay.classList.remove('active');

			const files = Array.from(e.dataTransfer.files || []);
			for (const file of files) {
				await addFile(file);
			}
		});

		// Add file to attachments
		async function addFile(file) {
			// Check extension
			const ext = '.' + file.name.split('.').pop().toLowerCase();
			if (!SUPPORTED_EXTENSIONS.includes(ext)) {
				showError('Unsupported file type: ' + ext);
				return;
			}

			// Check file size
			if (file.size > MAX_FILE_SIZE) {
				showError('File too large (max 1MB): ' + file.name);
				return;
			}

			// Check total size
			const currentTotal = attachedFiles.reduce((sum, f) => sum + f.size, 0);
			if (currentTotal + file.size > MAX_TOTAL_SIZE) {
				showError('Total attachment size exceeded (max 5MB)');
				return;
			}

			// Check if already attached
			if (attachedFiles.some(f => f.filename === file.name)) {
				showError('File already attached: ' + file.name);
				return;
			}

			try {
				const content = await readFileAsText(file);
				const fileObj = {
					id: Date.now() + Math.random(),
					filename: file.name,
					content: content,
					size: file.size
				};
				attachedFiles.push(fileObj);
				renderFilePills();
			} catch (err) {
				showError('Failed to read file: ' + file.name);
			}
		}

		// Read file as text
		function readFileAsText(file) {
			return new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => resolve(reader.result);
				reader.onerror = () => reject(reader.error);
				reader.readAsText(file);
			});
		}

		// Render file pills
		function renderFilePills() {
			filePills.innerHTML = attachedFiles.map(f => \`
				<div class="file-pill" data-id="\${f.id}">
					<i class="codicon codicon-file file-pill-icon"></i>
					<span class="file-pill-name" title="\${escapeHtml(f.filename)}">\${escapeHtml(f.filename)}</span>
					<span class="file-pill-size">(\${formatFileSize(f.size)})</span>
					<span class="file-pill-remove" onclick="removeFile(\${f.id})" title="Remove"><i class="codicon codicon-close"></i></span>
				</div>
			\`).join('');
		}

		// Remove file
		function removeFile(id) {
			const idx = attachedFiles.findIndex(f => f.id === id);
			if (idx > -1) {
				attachedFiles.splice(idx, 1);
				renderFilePills();
			}
		}
		// Expose to onclick
		window.removeFile = removeFile;

		// Format file size
		function formatFileSize(bytes) {
			if (bytes < 1024) return bytes + ' B';
			if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
			return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
		}

		// Show error toast
		function showError(message) {
			errorToast.textContent = message;
			errorToast.style.display = 'block';
			setTimeout(() => {
				errorToast.style.display = 'none';
			}, 3000);
		}

		// ===== Chat Input Handlers =====

		// Auto-resize textarea + persist draft
		chatInput.addEventListener('input', () => {
			chatInput.style.height = 'auto';
			chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
			vscode.postMessage({ type: 'draftChanged', value: chatInput.value });
		});

		// Send on Enter (Shift+Enter for newline)
		chatInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				sendMessage();
			}
		});

		// Send button click
		sendBtn.addEventListener('click', sendMessage);

		// Send message
		function sendMessage() {
			const message = chatInput.value.trim();
			if (!message && attachedFiles.length === 0) return;

			// Send to extension
			vscode.postMessage({
				type: 'sendMessageWithFiles',
				message: message,
				files: attachedFiles.map(f => ({
					filename: f.filename,
					content: f.content,
					size: f.size
				}))
			});

			// Clear input
			chatInput.value = '';
			chatInput.style.height = 'auto';
			attachedFiles.length = 0;
			renderFilePills();

			// Focus back on input
			chatInput.focus();
		}

		// ===== Message Updates from Extension =====

		window.addEventListener('message', event => {
			const message = event.data;

			if (message.type === 'updateMessages') {
				const messages = message.messages;
				messageCountEl.textContent = messages.length;

				// Rebuild messages
				const html = messages.map(msg => \`
					<div class="message \${escapeHtml(msg.role)}" data-id="\${escapeHtml(msg.id)}">
						<div class="role">\${msg.role === 'user' ? 'You' : 'TARX'}</div>
						<div class="content">\${escapeHtml(msg.content)}</div>
						<div class="timestamp">\${formatTimestamp(msg.created_at)}</div>
					</div>
				\`).join('');

				messagesEl.innerHTML = html || '<div class="empty-state">No messages yet.</div>';

				// Auto-scroll or show indicator
				if (isAtBottom) {
					scrollToBottom();
				} else {
					newMessageIndicator.style.display = 'block';
				}
			}

			// Handle optimistic UI update
			if (message.type === 'messageSent') {
				// Remove loading indicator if present
				const loader = document.getElementById('loading-indicator');
				if (loader) loader.remove();

				const msg = message.message;
				const msgHtml = \`
					<div class="message \${escapeHtml(msg.role)}" data-id="\${escapeHtml(msg.id)}">
						<div class="role">\${msg.role === 'user' ? 'You' : 'TARX'}</div>
						<div class="content">\${escapeHtml(msg.content)}</div>
						<div class="timestamp">\${formatTimestamp(msg.created_at)}</div>
					</div>
				\`;
				messagesEl.insertAdjacentHTML('beforeend', msgHtml);
				const count = parseInt(messageCountEl.textContent) + 1;
				messageCountEl.textContent = count;
				scrollToBottom();
			}

			// Show loading indicator while waiting for AI response
			if (message.type === 'showLoading') {
				const existingLoader = document.getElementById('loading-indicator');
				if (!existingLoader) {
					const loaderHtml = \`
						<div id="loading-indicator" class="message assistant loading">
							<div class="role">TARX</div>
							<div class="content"><span class="typing-dots">Thinking<span>.</span><span>.</span><span>.</span></span></div>
						</div>
					\`;
					messagesEl.insertAdjacentHTML('beforeend', loaderHtml);
					scrollToBottom();
				}
			}

			// Hide loading indicator
			if (message.type === 'hideLoading') {
				const loader = document.getElementById('loading-indicator');
				if (loader) loader.remove();
			}

			// Streaming: receive individual tokens as they arrive from inference
			if (message.type === 'streamToken') {
				// Remove loading indicator on first token
				const loader = document.getElementById('loading-indicator');
				if (loader) loader.remove();

				// Create or append to streaming message element
				let streamEl = document.getElementById('streaming-message');
				if (!streamEl) {
					const streamHtml = \`
						<div id="streaming-message" class="message assistant" data-id="streaming">
							<div class="role">TARX</div>
							<div class="content" id="streaming-content"></div>
						</div>
					\`;
					messagesEl.insertAdjacentHTML('beforeend', streamHtml);
					streamEl = document.getElementById('streaming-message');
				}

				const contentEl = document.getElementById('streaming-content');
				if (contentEl) {
					contentEl.textContent += message.token;
				}
				scrollToBottom();
			}

			// Streaming complete: finalize the message with full content
			if (message.type === 'streamEnd') {
				const streamEl = document.getElementById('streaming-message');
				if (streamEl) streamEl.remove();

				const loader = document.getElementById('loading-indicator');
				if (loader) loader.remove();

				const msg = message.message;
				const msgHtml = \`
					<div class="message \${escapeHtml(msg.role)}" data-id="\${escapeHtml(msg.id)}">
						<div class="role">\${msg.role === 'user' ? 'You' : 'TARX'}</div>
						<div class="content">\${escapeHtml(msg.content)}</div>
						<div class="timestamp">\${formatTimestamp(msg.created_at)}</div>
					</div>
				\`;
				messagesEl.insertAdjacentHTML('beforeend', msgHtml);
				const count = parseInt(messageCountEl.textContent) + 1;
				messageCountEl.textContent = count;
				scrollToBottom();
			}
		});

		function escapeHtml(text) {
			const div = document.createElement('div');
			div.textContent = text;
			return div.innerHTML;
		}

		function formatTimestamp(unix) {
			const date = new Date(unix * 1000);
			return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		}
	</script>
</body>
</html>`;
	}

	private _escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	private _formatTimestamp(unix: number): string {
		const date = new Date(unix * 1000);
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	public dispose(): void {
		TarxSessionPanel.currentPanel = undefined;
		this.stopPolling();
		this._panel.dispose();

		while (this._disposables.length) {
			const disposable = this._disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}
	}
}

/**
 * Register session panel commands
 */
export function registerSessionPanelCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.openSessionPanel', (sessionId: string, spaceId?: string) => {
			TarxSessionPanel.createOrShow(context.extensionUri, sessionId, spaceId);
		})
	);
}
