/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TARX Claude Sessions Provider
 *
 * Displays Claude.ai conversation sessions from the memory database.
 * Allows users to browse, view, and continue conversations in Claude.ai.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

interface ClaudeSession {
	id: string;
	title: string;
	topic?: string;
	created_at: number;
	last_activity: number;
	message_count: number;
	space_id?: string;
}

interface SessionMessage {
	id: string;
	role: string;
	content: string;
	created_at: number;
}

export class ClaudeSessionsProvider implements vscode.TreeDataProvider<SessionTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<SessionTreeItem | undefined | null>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private dbPath: string;

	constructor() {
		// Use canonical TARX database path (matches MCP server)
		this.dbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
	}

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: SessionTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: SessionTreeItem): Promise<SessionTreeItem[]> {
		if (!element) {
			// Root level - show sessions
			return this.getSessions();
		}
		return [];
	}

	private async getSessions(): Promise<SessionTreeItem[]> {
		try {
			if (!fs.existsSync(this.dbPath)) {
				console.log('[TARX] Claude sessions database not found:', this.dbPath);
				return [new SessionTreeItem(
					'No sessions found',
					'',
					vscode.TreeItemCollapsibleState.None,
					undefined,
					'info'
				)];
			}

			// Use sqlite3 CLI to avoid better-sqlite3 version mismatch
			// Check if sessions table exists
			const tableCheckQuery = `SELECT name FROM sqlite_master WHERE type='table' AND name='sessions';`;
			const tableCheckResult = execSync(`sqlite3 "${this.dbPath}" -json`, {
				encoding: 'utf8',
				input: tableCheckQuery
			});
			const tableCheck = JSON.parse(tableCheckResult || '[]');

			if (tableCheck.length === 0) {
				return [new SessionTreeItem(
					'No sessions table found',
					'',
					vscode.TreeItemCollapsibleState.None,
					undefined,
					'info'
				)];
			}

			// Query sessions - find Claude AI Sessions space by name, then get sessions
			let sessions: ClaudeSession[] = [];

			try {
				// First, find spaces with "Claude" in the name
				const spacesQuery = `SELECT id FROM spaces WHERE name LIKE '%Claude%' OR name LIKE '%claude%';`;
				const spacesResult = execSync(`sqlite3 "${this.dbPath}" -json`, {
					encoding: 'utf8',
					input: spacesQuery
				});
				const claudeSpaces = JSON.parse(spacesResult || '[]') as { id: string }[];

				const spaceIds = claudeSpaces.map(s => s.id);

				if (spaceIds.length > 0) {
					// Get sessions from Claude-related spaces
					const spaceIdList = spaceIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
					const sessionsQuery = `
						SELECT s.id, s.title, s.topic, s.created_at, s.updated_at as last_activity,
						       s.message_count, s.space_id
						FROM sessions s
						WHERE s.space_id IN (${spaceIdList})
						ORDER BY s.updated_at DESC
						LIMIT 50;
					`;
					const sessionsResult = execSync(`sqlite3 "${this.dbPath}" -json`, {
						encoding: 'utf8',
						input: sessionsQuery
					});
					sessions = JSON.parse(sessionsResult || '[]') as ClaudeSession[];
				} else {
					// Fallback: show all recent sessions
					const sessionsQuery = `
						SELECT s.id, s.title, s.topic, s.created_at, s.updated_at as last_activity,
						       s.message_count, s.space_id
						FROM sessions s
						ORDER BY s.updated_at DESC
						LIMIT 50;
					`;
					const sessionsResult = execSync(`sqlite3 "${this.dbPath}" -json`, {
						encoding: 'utf8',
						input: sessionsQuery
					});
					sessions = JSON.parse(sessionsResult || '[]') as ClaudeSession[];
				}
			} catch {
				// Fallback query without space_id
				const fallbackQuery = `
					SELECT id, title, '' as topic, created_at, updated_at as last_activity,
					       message_count, '' as space_id
					FROM sessions
					ORDER BY updated_at DESC
					LIMIT 50;
				`;
				const fallbackResult = execSync(`sqlite3 "${this.dbPath}" -json`, {
					encoding: 'utf8',
					input: fallbackQuery
				});
				sessions = JSON.parse(fallbackResult || '[]') as ClaudeSession[];
			}

			if (sessions.length === 0) {
				return [new SessionTreeItem(
					'No Claude sessions yet',
					'',
					vscode.TreeItemCollapsibleState.None,
					undefined,
					'info'
				)];
			}

			return sessions.map(session =>
				new SessionTreeItem(
					session.title || 'Untitled Session',
					session.id,
					vscode.TreeItemCollapsibleState.None,
					session,
					'session'
				)
			);

		} catch (error) {
			console.error('[TARX] Failed to load Claude sessions:', error);
			return [new SessionTreeItem(
				'Error loading sessions',
				'',
				vscode.TreeItemCollapsibleState.None,
				undefined,
				'error'
			)];
		}
	}

	/**
	 * Get messages for a specific session
	 */
	getSessionMessages(sessionId: string): SessionMessage[] {
		try {
			if (!fs.existsSync(this.dbPath)) {
				return [];
			}

			// Use sqlite3 CLI to avoid better-sqlite3 version mismatch
			const messagesQuery = `
				SELECT id, role, content, created_at
				FROM messages
				WHERE session_id = '${sessionId.replace(/'/g, "''")}'
				ORDER BY created_at ASC;
			`;
			const messagesResult = execSync(`sqlite3 "${this.dbPath}" -json`, {
				encoding: 'utf8',
				input: messagesQuery
			});
			const messages = JSON.parse(messagesResult || '[]') as SessionMessage[];

			return messages;

		} catch (error) {
			console.error('[TARX] Failed to load session messages:', error);
			return [];
		}
	}
}

type SessionItemType = 'session' | 'info' | 'error';

class SessionTreeItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly sessionId: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly session?: ClaudeSession,
		public readonly itemType: SessionItemType = 'session'
	) {
		super(label, collapsibleState);
		this.setupItem();
	}

	private setupItem(): void {
		switch (this.itemType) {
			case 'session':
				if (this.session) {
					this.tooltip = this.buildTooltip();
					this.description = this.formatDescription();
					this.contextValue = 'claudeSession';
					this.iconPath = new vscode.ThemeIcon('comment-discussion');

					this.command = {
						command: 'tarx.openClaudeSession',
						title: 'Open Session',
						arguments: [this.session]
					};
				}
				break;

			case 'info':
				this.iconPath = new vscode.ThemeIcon('info');
				this.contextValue = 'info';
				break;

			case 'error':
				this.iconPath = new vscode.ThemeIcon('error');
				this.contextValue = 'error';
				break;
		}
	}

	private buildTooltip(): string {
		if (!this.session) return '';

		const lines = [
			this.session.title || 'Untitled',
			`${this.session.message_count || 0} messages`,
			`Last active: ${this.formatTime(this.session.last_activity)}`
		];

		if (this.session.topic) {
			lines.push(`Topic: ${this.session.topic}`);
		}

		return lines.join('\n');
	}

	private formatDescription(): string {
		if (!this.session) return '';
		return `${this.session.message_count || 0} msgs`;
	}

	private formatTime(timestamp: number): string {
		if (!timestamp) return 'Unknown';

		// Handle both seconds and milliseconds timestamps
		const ts = timestamp > 9999999999 ? timestamp : timestamp * 1000;
		const date = new Date(ts);
		const now = Date.now();
		const diff = now - ts;

		if (diff < 60000) return 'Just now';
		if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
		if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
		if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
}

/**
 * Register Claude Sessions tree view and commands
 */
export function registerClaudeSessionsProvider(context: vscode.ExtensionContext): ClaudeSessionsProvider {
	const provider = new ClaudeSessionsProvider();

	// Register tree view
	const treeView = vscode.window.createTreeView('tarx.claudeSessions', {
		treeDataProvider: provider,
		showCollapseAll: false
	});
	context.subscriptions.push(treeView);

	// Safe command registration helper
	function safeRegister(commandId: string, handler: (...args: any[]) => any) {
		try {
			context.subscriptions.push(
				vscode.commands.registerCommand(commandId, handler)
			);
		} catch (error) {
			if (error instanceof Error && error.message.includes('already exists')) {
				console.log(`[TARX] Command ${commandId} already exists, skipping`);
			} else {
				console.error(`[TARX] Failed to register ${commandId}:`, error);
			}
		}
	}

	// Register refresh command
	safeRegister('tarx.refreshClaudeSessions', () => {
		provider.refresh();
	});

	// Register open session command
	safeRegister('tarx.openClaudeSession', (session: ClaudeSession) => {
		openClaudeSessionPanel(context, provider, session);
	});

	// Register continue in browser command
	safeRegister('tarx.continueInClaude', (sessionId: string) => {
		const url = `https://claude.ai/chat/${sessionId}`;
		vscode.env.openExternal(vscode.Uri.parse(url));
	});

	console.log('[TARX] Claude Sessions provider registered');
	return provider;
}

/**
 * Open a webview panel showing the full session conversation
 */
function openClaudeSessionPanel(
	context: vscode.ExtensionContext,
	provider: ClaudeSessionsProvider,
	session: ClaudeSession
): void {
	const panel = vscode.window.createWebviewPanel(
		'claudeSession',
		`Claude: ${session.title || 'Untitled'}`,
		vscode.ViewColumn.One,
		{
			enableScripts: true,
			retainContextWhenHidden: true
		}
	);

	// Load messages
	const messages = provider.getSessionMessages(session.id);

	// Set HTML content
	panel.webview.html = getSessionWebviewContent(session, messages);

	// Handle messages from webview
	panel.webview.onDidReceiveMessage(
		message => {
			switch (message.type) {
				case 'continueInClaude':
					vscode.commands.executeCommand('tarx.continueInClaude', session.id);
					break;
			}
		},
		undefined,
		context.subscriptions
	);
}

/**
 * Generate HTML content for session webview
 */
function getSessionWebviewContent(session: ClaudeSession, messages: SessionMessage[]): string {
	const messagesHtml = messages.length > 0
		? messages.map(msg => `
			<div class="message ${escapeHtml(msg.role)}">
				<div class="role">${escapeHtml(msg.role)}</div>
				<div class="content">${escapeHtml(msg.content)}</div>
				<div class="timestamp">${formatTimestamp(msg.created_at)}</div>
			</div>
		`).join('')
		: '<div class="empty-state">No messages in this session</div>';

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Claude Session</title>
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
			padding: 20px;
			line-height: 1.6;
		}

		.header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 20px;
			padding-bottom: 15px;
			border-bottom: 1px solid var(--vscode-panel-border);
		}

		.header-content h1 {
			font-size: 18px;
			font-weight: 600;
			margin-bottom: 4px;
		}

		.header-meta {
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
		}

		.continue-btn {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			padding: 8px 16px;
			border-radius: 4px;
			cursor: pointer;
			font-size: 13px;
			display: flex;
			align-items: center;
			gap: 6px;
		}

		.continue-btn:hover {
			background: var(--vscode-button-hoverBackground);
		}

		.messages {
			display: flex;
			flex-direction: column;
			gap: 16px;
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
			border-left: 3px solid var(--vscode-charts-green);
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
			color: var(--vscode-charts-green);
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
			padding: 40px;
			color: var(--vscode-descriptionForeground);
		}
	</style>
</head>
<body>
	<div class="header">
		<div class="header-content">
			<h1>${escapeHtml(session.title || 'Untitled Session')}</h1>
			<div class="header-meta">
				${messages.length} messages${session.topic ? ` \u2022 ${escapeHtml(session.topic)}` : ''}
			</div>
		</div>
		<button class="continue-btn" onclick="continueInClaude()">
			Continue in Claude.ai \u2192
		</button>
	</div>

	<div class="messages">
		${messagesHtml}
	</div>

	<script>
		const vscode = acquireVsCodeApi();

		function continueInClaude() {
			vscode.postMessage({ type: 'continueInClaude' });
		}
	</script>
</body>
</html>`;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
	if (!text) return '';
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: number): string {
	if (!timestamp) return '';
	// Handle both seconds and milliseconds timestamps
	const ts = timestamp > 9999999999 ? timestamp : timestamp * 1000;
	return new Date(ts).toLocaleString();
}
