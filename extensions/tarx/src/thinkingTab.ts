/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  TARX Thinking Tab
 *
 *  Editor-area tab showing TARX's continuous background activity as a living
 *  conversation feed, with a user input at the bottom. The default landing
 *  experience — replaces VS Code's Welcome tab with proof of intelligence.
 *
 *  Architecture:
 *    BackgroundService emits events → ThinkingTab renders as feed entries
 *    User types at bottom → routed to @tarx chat participant → response in Chat panel
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TarxBackgroundService, BackgroundEvent, ServiceHealth, SessionBrief, FileChangeEvent } from './backgroundService';

// ============================================================================
// THINKING TAB
// ============================================================================

export class TarxThinkingTab implements vscode.Disposable {
	public static readonly viewType = 'tarx.thinking';
	private static instance: TarxThinkingTab | undefined;

	private panel: vscode.WebviewPanel;
	private service: TarxBackgroundService;
	private disposables: vscode.Disposable[] = [];
	private webviewReady = false;
	private pendingMessages: unknown[] = [];

	private constructor(panel: vscode.WebviewPanel, service: TarxBackgroundService) {
		this.panel = panel;
		this.service = service;
		this.attachListeners();
		console.log('[TARX-TT] ThinkingTab constructed, listeners attached');
	}

	/**
	 * Create or reveal the Thinking Tab.
	 */
	static create(service: TarxBackgroundService): TarxThinkingTab {
		if (TarxThinkingTab.instance) {
			TarxThinkingTab.instance.panel.reveal(vscode.ViewColumn.One);
			return TarxThinkingTab.instance;
		}

		const panel = vscode.window.createWebviewPanel(
			TarxThinkingTab.viewType,
			'TARX Thinking',
			vscode.ViewColumn.One,
			{
				retainContextWhenHidden: true,
				enableScripts: true
			}
		);

		const tab = new TarxThinkingTab(panel, service);
		TarxThinkingTab.instance = tab;
		panel.webview.html = getWebviewHtml();
		return tab;
	}

	/**
	 * Restore a serialized Thinking Tab (survives restart).
	 */
	static revive(panel: vscode.WebviewPanel, service: TarxBackgroundService): TarxThinkingTab {
		const tab = new TarxThinkingTab(panel, service);
		TarxThinkingTab.instance = tab;
		panel.webview.html = getWebviewHtml();
		return tab;
	}

	/**
	 * Focus the Thinking Tab if it exists.
	 */
	static focus(): void {
		TarxThinkingTab.instance?.panel.reveal(vscode.ViewColumn.One);
	}

	/**
	 * Check if the Thinking Tab is currently open.
	 */
	static isOpen(): boolean {
		return TarxThinkingTab.instance !== undefined;
	}

	dispose(): void {
		TarxThinkingTab.instance = undefined;
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables = [];
	}

	// ====================================================================
	// EVENT WIRING
	// ====================================================================

	private attachListeners(): void {
		// Listen for background service events
		const onEvent = (event: BackgroundEvent) => {
			console.log('[TARX-TT] Received service event:', event.type);
			this.handleServiceEvent(event);
		};
		this.service.on('event', onEvent);
		this.disposables.push({ dispose: () => this.service.removeListener('event', onEvent) });

		// Listen for webview messages (ready signal + user input)
		this.panel.webview.onDidReceiveMessage(
			(msg: { type: string; text?: string }) => {
				if (msg.type === 'ready') {
					console.log('[TARX-TT] Webview ready, flushing pending + requesting brief');
					this.webviewReady = true;
					// Flush any messages that arrived before the webview was ready
					for (const pending of this.pendingMessages) {
						this.panel.webview.postMessage(pending);
					}
					this.pendingMessages = [];
					// Request a fresh session brief now that webview can receive it
					this.service.emitSessionBrief().catch(err => {
						console.error('[TARX-TT] Failed to emit session brief:', err);
					});
				} else if (msg.type === 'user-input' && msg.text) {
					this.handleUserInput(msg.text);
				}
			},
			undefined,
			this.disposables
		);

		// Clean up on panel close
		this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
	}

	// ====================================================================
	// SERVICE EVENT → WEBVIEW
	// ====================================================================

	private handleServiceEvent(event: BackgroundEvent): void {
		switch (event.type) {
			case 'session-brief':
				this.renderSessionBrief(event.data);
				break;
			case 'health':
				this.renderHealthUpdate(event.data);
				break;
			case 'files-changed':
				this.renderFileChanges(event.data);
				break;
			case 'status-message':
				this.postEntry(event.data.icon, event.data.message);
				break;
		}
	}

	private renderSessionBrief(brief: SessionBrief): void {
		const lines: string[] = [];

		// Header
		lines.push('**TARX** ◐ Starting up...');
		lines.push('');

		// Time since last session
		if (brief.timeSinceLastSession) {
			lines.push(`━━━ Since you were last here (${brief.timeSinceLastSession}) ━━━`);
		} else {
			lines.push('━━━ First Session ━━━');
		}
		lines.push('');

		// Systems
		lines.push('━━━ Systems ━━━');
		const inf = brief.health.inference;
		if (inf.ok) {
			const speed = inf.tokPerSec ? ` (${inf.tokPerSec} tok/s)` : '';
			const model = inf.model ? ` — ${inf.model}` : '';
			lines.push(`✓ Inference engine online${speed}${model}`);
		} else {
			lines.push('⚠ Inference engine offline');
		}

		if (brief.health.embeddings.ok) {
			lines.push('✓ Knowledge base ready (768-dim embeddings)');
		} else {
			lines.push('⚠ Embedding server offline');
		}

		const mesh = brief.health.mesh;
		if (mesh.ok) {
			const peerStr = mesh.peers && mesh.peers > 0
				? `${mesh.peers} peer${mesh.peers !== 1 ? 's' : ''}`
				: "0 peers";
			lines.push(`✓ Mesh networking active (${peerStr})`);
		} else {
			lines.push('⚠ Mesh networking offline');
		}

		// Space summary
		if (brief.spaceSummary.length > 0) {
			lines.push('');
			lines.push('━━━ Your Workspace ━━━');
			for (const space of brief.spaceSummary) {
				const pct = space.count > 0 ? Math.round((space.indexed / space.count) * 100) : 0;
				lines.push(`→ "${space.name}": ${space.count} items, ${pct}% indexed`);
			}
		}

		lines.push('');
		lines.push('━━━ Ready ━━━');
		lines.push("I'm TARX. I run entirely on your machine — nothing leaves this device unless you tell me to.");
		lines.push('');
		lines.push('What are you working on?');

		this.postEntry('◐', lines.join('\n'));
	}

	private renderHealthUpdate(health: ServiceHealth): void {
		const parts: string[] = [];

		if (!health.inference.ok) {
			parts.push('⚠ Inference engine went offline');
		}
		if (!health.embeddings.ok) {
			parts.push('⚠ Embedding server went offline');
		}
		if (!health.mesh.ok) {
			parts.push('⚠ Mesh networking went offline');
		}

		// Only show health updates when something is degraded
		// or when mesh peers change
		if (parts.length > 0) {
			this.postEntry('⚠', parts.join('\n'));
		} else if (health.mesh.peers && health.mesh.peers > 0) {
			this.postEntry('●', `Mesh: ${health.mesh.peers} peer${health.mesh.peers !== 1 ? 's' : ''} connected`);
		}
	}

	private renderFileChanges(changes: FileChangeEvent[]): void {
		if (changes.length === 0) { return; }

		const added = changes.filter(c => c.type === 'added').length;
		const modified = changes.filter(c => c.type === 'modified').length;

		const parts: string[] = [];
		if (added > 0) {
			parts.push(`${added} new file${added !== 1 ? 's' : ''} detected`);
		}
		if (modified > 0) {
			parts.push(`${modified} file${modified !== 1 ? 's' : ''} modified`);
		}

		this.postEntry('→', parts.join(', '));
	}

	// ====================================================================
	// USER INPUT → CHAT PARTICIPANT
	// ====================================================================

	private async handleUserInput(text: string): Promise<void> {
		// Show user message in the feed
		this.postMessage({
			type: 'add-entry',
			entry: {
				icon: '',
				text,
				time: new Date().toLocaleTimeString(),
				isUser: true
			}
		});

		// Route to the @tarx chat participant via the chat panel
		try {
			await vscode.commands.executeCommand(
				'workbench.action.chat.open',
				{ query: `@tarx ${text}` }
			);
		} catch (e) {
			this.postEntry('⚠', `Failed to send: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	// ====================================================================
	// WEBVIEW COMMUNICATION
	// ====================================================================

	private postEntry(icon: string, text: string): void {
		this.postMessage({
			type: 'add-entry',
			entry: {
				icon,
				text,
				time: new Date().toLocaleTimeString()
			}
		});
	}

	private postMessage(msg: unknown): void {
		if (!this.webviewReady) {
			// Queue until the webview signals ready
			this.pendingMessages.push(msg);
			console.log('[TARX-TT] Queued message (webview not ready yet)');
			return;
		}
		try {
			this.panel.webview.postMessage(msg);
		} catch {
			// Panel may have been disposed
		}
	}
}

// ============================================================================
// WEBVIEW HTML
// ============================================================================

function getWebviewHtml(): string {
	return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TARX Thinking</title>
<style>
	* {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}

	body {
		font-family: var(--vscode-font-family);
		font-size: var(--vscode-font-size);
		color: var(--vscode-editor-foreground);
		background: var(--vscode-editor-background);
		height: 100vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* ---- Feed ---- */
	.thinking-feed {
		flex: 1;
		overflow-y: auto;
		padding: 16px 20px;
		scroll-behavior: smooth;
	}

	/* ---- Entry ---- */
	.entry {
		display: flex;
		gap: 8px;
		margin-bottom: 12px;
		animation: fadeIn 0.3s ease;
	}

	@keyframes fadeIn {
		from { opacity: 0; transform: translateY(4px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.entry-icon {
		flex-shrink: 0;
		width: 20px;
		text-align: center;
		line-height: 1.5;
		font-size: 13px;
	}

	.entry-content {
		flex: 1;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.entry-time {
		flex-shrink: 0;
		font-size: 11px;
		color: var(--vscode-descriptionForeground);
		line-height: 1.5;
		min-width: 65px;
		text-align: right;
	}

	/* ---- User messages ---- */
	.entry.user-entry {
		justify-content: flex-end;
	}

	.entry.user-entry .entry-content {
		background: var(--vscode-inputOption-activeBackground, rgba(0, 122, 204, 0.15));
		border: 1px solid var(--vscode-inputOption-activeBorder, rgba(0, 122, 204, 0.3));
		border-radius: 8px;
		padding: 6px 12px;
		max-width: 80%;
	}

	/* ---- Section headers ---- */
	.entry-content strong {
		color: var(--vscode-textLink-foreground);
	}

	/* ---- Status icons ---- */
	.icon-ok { color: var(--vscode-testing-iconPassed, #4ec9b0); }
	.icon-warn { color: var(--vscode-editorWarning-foreground, #cca700); }
	.icon-error { color: var(--vscode-editorError-foreground, #f14c4c); }
	.icon-event { color: var(--vscode-textLink-foreground, #3794ff); }
	.icon-action { color: var(--vscode-descriptionForeground); }
	.icon-working { color: var(--vscode-progressBar-background, #0e70c0); }

	/* ---- Separator ---- */
	.separator {
		text-align: center;
		color: var(--vscode-descriptionForeground);
		font-size: 11px;
		margin: 16px 0;
		opacity: 0.6;
	}

	/* ---- Collapsible ---- */
	details {
		margin-top: 4px;
	}

	details summary {
		cursor: pointer;
		color: var(--vscode-descriptionForeground);
		font-size: 12px;
	}

	details summary:hover {
		color: var(--vscode-textLink-foreground);
	}

	.detail-content {
		padding: 4px 0 4px 16px;
		font-size: 12px;
		color: var(--vscode-descriptionForeground);
	}

	/* ---- Input area ---- */
	.input-area {
		flex-shrink: 0;
		display: flex;
		gap: 8px;
		padding: 12px 20px;
		border-top: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border, rgba(128,128,128,0.2)));
		background: var(--vscode-editor-background);
	}

	.input-area input {
		flex: 1;
		padding: 8px 12px;
		border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
		border-radius: 4px;
		background: var(--vscode-input-background);
		color: var(--vscode-input-foreground);
		font-family: var(--vscode-font-family);
		font-size: var(--vscode-font-size);
		outline: none;
	}

	.input-area input:focus {
		border-color: var(--vscode-focusBorder);
	}

	.input-area input::placeholder {
		color: var(--vscode-input-placeholderForeground);
	}

	.input-area button {
		padding: 8px 16px;
		border: none;
		border-radius: 4px;
		background: var(--vscode-button-background);
		color: var(--vscode-button-foreground);
		font-family: var(--vscode-font-family);
		font-size: var(--vscode-font-size);
		cursor: pointer;
	}

	.input-area button:hover {
		background: var(--vscode-button-hoverBackground);
	}

	/* ---- Scrollbar ---- */
	.thinking-feed::-webkit-scrollbar {
		width: 8px;
	}

	.thinking-feed::-webkit-scrollbar-thumb {
		background: var(--vscode-scrollbarSlider-background);
		border-radius: 4px;
	}

	.thinking-feed::-webkit-scrollbar-thumb:hover {
		background: var(--vscode-scrollbarSlider-hoverBackground);
	}
</style>
</head>
<body>
	<div class="thinking-feed" id="feed"></div>
	<div class="input-area">
		<input type="text" id="userInput" placeholder="Ask TARX anything..." />
		<button id="sendBtn">Send</button>
	</div>

	<script>
		const vscode = acquireVsCodeApi();
		const feed = document.getElementById('feed');
		const userInput = document.getElementById('userInput');
		const sendBtn = document.getElementById('sendBtn');

		// Icon class mapping
		function iconClass(icon) {
			if (icon === '\\u2713') return 'icon-ok';
			if (icon === '\\u26A0') return 'icon-warn';
			if (icon === '\\u2717') return 'icon-error';
			if (icon === '\\u25CF') return 'icon-event';
			if (icon === '\\u2192' || icon === '\\u2191' || icon === '\\u2193') return 'icon-action';
			if (icon === '\\u25D0') return 'icon-working';
			return '';
		}

		// Escape HTML
		function esc(str) {
			const d = document.createElement('div');
			d.textContent = str;
			return d.innerHTML;
		}

		// Simple markdown-like formatting
		function formatText(text) {
			return esc(text)
				.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
				.replace(/\\n/g, '<br>');
		}

		// Add an entry to the feed
		function addEntry(entry) {
			const div = document.createElement('div');
			div.className = 'entry' + (entry.isUser ? ' user-entry' : '');

			if (entry.isUser) {
				div.innerHTML =
					'<div class="entry-content">' + formatText(entry.text) + '</div>' +
					'<div class="entry-time">' + esc(entry.time) + '</div>';
			} else {
				div.innerHTML =
					'<div class="entry-icon ' + iconClass(entry.icon) + '">' + esc(entry.icon) + '</div>' +
					'<div class="entry-content">' + formatText(entry.text) + '</div>' +
					'<div class="entry-time">' + esc(entry.time) + '</div>';
			}

			feed.appendChild(div);
			feed.scrollTop = feed.scrollHeight;
		}

		// Handle messages from extension
		window.addEventListener('message', (event) => {
			const msg = event.data;
			if (msg.type === 'add-entry') {
				addEntry(msg.entry);
			}
		});

		// Send user input
		function sendInput() {
			const text = userInput.value.trim();
			if (!text) return;
			vscode.postMessage({ type: 'user-input', text: text });
			userInput.value = '';
			userInput.focus();
		}

		sendBtn.addEventListener('click', sendInput);
		userInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				sendInput();
			}
		});

		// Signal the extension that webview JS is loaded and ready
		vscode.postMessage({ type: 'ready' });

		// Focus input on load
		userInput.focus();
	</script>
</body>
</html>`;
}
