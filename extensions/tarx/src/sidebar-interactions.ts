/**
 * TARX Sidebar Interactions
 * Click handlers for history entries and file context injection
 *
 * @file extensions/tarx/src/sidebar-interactions.ts
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

// ========================================
// TYPES
// ========================================

export interface SessionTurn {
	id: string;
	sessionId: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: number;
	model?: string;
	tokenCount?: number;
}

export interface SessionData {
	id: string;
	title: string;
	updatedAt: number;
	spaceId?: string;
	model?: string;
	messageCount: number;
	turns: SessionTurn[];
}

export interface FileContextData {
	path: string;
	name: string;
	content: string;
	language: string;
	lineCount: number;
	selection?: {
		startLine: number;
		endLine: number;
		text: string;
	};
}

// ========================================
// DATABASE HELPERS
// ========================================

const DB_PATH = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');

/**
 * Sanitize a string value for SQL to prevent SQL injection
 * Escapes single quotes by doubling them
 */
function sanitizeSQL(value: string): string {
	if (!value) return '';
	return value.replace(/'/g, "''");
}

/**
 * Execute SQLite query and return JSON result
 * Uses stdin to pass SQL to avoid shell injection
 */
function queryDB<T>(sql: string): T[] {
	try {
		// Use stdin to pass SQL, avoiding shell injection via command arguments
		const result = execSync(`sqlite3 "${DB_PATH}" -json`, {
			input: sql,
			encoding: 'utf8',
			timeout: 5000
		});
		return JSON.parse(result || '[]');
	} catch (e) {
		console.error('[TARX] DB query failed:', e);
		return [];
	}
}

/**
 * Execute SQLite write command
 * Uses stdin to pass SQL to avoid shell injection
 */
function writeDB(sql: string): boolean {
	try {
		execSync(`sqlite3 "${DB_PATH}"`, {
			input: sql,
			encoding: 'utf8',
			timeout: 5000
		});
		return true;
	} catch (e) {
		console.error('[TARX] DB write failed:', e);
		return false;
	}
}

// ========================================
// HISTORY CLICK HANDLERS
// ========================================

/**
 * Load session data with all turns from database
 */
export async function loadSession(sessionId: string): Promise<SessionData | null> {
	try {
		// Get session metadata
		const sessions = queryDB<{
			id: string;
			title: string;
			updated_at: number;
			space_id: string;
			model: string;
			message_count: number;
		}>(`SELECT id, title, updated_at, space_id, model, message_count FROM sessions WHERE id = '${sanitizeSQL(sessionId)}'`);

		if (sessions.length === 0) {
			console.log(`[TARX] Session ${sessionId} not found`);
			return null;
		}

		const session = sessions[0];

		// Get all turns for this session
		// Note: conversation_turns uses conversation_id (not session_id) and created_at (not timestamp)
		const turns = queryDB<{
			id: string;
			conversation_id: string;
			role: string;
			content: string;
			created_at: number;
		}>(`SELECT id, conversation_id, role, content, created_at FROM conversation_turns WHERE conversation_id = '${sanitizeSQL(sessionId)}' ORDER BY created_at ASC`);

		return {
			id: session.id,
			title: session.title,
			updatedAt: session.updated_at,
			spaceId: session.space_id,
			model: session.model,
			messageCount: session.message_count,
			turns: turns.map(t => ({
				id: t.id,
				sessionId: t.conversation_id,
				role: t.role as 'user' | 'assistant' | 'system',
				content: t.content,
				timestamp: t.created_at,
				model: undefined,
				tokenCount: 0
			}))
		};
	} catch (e) {
		console.error('[TARX] Failed to load session:', e);
		return null;
	}
}

/**
 * Set session as active in database
 */
export function setActiveSession(sessionId: string): boolean {
	const escapedId = sanitizeSQL(sessionId);
	const sql = `
		UPDATE sessions SET is_active = 0;
		UPDATE sessions SET is_active = 1 WHERE id = '${escapedId}';
	`;
	return writeDB(sql);
}

/**
 * Handle history item click - loads and displays session
 */
export async function onHistoryItemClick(sessionId: string): Promise<void> {
	console.log(`[TARX] Opening session: ${sessionId}`);

	// Show loading indicator
	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: 'Loading conversation...',
			cancellable: false
		},
		async () => {
			// Load session data
			const session = await loadSession(sessionId);

			if (!session) {
				vscode.window.showErrorMessage('Failed to load conversation');
				return;
			}

			// Set as active session
			setActiveSession(sessionId);

			// Store session in workspace state for chat participant
			await vscode.commands.executeCommand('tarx.setActiveSession', {
				id: session.id,
				title: session.title,
				turns: session.turns
			});

			// Open chat panel
			await vscode.commands.executeCommand('workbench.action.chat.open');

			// Inject session context into chat
			if (session.turns.length > 0) {
				// Build context message with conversation history
				const contextLines = [
					`Loaded conversation: "${session.title}"`,
					`${session.turns.length} messages in history`,
					'',
					'Recent messages:'
				];

				// Add last 3 turns as preview
				const recentTurns = session.turns.slice(-3);
				for (const turn of recentTurns) {
					const role = turn.role === 'user' ? 'User' : 'Assistant';
					const preview = turn.content.slice(0, 100).replace(/\n/g, ' ');
					contextLines.push(`${role}: ${preview}...`);
				}

				contextLines.push('');
				contextLines.push('Continue the conversation below:');

				const contextMessage = contextLines.join('\n');

				// Inject as system message via chat context command
				try {
					await vscode.commands.executeCommand('tarx.injectSessionContext', contextMessage);
				} catch (e) {
					// Fallback: show as info message
					vscode.window.showInformationMessage(
						`Loaded "${session.title}" (${session.turns.length} messages)`
					);
				}
			}

			// Notify sidebar to update active state
			await vscode.commands.executeCommand('tarx.history.refresh');

			// Log to god mode
			logInteraction('SESSION_OPENED', sessionId, session.title);
		}
	);
}

/**
 * Create new session and open chat
 */
export async function createNewSession(title?: string): Promise<string | null> {
	const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	const sessionTitle = title || 'New Conversation';
	const now = Date.now();
	const escapedId = sanitizeSQL(sessionId);
	const escapedTitle = sanitizeSQL(sessionTitle);

	const sql = `
		INSERT INTO sessions (id, title, updated_at, space_id, model, message_count, deleted_at)
		VALUES ('${escapedId}', '${escapedTitle}', ${now}, 'default', NULL, 0, NULL);
		UPDATE sessions SET is_active = 0 WHERE id != '${escapedId}';
		UPDATE sessions SET is_active = 1 WHERE id = '${escapedId}';
	`;

	if (writeDB(sql)) {
		await vscode.commands.executeCommand('tarx.setActiveSession', {
			id: sessionId,
			title: sessionTitle,
			turns: []
		});
		await vscode.commands.executeCommand('tarx.history.refresh');
		return sessionId;
	}

	return null;
}

// ========================================
// FILE CONTEXT HANDLERS
// ========================================

/**
 * Get file content with language detection
 */
export async function getFileContext(filePath: string): Promise<FileContextData | null> {
	try {
		const uri = vscode.Uri.file(filePath);
		const stat = await vscode.workspace.fs.stat(uri);

		// Skip large files (> 1MB)
		if (stat.size > 1024 * 1024) {
			vscode.window.showWarningMessage('File too large to add to context');
			return null;
		}

		const content = await vscode.workspace.fs.readFile(uri);
		const text = new TextDecoder().decode(content);
		const lines = text.split('\n');

		// Detect language from extension
		const ext = path.extname(filePath).toLowerCase();
		const languageMap: Record<string, string> = {
			'.ts': 'typescript',
			'.tsx': 'typescriptreact',
			'.js': 'javascript',
			'.jsx': 'javascriptreact',
			'.py': 'python',
			'.rs': 'rust',
			'.go': 'go',
			'.java': 'java',
			'.cpp': 'cpp',
			'.c': 'c',
			'.h': 'c',
			'.hpp': 'cpp',
			'.css': 'css',
			'.scss': 'scss',
			'.html': 'html',
			'.json': 'json',
			'.yaml': 'yaml',
			'.yml': 'yaml',
			'.md': 'markdown',
			'.sql': 'sql',
			'.sh': 'shellscript',
			'.bash': 'shellscript',
			'.zsh': 'shellscript',
		};

		return {
			path: filePath,
			name: path.basename(filePath),
			content: text,
			language: languageMap[ext] || 'plaintext',
			lineCount: lines.length
		};
	} catch (e) {
		console.error('[TARX] Failed to get file context:', e);
		return null;
	}
}

/**
 * Get file context with current editor selection
 */
export async function getFileContextWithSelection(): Promise<FileContextData | null> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return null;
	}

	const document = editor.document;
	const selection = editor.selection;

	const fileContext = await getFileContext(document.uri.fsPath);
	if (!fileContext) {
		return null;
	}

	// Add selection if any
	if (!selection.isEmpty) {
		fileContext.selection = {
			startLine: selection.start.line + 1,
			endLine: selection.end.line + 1,
			text: document.getText(selection)
		};
	}

	return fileContext;
}

/**
 * Handle file item click - open preview or inject into chat
 */
export async function onFileItemClick(filePath: string, mode: 'preview' | 'inject' = 'preview'): Promise<void> {
	console.log(`[TARX] File clicked: ${filePath}, mode: ${mode}`);

	if (mode === 'preview') {
		// Open file in editor
		const uri = vscode.Uri.file(filePath);
		await vscode.window.showTextDocument(uri, {
			preview: true,
			preserveFocus: false
		});
	} else if (mode === 'inject') {
		// Inject file content into chat context
		await injectFileIntoChat(filePath);
	}

	logInteraction('FILE_CLICKED', filePath, mode);
}

/**
 * Inject file content into chat prompt
 */
export async function injectFileIntoChat(filePath: string): Promise<void> {
	const fileContext = await getFileContext(filePath);
	if (!fileContext) {
		vscode.window.showErrorMessage('Failed to read file');
		return;
	}

	// Store file context for chat participant
	await vscode.commands.executeCommand('tarx.addFileToContext', {
		path: fileContext.path,
		name: fileContext.name,
		content: fileContext.content,
		language: fileContext.language,
		lineCount: fileContext.lineCount
	});

	// Show confirmation
	vscode.window.showInformationMessage(
		`Added ${fileContext.name} to context (${fileContext.lineCount} lines)`,
		'Open Chat'
	).then(selection => {
		if (selection === 'Open Chat') {
			vscode.commands.executeCommand('workbench.action.chat.open');
		}
	});

	// Update sidebar to show file in context
	await vscode.commands.executeCommand('tarx.context.refresh');
}

/**
 * Inject current selection into chat
 */
export async function injectSelectionIntoChat(): Promise<void> {
	const fileContext = await getFileContextWithSelection();
	if (!fileContext || !fileContext.selection) {
		vscode.window.showWarningMessage('No text selected');
		return;
	}

	// Store selection context
	await vscode.commands.executeCommand('tarx.addSelectionToContext', {
		path: fileContext.path,
		name: fileContext.name,
		language: fileContext.language,
		selection: fileContext.selection
	});

	const lineRange = `${fileContext.selection.startLine}-${fileContext.selection.endLine}`;
	vscode.window.showInformationMessage(
		`Added selection from ${fileContext.name}:${lineRange} to context`,
		'Open Chat'
	).then(selection => {
		if (selection === 'Open Chat') {
			vscode.commands.executeCommand('workbench.action.chat.open');
		}
	});

	await vscode.commands.executeCommand('tarx.context.refresh');
}

/**
 * Format file context as markdown for chat
 */
export function formatFileContextForChat(fileContext: FileContextData): string {
	let result = `\n\`\`\`${fileContext.language}:${fileContext.path}\n`;

	if (fileContext.selection) {
		result += `// Lines ${fileContext.selection.startLine}-${fileContext.selection.endLine}\n`;
		result += fileContext.selection.text;
	} else {
		result += fileContext.content;
	}

	result += '\n```\n';
	return result;
}

// ========================================
// CONTEXT MENU HANDLERS
// ========================================

/**
 * Show context menu for history item
 */
export async function showHistoryContextMenu(sessionId: string): Promise<void> {
	const items = [
		{ label: '$(comment-discussion) Open Conversation', action: 'open' },
		{ label: '$(copy) Copy Session ID', action: 'copy' },
		{ label: '$(export) Export as Markdown', action: 'export' },
		{ label: '$(trash) Delete', action: 'delete' }
	];

	const selected = await vscode.window.showQuickPick(items, {
		title: 'Session Actions',
		placeHolder: 'Choose an action'
	});

	if (!selected) return;

	switch (selected.action) {
		case 'open':
			await onHistoryItemClick(sessionId);
			break;
		case 'copy':
			await vscode.env.clipboard.writeText(sessionId);
			vscode.window.showInformationMessage('Session ID copied');
			break;
		case 'export':
			await exportSessionAsMarkdown(sessionId);
			break;
		case 'delete':
			await deleteSession(sessionId);
			break;
	}
}

/**
 * Show context menu for file item
 */
export async function showFileContextMenu(filePath: string): Promise<void> {
	const items = [
		{ label: '$(eye) Preview', action: 'preview' },
		{ label: '$(add) Add to Chat Context', action: 'inject' },
		{ label: '$(copy) Copy Path', action: 'copyPath' },
		{ label: '$(symbol-file) Copy Content', action: 'copyContent' }
	];

	const selected = await vscode.window.showQuickPick(items, {
		title: path.basename(filePath),
		placeHolder: 'Choose an action'
	});

	if (!selected) return;

	switch (selected.action) {
		case 'preview':
			await onFileItemClick(filePath, 'preview');
			break;
		case 'inject':
			await onFileItemClick(filePath, 'inject');
			break;
		case 'copyPath':
			await vscode.env.clipboard.writeText(filePath);
			vscode.window.showInformationMessage('Path copied');
			break;
		case 'copyContent':
			const content = await getFileContext(filePath);
			if (content) {
				await vscode.env.clipboard.writeText(content.content);
				vscode.window.showInformationMessage('Content copied');
			}
			break;
	}
}

// ========================================
// SESSION MANAGEMENT
// ========================================

/**
 * Export session as markdown file
 */
export async function exportSessionAsMarkdown(sessionId: string): Promise<void> {
	const session = await loadSession(sessionId);
	if (!session) {
		vscode.window.showErrorMessage('Failed to load session');
		return;
	}

	let markdown = `# ${session.title}\n\n`;
	markdown += `**Session ID:** ${session.id}\n`;
	markdown += `**Messages:** ${session.messageCount}\n`;
	markdown += `**Last Updated:** ${new Date(session.updatedAt).toLocaleString()}\n\n`;
	markdown += `---\n\n`;

	for (const turn of session.turns) {
		const role = turn.role === 'user' ? '**You**' : '**TARX**';
		const time = new Date(turn.timestamp).toLocaleTimeString();
		markdown += `### ${role} (${time})\n\n`;
		markdown += `${turn.content}\n\n`;
	}

	// Save to file
	const uri = await vscode.window.showSaveDialog({
		defaultUri: vscode.Uri.file(path.join(os.homedir(), `${session.title.replace(/[^a-z0-9]/gi, '-')}.md`)),
		filters: { 'Markdown': ['md'] }
	});

	if (uri) {
		await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(markdown));
		vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
	}
}

/**
 * Delete session from database
 */
export async function deleteSession(sessionId: string): Promise<void> {
	const confirm = await vscode.window.showWarningMessage(
		'Delete this conversation? This cannot be undone.',
		{ modal: true },
		'Delete'
	);

	if (confirm !== 'Delete') return;

	// Use messages table for session data
	const escapedId = sanitizeSQL(sessionId);
	const sql = `
		UPDATE sessions SET deleted_at = ${Date.now()} WHERE id = '${escapedId}';
		DELETE FROM messages WHERE session_id = '${escapedId}';
	`;

	if (writeDB(sql)) {
		vscode.window.showInformationMessage('Conversation deleted');
		await vscode.commands.executeCommand('tarx.history.refresh');
	} else {
		vscode.window.showErrorMessage('Failed to delete conversation');
	}
}

// ========================================
// LOGGING
// ========================================

function logInteraction(action: string, target: string, detail?: string): void {
	try {
		const logPath = path.join(os.homedir(), 'TARX', 'tarx-god.log');
		const timestamp = new Date().toISOString();
		const message = `[${timestamp}] ${action}: ${target}${detail ? ` (${detail})` : ''}\n`;
		require('fs').appendFileSync(logPath, message);
	} catch (e) {
		// Silent fail
	}
}

// ========================================
// CONTEXT FILES TREE PROVIDER
// ========================================

/**
 * TreeDataProvider for showing injected files in sidebar
 */
export class ContextFilesProvider implements vscode.TreeDataProvider<ContextFileItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<ContextFileItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: ContextFileItem): vscode.TreeItem {
		return element;
	}

	async getChildren(): Promise<ContextFileItem[]> {
		const files = this.context.workspaceState.get<FileContextData[]>('tarx.fileContext', []);
		const selections = this.context.workspaceState.get<Array<FileContextData & { selection: NonNullable<FileContextData['selection']> }>>('tarx.selectionContext', []);

		const items: ContextFileItem[] = [];

		// Add files
		for (const file of files) {
			items.push(new ContextFileItem(
				file.name,
				`${file.lineCount} lines`,
				file.path,
				'contextFile',
				vscode.TreeItemCollapsibleState.None
			));
		}

		// Add selections
		for (const sel of selections) {
			const lineRange = `L${sel.selection.startLine}-${sel.selection.endLine}`;
			items.push(new ContextFileItem(
				`${sel.name}:${lineRange}`,
				`${sel.selection.endLine - sel.selection.startLine + 1} lines`,
				sel.path,
				'contextSelection',
				vscode.TreeItemCollapsibleState.None
			));
		}

		if (items.length === 0) {
			items.push(new ContextFileItem(
				'No files in context',
				'Right-click to add',
				'',
				'empty',
				vscode.TreeItemCollapsibleState.None
			));
		}

		return items;
	}
}

class ContextFileItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly description: string,
		public readonly filePath: string,
		public readonly itemType: 'contextFile' | 'contextSelection' | 'empty',
		public readonly collapsibleState: vscode.TreeItemCollapsibleState
	) {
		super(label, collapsibleState);

		this.contextValue = itemType;
		this.tooltip = filePath || 'Add files using right-click menu';

		if (itemType === 'contextFile') {
			this.iconPath = new vscode.ThemeIcon('file-code', new vscode.ThemeColor('charts.green'));
			this.command = {
				command: 'vscode.open',
				title: 'Open File',
				arguments: [vscode.Uri.file(filePath)]
			};
		} else if (itemType === 'contextSelection') {
			this.iconPath = new vscode.ThemeIcon('selection', new vscode.ThemeColor('charts.purple'));
			this.command = {
				command: 'vscode.open',
				title: 'Open File',
				arguments: [vscode.Uri.file(filePath)]
			};
		} else {
			this.iconPath = new vscode.ThemeIcon('info');
		}
	}
}

// ========================================
// HIVE LOG POLLING
// ========================================

let hiveLogInterval: NodeJS.Timeout | null = null;
let lastHiveLogSize = 0;

/**
 * Start polling the hive log every 30 seconds
 */
export function startHiveLogPolling(): void {
	if (hiveLogInterval) return;

	const fs = require('fs');
	const logPath = path.join(os.homedir(), 'TARX', 'sidebar-hive.log');

	// Initial check
	try {
		if (fs.existsSync(logPath)) {
			const stats = fs.statSync(logPath);
			lastHiveLogSize = stats.size;
		}
	} catch (e) { /* ignore */ }

	// Poll every 30 seconds
	hiveLogInterval = setInterval(() => {
		try {
			if (!fs.existsSync(logPath)) return;

			const stats = fs.statSync(logPath);
			if (stats.size > lastHiveLogSize) {
				// New content added - read the new lines
				const fd = fs.openSync(logPath, 'r');
				const buffer = Buffer.alloc(stats.size - lastHiveLogSize);
				fs.readSync(fd, buffer, 0, buffer.length, lastHiveLogSize);
				fs.closeSync(fd);

				const newContent = buffer.toString('utf8');
				console.log('[TARX Hive] New entries:', newContent.trim());

				lastHiveLogSize = stats.size;
			}
		} catch (e) {
			console.error('[TARX Hive] Polling error:', e);
		}
	}, 30000);

	console.log('[TARX] Hive log polling started (30s interval)');
}

/**
 * Stop polling the hive log
 */
export function stopHiveLogPolling(): void {
	if (hiveLogInterval) {
		clearInterval(hiveLogInterval);
		hiveLogInterval = null;
		console.log('[TARX] Hive log polling stopped');
	}
}

/**
 * Log to hive with [Slave 3] prefix
 */
export function logToHive(message: string): void {
	try {
		const fs = require('fs');
		const logPath = path.join(os.homedir(), 'TARX', 'sidebar-hive.log');
		const timestamp = new Date().toISOString();
		fs.appendFileSync(logPath, `[${timestamp}] [Slave 3] ${message}\n`);
	} catch (e) {
		console.error('[TARX] Failed to write to hive log:', e);
	}
}

// ========================================
// COMMAND REGISTRATION
// ========================================

let contextFilesProvider: ContextFilesProvider | null = null;

export function registerInteractionCommands(context: vscode.ExtensionContext): void {
	// Start hive log polling
	startHiveLogPolling();
	context.subscriptions.push({ dispose: () => stopHiveLogPolling() });

	// Register context files tree view
	contextFilesProvider = new ContextFilesProvider(context);
	const treeView = vscode.window.createTreeView('tarx.contextFiles', {
		treeDataProvider: contextFilesProvider,
		showCollapseAll: false
	});
	context.subscriptions.push(treeView);

	// Context refresh command
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.context.refresh', () => {
			contextFilesProvider?.refresh();
		})
	);

	// Remove file from context
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.context.removeFile', async (item: ContextFileItem) => {
			if (!item.filePath) return;

			if (item.itemType === 'contextFile') {
				const files = context.workspaceState.get<FileContextData[]>('tarx.fileContext', []);
				const updated = files.filter(f => f.path !== item.filePath);
				await context.workspaceState.update('tarx.fileContext', updated);
			} else if (item.itemType === 'contextSelection') {
				const selections = context.workspaceState.get<FileContextData[]>('tarx.selectionContext', []);
				const updated = selections.filter(s => s.path !== item.filePath);
				await context.workspaceState.update('tarx.selectionContext', updated);
			}

			contextFilesProvider?.refresh();
			vscode.window.showInformationMessage('Removed from context');
		})
	);
	// History commands
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.openSession', onHistoryItemClick)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.newSession', createNewSession)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.exportSession', exportSessionAsMarkdown)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.deleteSession', deleteSession)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.historyContextMenu', showHistoryContextMenu)
	);

	// File context commands
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.openFile', (filePath: string) => onFileItemClick(filePath, 'preview'))
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.injectFile', (filePath: string) => onFileItemClick(filePath, 'inject'))
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.injectSelection', injectSelectionIntoChat)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.fileContextMenu', showFileContextMenu)
	);

	// Active session management
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.setActiveSession', async (session: { id: string; title: string; turns: SessionTurn[] }) => {
			context.workspaceState.update('tarx.activeSession', session);
			console.log(`[TARX] Active session set: ${session.id}`);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.getActiveSession', () => {
			return context.workspaceState.get<{ id: string; title: string; turns: SessionTurn[] }>('tarx.activeSession');
		})
	);

	// File context management
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.addFileToContext', async (file: FileContextData) => {
			const files = context.workspaceState.get<FileContextData[]>('tarx.fileContext', []);
			// Avoid duplicates
			const existing = files.findIndex(f => f.path === file.path);
			if (existing >= 0) {
				files[existing] = file;
			} else {
				files.push(file);
			}
			await context.workspaceState.update('tarx.fileContext', files);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.getFileContext', () => {
			return context.workspaceState.get<FileContextData[]>('tarx.fileContext', []);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.clearFileContext', async () => {
			await context.workspaceState.update('tarx.fileContext', []);
			await context.workspaceState.update('tarx.selectionContext', []);
			await vscode.commands.executeCommand('tarx.context.refresh');
		})
	);

	// Selection context management
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.addSelectionToContext', async (data: {
			path: string;
			name: string;
			language: string;
			selection: { startLine: number; endLine: number; text: string };
		}) => {
			const selections = context.workspaceState.get<Array<FileContextData & { selection: NonNullable<FileContextData['selection']> }>>('tarx.selectionContext', []);

			// Create unique key for this selection
			const key = `${data.path}:${data.selection.startLine}-${data.selection.endLine}`;
			const existing = selections.findIndex(s =>
				s.path === data.path &&
				s.selection?.startLine === data.selection.startLine &&
				s.selection?.endLine === data.selection.endLine
			);

			const entry = {
				path: data.path,
				name: data.name,
				content: data.selection.text,
				language: data.language,
				lineCount: data.selection.endLine - data.selection.startLine + 1,
				selection: data.selection
			};

			if (existing >= 0) {
				selections[existing] = entry;
			} else {
				selections.push(entry);
			}

			await context.workspaceState.update('tarx.selectionContext', selections);
			contextFilesProvider?.refresh();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.getSelectionContext', () => {
			return context.workspaceState.get<FileContextData[]>('tarx.selectionContext', []);
		})
	);

	// Get all context (files + selections) formatted for chat
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.getAllContext', () => {
			const files = context.workspaceState.get<FileContextData[]>('tarx.fileContext', []);
			const selections = context.workspaceState.get<FileContextData[]>('tarx.selectionContext', []);

			let formatted = '';

			for (const file of files) {
				formatted += formatFileContextForChat(file);
			}

			for (const sel of selections) {
				formatted += formatFileContextForChat(sel);
			}

			return formatted;
		})
	);

	// Log initialization to hive
	logToHive('Interaction commands registered - history click + file context ready');

	console.log('[TARX] Interaction commands registered');
}
