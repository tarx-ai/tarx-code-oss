/*---------------------------------------------------------------------------------------------
 *  TARX Voice Transcript Panel
 *
 *  A dedicated webview panel that displays:
 *  - Live streaming transcription from Moshi
 *  - Clickable utterance blocks with context actions
 *  - Moshi-generated diagrams and artifacts
 *
 *  Auto-opens on voice start, lives beside the chat panel
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

interface Utterance {
	id: string;
	speaker: 'user' | 'moshi';
	text: string;
	timestamp: number;
	isFinal: boolean;
	artifacts?: Artifact[];
}

interface Artifact {
	type: 'code' | 'mermaid' | 'image' | 'markdown';
	content: string;
	language?: string;
}

/**
 * Manages the Voice Transcript webview panel
 */
export class VoiceTranscriptPanel {
	public static currentPanel: VoiceTranscriptPanel | undefined;
	public static readonly viewType = 'tarx.voiceTranscript';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _disposables: vscode.Disposable[] = [];
	private _utterances: Utterance[] = [];
	private _currentUtterance: Utterance | null = null;
	private _isListening: boolean = false;
	private _disposed: boolean = false;

	public static createOrShow(extensionUri: vscode.Uri): VoiceTranscriptPanel {
		const column = vscode.ViewColumn.Beside;

		// If we already have a panel and it's not disposed, show it
		if (VoiceTranscriptPanel.currentPanel && !VoiceTranscriptPanel.currentPanel._disposed) {
			try {
				VoiceTranscriptPanel.currentPanel._panel.reveal(column);
				return VoiceTranscriptPanel.currentPanel;
			} catch (e) {
				// Panel was disposed, clear the reference
				console.warn('[TARX Voice] Panel reveal failed, recreating:', e);
				VoiceTranscriptPanel.currentPanel = undefined;
			}
		}

		// Create a new panel
		const panel = vscode.window.createWebviewPanel(
			VoiceTranscriptPanel.viewType,
			'Voice Transcript',
			column,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [extensionUri]
			}
		);

		VoiceTranscriptPanel.currentPanel = new VoiceTranscriptPanel(panel, extensionUri);
		return VoiceTranscriptPanel.currentPanel;
	}

	public static hide(): void {
		if (VoiceTranscriptPanel.currentPanel) {
			VoiceTranscriptPanel.currentPanel._panel.dispose();
		}
	}

	public static toggle(extensionUri: vscode.Uri): void {
		if (VoiceTranscriptPanel.currentPanel) {
			VoiceTranscriptPanel.hide();
		} else {
			VoiceTranscriptPanel.createOrShow(extensionUri);
		}
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;
		this._extensionUri = extensionUri;

		// Set initial HTML content
		this._updateWebview();

		// Handle messages from webview
		this._panel.webview.onDidReceiveMessage(
			message => this._handleWebviewMessage(message),
			null,
			this._disposables
		);

		// Handle panel disposal
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
	}

	/**
	 * Set listening state (shows/hides listening indicator)
	 */
	public setListening(isListening: boolean): void {
		this._isListening = isListening;
		this._postMessage({ type: 'setListening', isListening });

		if (isListening && !this._currentUtterance) {
			// Start a new user utterance
			this._currentUtterance = {
				id: `u-${Date.now()}`,
				speaker: 'user',
				text: '',
				timestamp: Date.now(),
				isFinal: false
			};
		}
	}

	/**
	 * Add partial transcript (streaming)
	 */
	public addPartialTranscript(text: string, speaker: 'user' | 'moshi' = 'user'): void {
		if (this._currentUtterance && this._currentUtterance.speaker === speaker) {
			this._currentUtterance.text = text;
		} else {
			// Switch speaker or start new
			if (this._currentUtterance) {
				this._finalizeCurrentUtterance();
			}
			this._currentUtterance = {
				id: `u-${Date.now()}`,
				speaker,
				text,
				timestamp: Date.now(),
				isFinal: false
			};
		}
		this._postMessage({
			type: 'partialTranscript',
			utterance: this._currentUtterance
		});
	}

	/**
	 * Finalize current utterance
	 */
	public finalizeTranscript(text: string, speaker: 'user' | 'moshi' = 'user'): void {
		if (this._currentUtterance) {
			this._currentUtterance.text = text;
			this._currentUtterance.isFinal = true;
			this._utterances.push(this._currentUtterance);
			this._postMessage({
				type: 'finalTranscript',
				utterance: this._currentUtterance
			});
			this._currentUtterance = null;
		} else {
			// Create and finalize immediately
			const utterance: Utterance = {
				id: `u-${Date.now()}`,
				speaker,
				text,
				timestamp: Date.now(),
				isFinal: true
			};
			this._utterances.push(utterance);
			this._postMessage({
				type: 'finalTranscript',
				utterance
			});
		}
	}

	private _finalizeCurrentUtterance(): void {
		if (this._currentUtterance && this._currentUtterance.text.trim()) {
			this._currentUtterance.isFinal = true;
			this._utterances.push(this._currentUtterance);
			this._postMessage({
				type: 'finalTranscript',
				utterance: this._currentUtterance
			});
		}
		this._currentUtterance = null;
	}

	/**
	 * Add an artifact (diagram, code, etc.)
	 */
	public addArtifact(artifact: Artifact): void {
		const lastUtterance = this._utterances[this._utterances.length - 1];
		if (lastUtterance) {
			lastUtterance.artifacts = lastUtterance.artifacts || [];
			lastUtterance.artifacts.push(artifact);
			this._postMessage({
				type: 'artifact',
				utteranceId: lastUtterance.id,
				artifact
			});
		}
	}

	/**
	 * Clear all transcripts
	 */
	public clear(): void {
		this._utterances = [];
		this._currentUtterance = null;
		this._postMessage({ type: 'clear' });
	}

	/**
	 * Show "thinking" indicator
	 */
	public showThinking(): void {
		this._postMessage({ type: 'thinking', show: true });
	}

	/**
	 * Hide "thinking" indicator
	 */
	public hideThinking(): void {
		this._postMessage({ type: 'thinking', show: false });
	}

	private _postMessage(message: any): void {
		// Guard against posting to disposed webview
		if (this._disposed) {
			console.warn('[TARX Voice] Webview disposed, skipping postMessage:', message.type);
			return;
		}
		try {
			this._panel.webview.postMessage(message);
		} catch (e) {
			console.warn('[TARX Voice] Failed to post message to webview:', e);
			this._disposed = true;
		}
	}

	private _handleWebviewMessage(message: any): void {
		switch (message.type) {
			case 'utteranceClick':
				this._handleUtteranceClick(message.utteranceId, message.action);
				break;
			case 'ready':
				// Webview is ready, send current state
				this._sendCurrentState();
				break;
		}
	}

	private _handleUtteranceClick(utteranceId: string, action: string): void {
		const utterance = this._utterances.find(u => u.id === utteranceId);
		if (!utterance) return;

		const quotedText = `"${utterance.text}"`;

		switch (action) {
			case 'explain':
				vscode.commands.executeCommand('workbench.action.chat.open', {
					query: `@tarx /explain ${quotedText}`
				});
				break;
			case 'fix':
				vscode.commands.executeCommand('workbench.action.chat.open', {
					query: `@tarx /fix ${quotedText}`
				});
				break;
			case 'diagram':
				vscode.commands.executeCommand('workbench.action.chat.open', {
					query: `@tarx Generate a diagram for: ${quotedText}`
				});
				break;
			case 'refactor':
				vscode.commands.executeCommand('workbench.action.chat.open', {
					query: `@tarx /refactor ${quotedText}`
				});
				break;
			case 'followup':
				vscode.commands.executeCommand('workbench.action.chat.open', {
					query: `@tarx Tell me more about: ${quotedText}`
				});
				break;
			case 'copy':
				vscode.env.clipboard.writeText(utterance.text);
				vscode.window.showInformationMessage('Copied to clipboard');
				break;
		}
	}

	private _sendCurrentState(): void {
		this._postMessage({
			type: 'state',
			utterances: this._utterances,
			isListening: this._isListening,
			currentUtterance: this._currentUtterance
		});
	}

	private _updateWebview(): void {
		this._panel.webview.html = this._getHtmlForWebview();
	}

	private _getHtmlForWebview(): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Voice</title>
	<style>
		/* Match VS Code chat panel styling */
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		body {
			font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, sans-serif);
			font-size: var(--vscode-font-size, 13px);
			line-height: 1.4;
			background: var(--vscode-editor-background);
			color: var(--vscode-editor-foreground);
			padding: 0;
			overflow-x: hidden;
		}

		.recording-dot {
			width: 6px;
			height: 6px;
			background: var(--vscode-testing-iconFailed, #f14c4c);
			border-radius: 50%;
			animation: pulse-dot 1.5s ease-in-out infinite;
		}

		@keyframes pulse-dot {
			0%, 100% { opacity: 1; transform: scale(1); }
			50% { opacity: 0.5; transform: scale(0.9); }
		}

		.listening-indicator {
			display: none;
			align-items: center;
			gap: 8px;
			padding: 8px 12px;
			margin: 8px 12px;
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border, transparent);
			border-radius: 4px;
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
		}

		.listening-indicator.active {
			display: flex;
		}

		.transcript-container {
			display: flex;
			flex-direction: column;
			gap: 0;
			height: calc(100vh - 16px);
			overflow-y: auto;
			padding: 8px 0;
		}

		/* Chat message styling - matches VS Code chat */
		.utterance {
			padding: 8px 16px;
			position: relative;
			border-left: 2px solid transparent;
		}

		.utterance:hover {
			background: var(--vscode-list-hoverBackground);
		}

		.utterance.user {
			border-left-color: var(--vscode-charts-blue, #3794ff);
		}

		.utterance.moshi {
			border-left-color: var(--vscode-charts-green, #89d185);
			background: var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.04));
		}

		.utterance.current {
			background: var(--vscode-editor-selectionBackground);
		}

		.utterance-header {
			display: flex;
			align-items: center;
			gap: 8px;
			margin-bottom: 4px;
		}

		.speaker-name {
			font-weight: 600;
			font-size: 12px;
		}

		.utterance.user .speaker-name {
			color: var(--vscode-charts-blue, #3794ff);
		}

		.utterance.moshi .speaker-name {
			color: var(--vscode-charts-green, #89d185);
		}

		.timestamp {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			opacity: 0.7;
		}

		.utterance-text {
			font-size: var(--vscode-font-size, 13px);
			line-height: 1.5;
			white-space: pre-wrap;
			word-wrap: break-word;
		}

		.utterance-text.partial {
			opacity: 0.6;
		}

		/* Thinking indicator */
		.thinking {
			display: none;
			padding: 8px 16px;
			border-left: 2px solid var(--vscode-charts-green, #89d185);
			background: var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.04));
		}

		.thinking.active {
			display: flex;
			align-items: center;
			gap: 8px;
		}

		.thinking-label {
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
		}

		.thinking-dots {
			display: flex;
			gap: 3px;
		}

		.thinking-dots span {
			width: 4px;
			height: 4px;
			background: var(--vscode-descriptionForeground);
			border-radius: 50%;
			animation: bounce 1.2s infinite;
		}

		.thinking-dots span:nth-child(2) { animation-delay: 0.15s; }
		.thinking-dots span:nth-child(3) { animation-delay: 0.3s; }

		@keyframes bounce {
			0%, 60%, 100% { transform: translateY(0); }
			30% { transform: translateY(-4px); }
		}

		/* Context menu on hover */
		.context-menu {
			display: none;
			position: absolute;
			right: 12px;
			top: 8px;
			background: var(--vscode-menu-background);
			border: 1px solid var(--vscode-menu-border, var(--vscode-widget-border));
			border-radius: 4px;
			padding: 4px;
			z-index: 100;
			box-shadow: 0 2px 8px var(--vscode-widget-shadow, rgba(0,0,0,0.16));
		}

		.utterance:hover .context-menu {
			display: flex;
			gap: 2px;
		}

		.context-btn {
			padding: 4px 8px;
			background: transparent;
			border: none;
			color: var(--vscode-menu-foreground);
			cursor: pointer;
			border-radius: 3px;
			font-size: 11px;
			font-family: var(--vscode-font-family);
			white-space: nowrap;
		}

		.context-btn:hover {
			background: var(--vscode-menu-selectionBackground);
			color: var(--vscode-menu-selectionForeground);
		}

		/* Artifacts */
		.artifact {
			margin-top: 8px;
			padding: 8px 12px;
			background: var(--vscode-textCodeBlock-background);
			border-radius: 4px;
			overflow-x: auto;
		}

		.artifact pre {
			margin: 0;
			font-family: var(--vscode-editor-font-family, 'SF Mono', Monaco, monospace);
			font-size: 12px;
			line-height: 1.4;
		}

		/* Empty state */
		.empty-state {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			height: 100%;
			padding: 40px 20px;
			color: var(--vscode-descriptionForeground);
			font-size: 13px;
			text-align: center;
		}
	</style>
</head>
<body>
	<div class="listening-indicator" id="listeningIndicator">
		<span class="recording-dot"></span>
		<span>Listening</span>
	</div>

	<div class="transcript-container" id="transcriptContainer">
		<div class="empty-state" id="emptyState">
			<div>Speak to start a conversation</div>
		</div>
	</div>

	<div class="thinking" id="thinking">
		<span class="thinking-label">Moshi</span>
		<div class="thinking-dots">
			<span></span>
			<span></span>
			<span></span>
		</div>
	</div>

	<script>
		const vscode = acquireVsCodeApi();
		const container = document.getElementById('transcriptContainer');
		const emptyState = document.getElementById('emptyState');
		const listeningIndicator = document.getElementById('listeningIndicator');
		const thinkingIndicator = document.getElementById('thinking');

		let utteranceElements = {};

		// Tell extension we're ready
		vscode.postMessage({ type: 'ready' });

		window.addEventListener('message', event => {
			const message = event.data;
			switch (message.type) {
				case 'setListening':
					listeningIndicator.classList.toggle('active', message.isListening);
					break;

				case 'partialTranscript':
					updateUtterance(message.utterance, false);
					scrollToBottom();
					break;

				case 'finalTranscript':
					updateUtterance(message.utterance, true);
					scrollToBottom();
					break;

				case 'thinking':
					thinkingIndicator.classList.toggle('active', message.show);
					break;

				case 'artifact':
					addArtifact(message.utteranceId, message.artifact);
					break;

				case 'clear':
					container.innerHTML = '';
					container.appendChild(emptyState);
					utteranceElements = {};
					break;

				case 'state':
					// Restore state
					message.utterances.forEach(u => updateUtterance(u, u.isFinal));
					if (message.currentUtterance) {
						updateUtterance(message.currentUtterance, false);
					}
					listeningIndicator.classList.toggle('active', message.isListening);
					break;
			}
		});

		function updateUtterance(utterance, isFinal) {
			emptyState.style.display = 'none';

			let el = utteranceElements[utterance.id];
			if (!el) {
				el = createUtteranceElement(utterance);
				utteranceElements[utterance.id] = el;
				container.appendChild(el);
			}

			// Update content
			const textEl = el.querySelector('.utterance-text');
			textEl.textContent = utterance.text;
			textEl.classList.toggle('partial', !isFinal);
			el.classList.toggle('current', !isFinal);
		}

		function createUtteranceElement(utterance) {
			const el = document.createElement('div');
			el.className = 'utterance ' + utterance.speaker;
			el.dataset.id = utterance.id;

			const label = utterance.speaker === 'user' ? 'You' : 'Moshi';
			const time = new Date(utterance.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

			el.innerHTML = \`
				<div class="utterance-header">
					<span class="speaker-name">\${label}</span>
					<span class="timestamp">\${time}</span>
				</div>
				<div class="utterance-text">\${utterance.text}</div>
				<div class="context-menu">
					<button class="context-btn" data-action="copy">Copy</button>
					<button class="context-btn" data-action="followup">Ask</button>
				</div>
			\`;

			// Add click handlers
			el.querySelectorAll('.context-btn').forEach(btn => {
				btn.addEventListener('click', (e) => {
					e.stopPropagation();
					vscode.postMessage({
						type: 'utteranceClick',
						utteranceId: utterance.id,
						action: btn.dataset.action
					});
				});
			});

			return el;
		}

		function addArtifact(utteranceId, artifact) {
			const el = utteranceElements[utteranceId];
			if (!el) return;

			const artifactEl = document.createElement('div');
			artifactEl.className = 'artifact';

			if (artifact.type === 'code') {
				artifactEl.innerHTML = '<pre><code>' + escapeHtml(artifact.content) + '</code></pre>';
			} else if (artifact.type === 'mermaid') {
				artifactEl.innerHTML = '<pre class="mermaid">' + escapeHtml(artifact.content) + '</pre>';
			} else if (artifact.type === 'image') {
				const img = document.createElement('img');
				try { new URL(artifact.content); img.src = artifact.content; } catch { img.alt = 'Invalid image URL'; }
				img.style.maxWidth = '100%';
				artifactEl.appendChild(img);
			} else {
				artifactEl.textContent = artifact.content;
			}

			el.appendChild(artifactEl);
		}

		function scrollToBottom() {
			container.scrollTop = container.scrollHeight;
		}

		function escapeHtml(text) {
			const div = document.createElement('div');
			div.textContent = text;
			return div.innerHTML;
		}
	</script>
</body>
</html>`;
	}

	public dispose(): void {
		// Set disposed flag first to prevent any further postMessage calls
		this._disposed = true;
		VoiceTranscriptPanel.currentPanel = undefined;
		this._panel.dispose();
		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	/**
	 * Check if the panel is disposed
	 */
	public get isDisposed(): boolean {
		return this._disposed;
	}
}
