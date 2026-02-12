/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Lightweight chat message stored in workspaceState.
 */
export interface ChatHistoryEntry {
	role: 'user' | 'assistant';
	content: string;
	timestamp: number;
	fileRefs?: string[];
}

/**
 * Session metadata stored in workspaceState for dropdown state.
 */
export interface ChatSessionMeta {
	sessionId: string;
	projectId: string | null;
	projectName: string | null;
	title: string;
}

const HISTORY_KEY = 'tarx.chatHistory';
const SESSION_META_KEY = 'tarx.chatSessionMeta';
const MAX_HISTORY = 200;

/**
 * TarxChatPanel — manages a webview panel for chat in ViewColumn.Beside (right column).
 *
 * Features:
 * - Spawns in the right panel (ViewColumn.Beside)
 * - Persistent history via workspaceState (per-workspace, survives close/reopen)
 * - File uploads via drag/drop or file input → base64 → host → tarx.uploadFile
 * - Resumable: reopen restores last conversation
 */
export class TarxChatPanel {
	public static currentPanel: TarxChatPanel | undefined;
	private static readonly viewType = 'tarx.chatPanel';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _context: vscode.ExtensionContext;
	private _disposables: vscode.Disposable[] = [];
	private _sessionMeta: ChatSessionMeta | null = null;

	/**
	 * Create or reveal the chat panel in the right column.
	 */
	public static createOrShow(context: vscode.ExtensionContext, initialPrompt?: string): TarxChatPanel {
		console.log('[TARX Chat Panel] createOrShow called at', new Date().toISOString());
		try {
			// If panel already exists, reveal it
			if (TarxChatPanel.currentPanel) {
				TarxChatPanel.currentPanel._panel.reveal(vscode.ViewColumn.Beside);
				if (initialPrompt) {
					TarxChatPanel.currentPanel._postMessage({ command: 'setPrompt', text: initialPrompt });
				}
				console.log('[TARX Chat Panel] Revealed existing panel');
				return TarxChatPanel.currentPanel;
			}

			// Create new panel in right column
			const panel = vscode.window.createWebviewPanel(
				TarxChatPanel.viewType,
				'TARX Chat',
				{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
				{
					enableScripts: true,
					enableCommandUris: false,
					retainContextWhenHidden: true,
					localResourceRoots: []
				}
			);

			// Hide unrelated views (Explorer, Search, Source Control, Extensions) in the
			// auxiliary/secondary sidebar so the chat pane stays clean.
			try {
				vscode.commands.executeCommand('setContext', 'tarx.chatPanelVisible', true);
			} catch { /* best effort */ }

			TarxChatPanel.currentPanel = new TarxChatPanel(panel, context, initialPrompt);
			console.log('[TARX Chat Panel] Created new panel in ViewColumn.Beside');
			return TarxChatPanel.currentPanel;
		} catch (err: unknown) {
			const errMsg = err instanceof Error ? err.stack || err.message : String(err);
			console.error('[TARX Chat Panel] CRASH in createOrShow:', errMsg);
			throw err; // re-throw so caller knows it failed
		}
	}

	private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, initialPrompt?: string) {
		this._panel = panel;
		this._context = context;

		// Load persisted session meta
		this._sessionMeta = context.workspaceState.get<ChatSessionMeta | null>(SESSION_META_KEY, null);
		this._updatePanelTitle();

		// Set webview HTML
		this._panel.webview.html = this._getHtml(initialPrompt);

		// Handle messages from webview
		this._panel.webview.onDidReceiveMessage(
			(msg) => this._handleMessage(msg),
			null,
			this._disposables
		);

		// Clean up on dispose
		this._panel.onDidDispose(() => this._dispose(), null, this._disposables);

		console.log('[TARX Chat Panel] Initialized, loading history from workspaceState');
		console.log('[TARX Chat Panel] Chat header rendered with project dropdown and dynamic title');
	}

	/**
	 * Update the panel tab title based on session meta.
	 */
	private _updatePanelTitle(): void {
		if (this._sessionMeta?.projectName) {
			this._panel.title = `${this._sessionMeta.projectName} Chat`;
		} else if (this._sessionMeta?.title && this._sessionMeta.title !== 'TARX Chat') {
			this._panel.title = this._sessionMeta.title;
		} else {
			this._panel.title = 'TARX Chat';
		}
	}

	/**
	 * Load persisted history from workspaceState.
	 */
	private _getHistory(): ChatHistoryEntry[] {
		return this._context.workspaceState.get<ChatHistoryEntry[]>(HISTORY_KEY, []);
	}

	/**
	 * Save history to workspaceState (persistent per workspace).
	 */
	private async _saveHistory(history: ChatHistoryEntry[]): Promise<void> {
		// Keep bounded
		const trimmed = history.slice(-MAX_HISTORY);
		await this._context.workspaceState.update(HISTORY_KEY, trimmed);
	}

	/**
	 * Append a message to history and persist.
	 */
	public async appendToHistory(entry: ChatHistoryEntry): Promise<void> {
		const history = this._getHistory();
		history.push(entry);
		await this._saveHistory(history);
	}

	/**
	 * Post a message to the webview.
	 */
	private _postMessage(msg: Record<string, unknown>): void {
		this._panel.webview.postMessage(msg);
	}

	/**
	 * Handle messages from the chat webview.
	 */
	private async _handleMessage(msg: any): Promise<void> {
		switch (msg.command) {
			case 'ready': {
				// Send persisted history to webview on load
				const history = this._getHistory();
				this._postMessage({ command: 'historyLoaded', history });
				// Send current session meta
				if (this._sessionMeta) {
					this._postMessage({ command: 'sessionMetaLoaded', meta: this._sessionMeta });
				}
				// Eagerly load projects + chats for dropdown
				this._sendProjectList();
				this._sendChatList();
				console.log(`[TARX Chat Panel] Sent ${history.length} history entries to webview`);
				break;
			}

			case 'sendMessage': {
				const userText: string = msg.text || '';
				if (!userText.trim()) { return; }

				// Persist user message
				await this.appendToHistory({ role: 'user', content: userText, timestamp: Date.now() });

				// Show typing indicator
				this._postMessage({ command: 'typingStart' });

				// Route through the existing chat infrastructure via tarx.openChat command
				// This triggers the chat participant which handles inference + DB persistence
				try {
					await vscode.commands.executeCommand('workbench.action.chat.open', { query: `@tarx ${userText}` });
				} catch (e) {
					console.error('[TARX Chat Panel] Failed to route to chat participant:', e);
				}

				this._postMessage({ command: 'typingStop' });
				break;
			}

			case 'uploadFile': {
				// File uploaded from webview: { filename, content (base64), size, mimeType }
				console.log('[TARX Chat Panel] Upload received:', msg.filename, msg.size, 'bytes');
				try {
					const result = await vscode.commands.executeCommand('tarx.uploadFile', {
						filename: msg.filename,
						content: msg.content,
						size: msg.size,
						mimeType: msg.mimeType
					});
					this._postMessage({ command: 'uploadComplete', filename: msg.filename, result });
					console.log('[TARX Chat Panel] Upload complete:', msg.filename);
				} catch (e: any) {
					this._postMessage({ command: 'uploadError', filename: msg.filename, error: e?.message || String(e) });
					console.error('[TARX Chat Panel] Upload failed:', e);
				}
				break;
			}

			case 'clearHistory': {
				await this._context.workspaceState.update(HISTORY_KEY, []);
				this._postMessage({ command: 'historyCleared' });
				console.log('[TARX Chat Panel] History cleared');
				break;
			}

			case 'toggleSecondarySidebar': {
				await vscode.commands.executeCommand('workbench.action.toggleAuxiliaryBar');
				console.log('[TARX Chat Panel] Toggled secondary sidebar');
				break;
			}

			case 'requestProjectList': {
				await this._sendProjectList();
				break;
			}

			case 'requestChatList': {
				await this._sendChatList();
				break;
			}

			case 'associateProject': {
				// Associate current chat session with a project
				try {
					const projectId: string | null = msg.projectId || null;
					const projectName: string | null = msg.projectName || null;
					this._sessionMeta = {
						sessionId: this._sessionMeta?.sessionId || `chat-${Date.now()}`,
						projectId,
						projectName,
						title: projectName ? `${projectName} Chat` : 'TARX Chat'
					};
					await this._context.workspaceState.update(SESSION_META_KEY, this._sessionMeta);
					this._updatePanelTitle();
					this._postMessage({ command: 'sessionMetaLoaded', meta: this._sessionMeta });
					console.log(`[TARX Chat Panel] Associated with project: ${projectName} (${projectId})`);
				} catch (e) {
					console.error('[TARX Chat Panel] associateProject failed:', e);
				}
				break;
			}

			case 'swapChat': {
				// Swap to a different conversation
				try {
					const conversationId: string = msg.conversationId;
					if (!conversationId) { return; }

					// Load conversation turns via command
					const turns: any[] = await vscode.commands.executeCommand('tarx.internal.getConversationTurns', conversationId) as any[] || [];
					// Clear current history and load new one
					const newHistory: ChatHistoryEntry[] = turns
						.filter((t: any) => t.role === 'user' || t.role === 'assistant')
						.map((t: any) => ({
							role: t.role as 'user' | 'assistant',
							content: t.content,
							timestamp: t.createdAt * 1000 || Date.now(),
						}));
					await this._saveHistory(newHistory);

					// Update session meta with conversation title
					const title = msg.title || 'TARX Chat';
					this._sessionMeta = {
						sessionId: conversationId,
						projectId: this._sessionMeta?.projectId || null,
						projectName: this._sessionMeta?.projectName || null,
						title
					};
					await this._context.workspaceState.update(SESSION_META_KEY, this._sessionMeta);
					this._updatePanelTitle();

					// Reload webview with new history
					this._postMessage({ command: 'historyCleared' });
					this._postMessage({ command: 'historyLoaded', history: newHistory });
					this._postMessage({ command: 'sessionMetaLoaded', meta: this._sessionMeta });
					console.log(`[TARX Chat Panel] Swapped to conversation: ${conversationId}`);
				} catch (e) {
					console.error('[TARX Chat Panel] swapChat failed:', e);
				}
				break;
			}

			default:
				console.log('[TARX Chat Panel] Unknown message:', msg.command);
		}
	}

	/**
	 * Fetch project list from extension and send to webview.
	 */
	private async _sendProjectList(): Promise<void> {
		try {
			const projects: any[] = await vscode.commands.executeCommand('tarx.internal.listProjects') as any[] || [];
			this._postMessage({ command: 'projectListLoaded', projects });
			console.log(`[TARX Chat Panel] Sent ${projects.length} projects to webview`);
		} catch (e) {
			console.error('[TARX Chat Panel] Failed to fetch projects:', e);
			this._postMessage({ command: 'projectListLoaded', projects: [] });
		}
	}

	/**
	 * Fetch recent conversations and send to webview.
	 */
	private async _sendChatList(): Promise<void> {
		try {
			const chats: any[] = await vscode.commands.executeCommand('tarx.getRecentConversations') as any[] || [];
			this._postMessage({ command: 'chatListLoaded', chats });
			console.log(`[TARX Chat Panel] Sent ${chats.length} chats to webview`);
		} catch (e) {
			console.error('[TARX Chat Panel] Failed to fetch chats:', e);
			this._postMessage({ command: 'chatListLoaded', chats: [] });
		}
	}

	private _dispose(): void {
		TarxChatPanel.currentPanel = undefined;
		try {
			vscode.commands.executeCommand('setContext', 'tarx.chatPanelVisible', false);
		} catch { /* best effort */ }
		for (const d of this._disposables) {
			d.dispose();
		}
		this._disposables = [];
		console.log('[TARX Chat Panel] Disposed');
	}

	/**
	 * Generate the webview HTML for the chat panel.
	 * Self-contained — no external bundle dependencies.
	 */
	private _getHtml(initialPrompt?: string): string {
		const escapedPrompt = initialPrompt ? initialPrompt.replace(/'/g, "\\'").replace(/\n/g, '\\n') : '';

		return /*html*/`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TARX Chat</title>
<style>
	* { box-sizing: border-box; margin: 0; padding: 0; }
	body {
		font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
		font-size: var(--vscode-font-size, 13px);
		color: var(--vscode-foreground, #ccc);
		background: var(--vscode-editor-background, #1e1e1e);
		height: 100vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* Header */
	.chat-header {
		display: flex;
		flex-direction: column;
		padding: 8px 12px;
		border-bottom: 1px solid var(--vscode-panel-border, #333);
		background: var(--vscode-sideBar-background, #252526);
		flex-shrink: 0;
		gap: 6px;
	}
	.chat-header-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.chat-header h2 {
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		opacity: 0.8;
	}
	.header-actions button {
		background: none;
		border: none;
		color: var(--vscode-foreground);
		cursor: pointer;
		padding: 4px 6px;
		border-radius: 3px;
		font-size: 12px;
		opacity: 0.7;
	}
	.header-actions button:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground, #333); }

	/* Dropdown bar */
	.dropdown-bar {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.dropdown-bar select {
		flex: 1;
		background: var(--vscode-input-background, #3c3c3c);
		color: var(--vscode-input-foreground, #ccc);
		border: 1px solid var(--vscode-input-border, #3c3c3c);
		border-radius: 3px;
		padding: 3px 6px;
		font-family: inherit;
		font-size: 11px;
		outline: none;
		cursor: pointer;
		max-width: 50%;
	}
	.dropdown-bar select:focus {
		border-color: var(--vscode-focusBorder, #007acc);
	}
	.dropdown-bar select option {
		background: var(--vscode-input-background, #3c3c3c);
		color: var(--vscode-input-foreground, #ccc);
	}

	/* Messages area */
	.messages {
		flex: 1;
		overflow-y: auto;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.msg {
		padding: 8px 12px;
		border-radius: 6px;
		max-width: 90%;
		line-height: 1.5;
		word-wrap: break-word;
		white-space: pre-wrap;
	}
	.msg.user {
		background: var(--vscode-button-background, #0e639c);
		color: var(--vscode-button-foreground, #fff);
		align-self: flex-end;
		border-bottom-right-radius: 2px;
	}
	.msg.assistant {
		background: var(--vscode-editorWidget-background, #2d2d30);
		border: 1px solid var(--vscode-editorWidget-border, #454545);
		align-self: flex-start;
		border-bottom-left-radius: 2px;
	}
	.msg .timestamp {
		font-size: 10px;
		opacity: 0.5;
		margin-top: 4px;
		display: block;
	}
	.typing-indicator {
		padding: 8px 12px;
		opacity: 0.6;
		font-style: italic;
		display: none;
	}
	.typing-indicator.visible { display: block; }

	/* Empty state */
	.empty-state {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		opacity: 0.5;
		gap: 8px;
	}
	.empty-state .icon { font-size: 32px; }

	/* Input area */
	.input-area {
		border-top: 1px solid var(--vscode-panel-border, #333);
		padding: 8px 12px;
		background: var(--vscode-sideBar-background, #252526);
		flex-shrink: 0;
	}
	.upload-zone {
		display: none;
		padding: 8px;
		margin-bottom: 8px;
		border: 2px dashed var(--vscode-focusBorder, #007acc);
		border-radius: 4px;
		text-align: center;
		font-size: 11px;
		opacity: 0.7;
	}
	.upload-zone.drag-over {
		display: block;
		background: var(--vscode-editor-selectionBackground, rgba(0,120,204,0.15));
		opacity: 1;
	}
	.upload-zone.has-file { display: block; border-style: solid; }
	.attached-files {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
		margin-bottom: 6px;
	}
	.attached-file {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 6px;
		background: var(--vscode-badge-background, #4d4d4d);
		color: var(--vscode-badge-foreground, #fff);
		border-radius: 3px;
		font-size: 11px;
	}
	.attached-file .remove {
		cursor: pointer;
		opacity: 0.6;
		font-size: 10px;
	}
	.attached-file .remove:hover { opacity: 1; }
	.input-row {
		display: flex;
		gap: 6px;
		align-items: flex-end;
	}
	.input-row textarea {
		flex: 1;
		resize: none;
		border: 1px solid var(--vscode-input-border, #3c3c3c);
		background: var(--vscode-input-background, #3c3c3c);
		color: var(--vscode-input-foreground, #ccc);
		border-radius: 4px;
		padding: 6px 8px;
		font-family: inherit;
		font-size: inherit;
		min-height: 36px;
		max-height: 120px;
		outline: none;
	}
	.input-row textarea:focus { border-color: var(--vscode-focusBorder, #007acc); }
	.input-row button {
		background: var(--vscode-button-background, #0e639c);
		color: var(--vscode-button-foreground, #fff);
		border: none;
		border-radius: 4px;
		padding: 6px 12px;
		cursor: pointer;
		font-size: 12px;
		white-space: nowrap;
		height: 36px;
	}
	.input-row button:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
	.input-row button:disabled { opacity: 0.5; cursor: default; }
	.input-actions {
		display: flex;
		gap: 4px;
		margin-top: 4px;
	}
	.input-actions button {
		background: none;
		border: none;
		color: var(--vscode-foreground);
		cursor: pointer;
		padding: 2px 6px;
		border-radius: 3px;
		font-size: 11px;
		opacity: 0.6;
	}
	.input-actions button:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground, #333); }

	/* Upload toast */
	.upload-toast {
		position: fixed;
		bottom: 80px;
		right: 12px;
		background: var(--vscode-notificationsBackground, #252526);
		border: 1px solid var(--vscode-notificationsBorder, #333);
		border-radius: 4px;
		padding: 6px 10px;
		font-size: 11px;
		z-index: 100;
		display: none;
	}
	.upload-toast.visible { display: block; }
</style>
</head>
<body>
	<div class="chat-header">
		<div class="chat-header-top">
			<h2 id="headerTitle">TARX Chat</h2>
			<div class="header-actions">
				<button id="btnClear" title="Clear history">Clear</button>
				<button id="btnToggleSidebar" title="Toggle secondary sidebar">Sidebar</button>
			</div>
		</div>
		<div class="dropdown-bar">
			<select id="projectSelect" title="Associate with project">
				<option value="">No project</option>
			</select>
			<select id="chatSelect" title="Switch conversation">
				<option value="">Current chat</option>
			</select>
		</div>
	</div>

	<div class="messages" id="messages">
		<div class="empty-state" id="emptyState">
			<div class="icon">💬</div>
			<div>Start a conversation with TARX</div>
			<div style="font-size:11px">Files can be dragged here or attached below</div>
		</div>
	</div>

	<div class="typing-indicator" id="typing">TARX is thinking...</div>

	<div class="input-area">
		<div class="upload-zone" id="uploadZone">Drop files here to attach</div>
		<div class="attached-files" id="attachedFiles"></div>
		<div class="input-row">
			<textarea id="chatInput" rows="1" placeholder="Ask TARX anything..." autofocus></textarea>
			<button id="btnAttach" title="Attach file">📎</button>
			<button id="btnSend" title="Send (Enter)">Send</button>
		</div>
		<div class="input-actions">
			<input type="file" id="fileInput" multiple style="display:none" />
		</div>
	</div>

	<div class="upload-toast" id="uploadToast"></div>

<script>
(function() {
	const vscode = acquireVsCodeApi();
	const messagesEl = document.getElementById('messages');
	const emptyState = document.getElementById('emptyState');
	const typingEl = document.getElementById('typing');
	const chatInput = document.getElementById('chatInput');
	const btnSend = document.getElementById('btnSend');
	const btnClear = document.getElementById('btnClear');
	const btnToggleSidebar = document.getElementById('btnToggleSidebar');
	const btnAttach = document.getElementById('btnAttach');
	const fileInput = document.getElementById('fileInput');
	const uploadZone = document.getElementById('uploadZone');
	const attachedFilesEl = document.getElementById('attachedFiles');
	const uploadToast = document.getElementById('uploadToast');
	const headerTitle = document.getElementById('headerTitle');
	const projectSelect = document.getElementById('projectSelect');
	const chatSelect = document.getElementById('chatSelect');

	let attachedFiles = [];
	let currentSessionMeta = null;
	const initialPrompt = '${escapedPrompt}';

	// ── Messaging ──

	function post(msg) { vscode.postMessage(msg); }

	function addMessage(role, content, timestamp) {
		emptyState.style.display = 'none';
		const div = document.createElement('div');
		div.className = 'msg ' + role;
		const text = document.createElement('span');
		text.textContent = content;
		div.appendChild(text);
		if (timestamp) {
			const ts = document.createElement('span');
			ts.className = 'timestamp';
			ts.textContent = new Date(timestamp).toLocaleTimeString();
			div.appendChild(ts);
		}
		messagesEl.appendChild(div);
		messagesEl.scrollTop = messagesEl.scrollHeight;
	}

	function sendMessage() {
		const text = chatInput.value.trim();
		if (!text && attachedFiles.length === 0) return;
		addMessage('user', text, Date.now());
		post({ command: 'sendMessage', text: text });
		chatInput.value = '';
		chatInput.style.height = '36px';

		// Upload any attached files
		for (const f of attachedFiles) {
			post({ command: 'uploadFile', filename: f.name, content: f.data, size: f.size, mimeType: f.type });
		}
		attachedFiles = [];
		renderAttached();
	}

	// ── File upload (drag/drop + input) ──

	function readFileAsBase64(file) {
		return new Promise((resolve) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result);
			reader.readAsDataURL(file);
		});
	}

	async function handleFiles(fileList) {
		for (const file of fileList) {
			const data = await readFileAsBase64(file);
			attachedFiles.push({ name: file.name, size: file.size, type: file.type, data: data });
		}
		renderAttached();
	}

	function renderAttached() {
		attachedFilesEl.innerHTML = '';
		for (let i = 0; i < attachedFiles.length; i++) {
			const el = document.createElement('span');
			el.className = 'attached-file';
			el.innerHTML = attachedFiles[i].name + ' <span class="remove" data-idx="' + i + '">✕</span>';
			attachedFilesEl.appendChild(el);
		}
		// Wire remove buttons
		attachedFilesEl.querySelectorAll('.remove').forEach(btn => {
			btn.addEventListener('click', (e) => {
				const idx = parseInt(e.target.dataset.idx);
				attachedFiles.splice(idx, 1);
				renderAttached();
			});
		});
	}

	// Drag/drop on entire messages area
	messagesEl.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
	messagesEl.addEventListener('dragleave', () => { uploadZone.classList.remove('drag-over'); });
	messagesEl.addEventListener('drop', (e) => {
		e.preventDefault();
		uploadZone.classList.remove('drag-over');
		if (e.dataTransfer.files.length > 0) { handleFiles(e.dataTransfer.files); }
	});

	// File input button
	btnAttach.addEventListener('click', () => fileInput.click());
	fileInput.addEventListener('change', (e) => {
		if (e.target.files.length > 0) { handleFiles(e.target.files); }
		fileInput.value = '';
	});

	// ── UI Events ──

	btnSend.addEventListener('click', sendMessage);
	chatInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
	});

	// Auto-grow textarea
	chatInput.addEventListener('input', () => {
		chatInput.style.height = '36px';
		chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
	});

	btnClear.addEventListener('click', () => {
		post({ command: 'clearHistory' });
	});

	btnToggleSidebar.addEventListener('click', () => {
		post({ command: 'toggleSecondarySidebar' });
	});

	// ── Dropdown events ──

	projectSelect.addEventListener('change', () => {
		const opt = projectSelect.options[projectSelect.selectedIndex];
		const projectId = projectSelect.value || null;
		const projectName = projectId ? opt.textContent : null;
		post({ command: 'associateProject', projectId, projectName });
	});

	chatSelect.addEventListener('change', () => {
		const chatId = chatSelect.value;
		if (!chatId) return;
		const opt = chatSelect.options[chatSelect.selectedIndex];
		post({ command: 'swapChat', conversationId: chatId, title: opt.textContent || 'TARX Chat' });
		// Reset to "Current chat" after swap completes
		chatSelect.value = '';
	});

	// ── Messages from host ──

	window.addEventListener('message', (event) => {
		const msg = event.data;
		switch (msg.command) {
			case 'historyLoaded': {
				// Render persisted history
				const entries = msg.history || [];
				if (entries.length > 0) {
					emptyState.style.display = 'none';
					for (const entry of entries) {
						addMessage(entry.role, entry.content, entry.timestamp);
					}
				}
				break;
			}
			case 'historyCleared': {
				messagesEl.innerHTML = '';
				emptyState.style.display = '';
				messagesEl.appendChild(emptyState);
				break;
			}
			case 'setPrompt': {
				chatInput.value = msg.text || '';
				chatInput.focus();
				break;
			}
			case 'typingStart': {
				typingEl.classList.add('visible');
				messagesEl.scrollTop = messagesEl.scrollHeight;
				break;
			}
			case 'typingStop': {
				typingEl.classList.remove('visible');
				break;
			}
			case 'assistantMessage': {
				addMessage('assistant', msg.text, Date.now());
				break;
			}
			case 'uploadComplete': {
				showToast('Uploaded: ' + msg.filename);
				break;
			}
			case 'uploadError': {
				showToast('Upload failed: ' + (msg.error || msg.filename));
				break;
			}
			case 'projectListLoaded': {
				// Populate project dropdown
				const projects = msg.projects || [];
				const currentProjectId = currentSessionMeta?.projectId || '';
				projectSelect.innerHTML = '<option value="">No project</option>';
				for (const p of projects) {
					const opt = document.createElement('option');
					opt.value = p.id;
					opt.textContent = p.name || p.id;
					if (p.id === currentProjectId) { opt.selected = true; }
					projectSelect.appendChild(opt);
				}
				break;
			}
			case 'chatListLoaded': {
				// Populate chat dropdown
				const chats = msg.chats || [];
				chatSelect.innerHTML = '<option value="">Current chat</option>';
				for (const c of chats) {
					const opt = document.createElement('option');
					opt.value = c.id;
					opt.textContent = c.title || ('Chat ' + new Date(c.updatedAt).toLocaleDateString());
					chatSelect.appendChild(opt);
				}
				break;
			}
			case 'sessionMetaLoaded': {
				currentSessionMeta = msg.meta || null;
				if (currentSessionMeta) {
					headerTitle.textContent = currentSessionMeta.title || 'TARX Chat';
					// Sync project dropdown selection
					if (currentSessionMeta.projectId) {
						projectSelect.value = currentSessionMeta.projectId;
					}
				}
				break;
			}
		}
	});

	function showToast(text) {
		uploadToast.textContent = text;
		uploadToast.classList.add('visible');
		setTimeout(() => uploadToast.classList.remove('visible'), 3000);
	}

	// Set initial prompt if provided
	if (initialPrompt) {
		chatInput.value = initialPrompt;
		chatInput.focus();
	}

	// Signal ready
	post({ command: 'ready' });
})();
</script>
</body>
</html>`;
	}
}
