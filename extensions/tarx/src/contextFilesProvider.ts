/**
 * TARX Context Files Provider
 * Shows files that have been added to chat context in the sidebar
 *
 * @file extensions/tarx/src/contextFilesProvider.ts
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { TARX_ICONS } from './sidebar-icons-hover';

// ========================================
// TYPES
// ========================================

export interface ContextFile {
	path: string;
	name: string;
	language: string;
	lineCount: number;
	addedAt: number;
	selection?: {
		startLine: number;
		endLine: number;
		text: string;
	};
}

// ========================================
// TREE ITEM
// ========================================

class ContextFileTreeItem extends vscode.TreeItem {
	constructor(
		public readonly file: ContextFile,
		public readonly itemType: 'file' | 'selection' | 'empty' | 'header' = 'file'
	) {
		super(
			itemType === 'header' ? 'Context Files' : file.name,
			itemType === 'header'
				? vscode.TreeItemCollapsibleState.Expanded
				: vscode.TreeItemCollapsibleState.None
		);
		this.setupItem();
	}

	private setupItem(): void {
		switch (this.itemType) {
			case 'file':
				this.iconPath = this.getLanguageIcon();
				this.description = `${this.file.lineCount} lines`;
				this.tooltip = this.buildTooltip();
				this.contextValue = 'contextFile';
				this.command = {
					command: 'tarx.openFile',
					title: 'Open File',
					arguments: [this.file.path]
				};
				break;

			case 'selection':
				this.iconPath = new vscode.ThemeIcon('selection', new vscode.ThemeColor('charts.purple'));
				const range = this.file.selection
					? `L${this.file.selection.startLine}-${this.file.selection.endLine}`
					: '';
				this.description = range;
				this.tooltip = this.buildSelectionTooltip();
				this.contextValue = 'contextSelection';
				this.command = {
					command: 'tarx.openFileAtLine',
					title: 'Open at Selection',
					arguments: [this.file.path, this.file.selection?.startLine]
				};
				break;

			case 'empty':
				this.iconPath = new vscode.ThemeIcon('info');
				this.description = 'No files in context';
				this.contextValue = 'empty';
				break;

			case 'header':
				this.iconPath = TARX_ICONS.add;
				this.contextValue = 'contextHeader';
				break;
		}
	}

	private getLanguageIcon(): vscode.ThemeIcon {
		const iconMap: Record<string, string> = {
			'typescript': 'symbol-method',
			'typescriptreact': 'symbol-method',
			'javascript': 'symbol-method',
			'javascriptreact': 'symbol-method',
			'python': 'symbol-misc',
			'rust': 'symbol-struct',
			'go': 'symbol-interface',
			'java': 'symbol-class',
			'cpp': 'symbol-class',
			'c': 'symbol-variable',
			'css': 'symbol-color',
			'scss': 'symbol-color',
			'html': 'code',
			'json': 'json',
			'yaml': 'symbol-namespace',
			'markdown': 'markdown',
			'sql': 'database',
			'shellscript': 'terminal',
		};

		const iconName = iconMap[this.file.language] || 'file';
		return new vscode.ThemeIcon(iconName, new vscode.ThemeColor('charts.blue'));
	}

	private buildTooltip(): vscode.MarkdownString {
		const md = new vscode.MarkdownString();
		md.supportHtml = true;

		md.appendMarkdown(`**${this.file.name}**\n\n`);
		md.appendMarkdown(`$(folder) ${this.file.path}\n\n`);
		md.appendMarkdown(`$(file-code) ${this.file.lineCount} lines\n\n`);
		md.appendMarkdown(`$(symbol-text) ${this.file.language}\n\n`);

		const timeAgo = formatTimeAgo(this.file.addedAt);
		md.appendMarkdown(`$(clock) Added ${timeAgo}`);

		return md;
	}

	private buildSelectionTooltip(): vscode.MarkdownString {
		const md = new vscode.MarkdownString();
		md.supportHtml = true;

		md.appendMarkdown(`**Selection from ${this.file.name}**\n\n`);

		if (this.file.selection) {
			md.appendMarkdown(`Lines ${this.file.selection.startLine}-${this.file.selection.endLine}\n\n`);
			md.appendMarkdown('```' + this.file.language + '\n');
			md.appendMarkdown(this.file.selection.text.slice(0, 500));
			if (this.file.selection.text.length > 500) {
				md.appendMarkdown('\n... (truncated)');
			}
			md.appendMarkdown('\n```');
		}

		return md;
	}
}

// ========================================
// PROVIDER
// ========================================

export class ContextFilesProvider implements vscode.TreeDataProvider<ContextFileTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<ContextFileTreeItem | undefined | null>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: ContextFileTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: ContextFileTreeItem): Promise<ContextFileTreeItem[]> {
		// Get files from workspace state
		const files = this.context.workspaceState.get<ContextFile[]>('tarx.fileContext', []);

		if (files.length === 0) {
			return [
				new ContextFileTreeItem(
					{ path: '', name: 'Add files with @ or right-click', language: '', lineCount: 0, addedAt: 0 },
					'empty'
				)
			];
		}

		// Sort by addedAt (most recent first)
		const sortedFiles = [...files].sort((a, b) => b.addedAt - a.addedAt);

		return sortedFiles.map(file =>
			new ContextFileTreeItem(
				file,
				file.selection ? 'selection' : 'file'
			)
		);
	}

	/**
	 * Get all files currently in context
	 */
	getContextFiles(): ContextFile[] {
		return this.context.workspaceState.get<ContextFile[]>('tarx.fileContext', []);
	}

	/**
	 * Add a file to context
	 */
	async addFile(file: ContextFile): Promise<void> {
		const files = this.getContextFiles();
		const existing = files.findIndex(f => f.path === file.path && !f.selection);

		if (existing >= 0) {
			files[existing] = { ...file, addedAt: Date.now() };
		} else {
			files.push({ ...file, addedAt: Date.now() });
		}

		await this.context.workspaceState.update('tarx.fileContext', files);
		this.refresh();
	}

	/**
	 * Add a selection to context
	 */
	async addSelection(file: ContextFile): Promise<void> {
		if (!file.selection) return;

		const files = this.getContextFiles();
		files.push({ ...file, addedAt: Date.now() });

		await this.context.workspaceState.update('tarx.fileContext', files);
		this.refresh();
	}

	/**
	 * Remove a file from context
	 */
	async removeFile(filePath: string): Promise<void> {
		const files = this.getContextFiles();
		const filtered = files.filter(f => f.path !== filePath);

		await this.context.workspaceState.update('tarx.fileContext', filtered);
		this.refresh();
	}

	/**
	 * Clear all context files
	 */
	async clearAll(): Promise<void> {
		await this.context.workspaceState.update('tarx.fileContext', []);
		this.refresh();
	}

	/**
	 * Get context as formatted text for chat
	 */
	getContextAsText(): string {
		const files = this.getContextFiles();

		if (files.length === 0) {
			return '';
		}

		let text = '## Context Files\n\n';

		for (const file of files) {
			if (file.selection) {
				text += `### ${file.name} (Lines ${file.selection.startLine}-${file.selection.endLine})\n`;
				text += '```' + file.language + '\n';
				text += file.selection.text;
				text += '\n```\n\n';
			} else {
				text += `### ${file.name}\n`;
				text += `_Path: ${file.path}_\n`;
				text += `_${file.lineCount} lines, ${file.language}_\n\n`;
			}
		}

		return text;
	}
}

// ========================================
// HELPER FUNCTIONS
// ========================================

function formatTimeAgo(timestamp: number): string {
	const seconds = Math.floor((Date.now() - timestamp) / 1000);

	if (seconds < 60) return 'just now';
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;

	return new Date(timestamp).toLocaleDateString();
}

// ========================================
// REGISTRATION
// ========================================

export function registerContextFilesProvider(context: vscode.ExtensionContext): ContextFilesProvider {
	const provider = new ContextFilesProvider(context);

	// Register tree view
	const treeView = vscode.window.createTreeView('tarx.contextFiles', {
		treeDataProvider: provider,
		showCollapseAll: false
	});
	context.subscriptions.push(treeView);

	// Safe command registration helper
	function safeRegister(commandId: string, handler: (...args: unknown[]) => unknown) {
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
	safeRegister('tarx.context.refresh', () => {
		provider.refresh();
	});

	// Register remove file command
	safeRegister('tarx.context.removeFile', async (...args: unknown[]) => {
		const item = args[0] as ContextFileTreeItem | undefined;
		if (item?.file?.path) {
			await provider.removeFile(item.file.path);
			vscode.window.showInformationMessage(`Removed ${item.file.name} from context`);
		}
	});

	// Register open file at line command
	safeRegister('tarx.openFileAtLine', async (...args: unknown[]) => {
		const filePath = args[0] as string;
		const line = args[1] as number | undefined;
		try {
			const uri = vscode.Uri.file(filePath);
			const document = await vscode.workspace.openTextDocument(uri);
			const editor = await vscode.window.showTextDocument(document);

			if (line && line > 0) {
				const position = new vscode.Position(line - 1, 0);
				editor.selection = new vscode.Selection(position, position);
				editor.revealRange(
					new vscode.Range(position, position),
					vscode.TextEditorRevealType.InCenter
				);
			}
		} catch (e) {
			console.error('[TARX] Failed to open file:', e);
			vscode.window.showErrorMessage(`Failed to open ${filePath}`);
		}
	});

	// Register get context text command (for chat participant)
	safeRegister('tarx.getContextText', () => {
		return provider.getContextAsText();
	});

	console.log('[TARX] Context Files provider registered');
	return provider;
}
