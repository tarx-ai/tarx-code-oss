/**
 * TARX Sidebar UX Module
 * Unified UX improvements: icons, hover, collapsible sections, click handlers
 *
 * @file extensions/tarx/src/sidebar-ux.ts
 * @generated Continuous UX Loop
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';

// ============================================================
// ICONS (Codicons)
// ============================================================

export const TARX_ICONS = {
	// Project & Organization
	project: 'folder-library',
	projectActive: 'folder-opened',
	folder: 'folder',
	folderOpen: 'folder-opened',

	// Time & History
	clock: 'clock',
	history: 'history',
	timeline: 'timeline',

	// AI & Intelligence
	brain: 'lightbulb',
	memory: 'database',
	rag: 'symbol-misc',
	sparkle: 'sparkle',

	// Chat & Conversations
	chat: 'comment-discussion',
	message: 'comment',
	thread: 'git-commit',

	// Files & Content
	file: 'file',
	fileCode: 'file-code',
	fileBinary: 'file-binary',
	fileMedia: 'file-media',

	// Actions
	add: 'add',
	edit: 'edit',
	delete: 'trash',
	refresh: 'refresh',
	settings: 'gear',
	play: 'play',
	stop: 'debug-stop',

	// Sections
	instructions: 'book',
	files: 'files',
	conversations: 'comment-discussion',
	memorySection: 'brain',

	// Status
	active: 'circle-filled',
	inactive: 'circle-outline',
	loading: 'loading~spin',
	error: 'error',
	warning: 'warning',
	success: 'check',
} as const;

/**
 * Get themed icon with optional color
 */
export function getIcon(
	iconId: keyof typeof TARX_ICONS,
	color?: string
): vscode.ThemeIcon {
	const icon = TARX_ICONS[iconId];
	if (color) {
		return new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
	}
	return new vscode.ThemeIcon(icon);
}

// ============================================================
// COLORS (Neon Cyberpunk)
// ============================================================

export const UX_COLORS = {
	// Primary
	electricBlue: '#00F0FF',
	neonPurple: '#B026FF',
	cyberPink: '#FF2E97',
	plasmaGreen: '#00FF94',

	// Hover states
	hoverBg: '#2A2D4A',
	hoverBgDark: '#1A1D3A',
	activeBg: 'rgba(0, 240, 255, 0.1)',

	// Focus
	focusRing: '#00F0FF',
	focusRingAlpha: 'rgba(0, 240, 255, 0.5)',

	// Text
	textPrimary: '#FFFFFF',
	textSecondary: '#A0A0A0',
	textMuted: '#666666',
} as const;

// ============================================================
// HOVER POLISH CSS
// ============================================================

export function generateHoverCSS(): string {
	return `
/* ============================================================
   TARX SIDEBAR UX - Hover & Focus Styles
   ============================================================ */

/* Base hover transition */
.tarx-item {
	transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
	border-radius: 6px;
	padding: 6px 8px;
	margin: 2px 4px;
}

/* Hover: Contrast background + subtle scale */
.tarx-item:hover {
	background: ${UX_COLORS.hoverBg};
	transform: scale(1.02);
	box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
}

/* Active state */
.tarx-item.active {
	background: ${UX_COLORS.activeBg};
	border-left: 2px solid ${UX_COLORS.electricBlue};
}

/* Focus ring - Electric Blue */
.tarx-item:focus,
.tarx-item:focus-visible {
	outline: none;
	box-shadow: 0 0 0 2px ${UX_COLORS.focusRingAlpha};
}

/* Icon hover glow */
.tarx-item:hover .tarx-icon {
	filter: drop-shadow(0 0 4px ${UX_COLORS.electricBlue});
}

/* Project item specific */
.tarx-project-item {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 12px;
	cursor: pointer;
}

.tarx-project-item:hover {
	background: linear-gradient(90deg, ${UX_COLORS.activeBg} 0%, transparent 100%);
}

/* Section header */
.tarx-section-header {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 4px 8px;
	font-size: 11px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	color: ${UX_COLORS.textSecondary};
	cursor: pointer;
}

.tarx-section-header:hover {
	color: ${UX_COLORS.textPrimary};
}

/* Chevron animation */
.tarx-chevron {
	transition: transform 150ms ease;
}

.tarx-section.expanded .tarx-chevron {
	transform: rotate(90deg);
}

/* History item */
.tarx-history-item {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 12px;
	font-size: 12px;
	cursor: pointer;
	border-left: 2px solid transparent;
}

.tarx-history-item:hover {
	background: ${UX_COLORS.hoverBg};
	border-left-color: ${UX_COLORS.neonPurple};
}

.tarx-history-item .tarx-time {
	font-size: 10px;
	color: ${UX_COLORS.textMuted};
	margin-left: auto;
}

/* File item */
.tarx-file-item {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 4px 12px 4px 24px;
	font-size: 12px;
	cursor: pointer;
}

.tarx-file-item:hover {
	background: ${UX_COLORS.hoverBg};
}

.tarx-file-item .tarx-file-size {
	font-size: 10px;
	color: ${UX_COLORS.textMuted};
	margin-left: auto;
}

/* Memory stat */
.tarx-memory-stat {
	display: flex;
	justify-content: space-between;
	padding: 4px 12px;
	font-size: 11px;
}

.tarx-memory-stat .tarx-stat-label {
	color: ${UX_COLORS.textSecondary};
}

.tarx-memory-stat .tarx-stat-value {
	color: ${UX_COLORS.plasmaGreen};
	font-weight: 500;
}

/* Drag & drop zone */
.tarx-dropzone {
	border: 2px dashed rgba(255, 255, 255, 0.2);
	border-radius: 8px;
	padding: 16px;
	text-align: center;
	color: ${UX_COLORS.textSecondary};
	transition: all 150ms ease;
}

.tarx-dropzone.active {
	border-color: ${UX_COLORS.electricBlue};
	background: ${UX_COLORS.activeBg};
	color: ${UX_COLORS.electricBlue};
}

/* Loading skeleton */
@keyframes tarx-shimmer {
	0% { background-position: -200% 0; }
	100% { background-position: 200% 0; }
}

.tarx-skeleton {
	background: linear-gradient(90deg,
		${UX_COLORS.hoverBgDark} 0%,
		${UX_COLORS.hoverBg} 50%,
		${UX_COLORS.hoverBgDark} 100%
	);
	background-size: 200% 100%;
	animation: tarx-shimmer 1.5s ease-in-out infinite;
	border-radius: 4px;
}
`;
}

// ============================================================
// COLLAPSIBLE PROJECT SECTIONS
// ============================================================

export type SectionId = 'instructions' | 'files' | 'conversations' | 'memory';

export interface SectionConfig {
	id: SectionId;
	label: string;
	icon: keyof typeof TARX_ICONS;
	color: string;
	description: string;
}

export const SECTION_CONFIGS: SectionConfig[] = [
	{
		id: 'instructions',
		label: 'Instructions',
		icon: 'instructions',
		color: UX_COLORS.electricBlue,
		description: 'Project context & guidelines'
	},
	{
		id: 'files',
		label: 'Files',
		icon: 'files',
		color: UX_COLORS.plasmaGreen,
		description: 'Project files (drag & drop)'
	},
	{
		id: 'conversations',
		label: 'Conversations',
		icon: 'conversations',
		color: UX_COLORS.neonPurple,
		description: 'Chat history threads'
	},
	{
		id: 'memory',
		label: 'Memory',
		icon: 'memorySection',
		color: UX_COLORS.cyberPink,
		description: 'RAG knowledge base'
	}
];

// ============================================================
// TREE ITEMS
// ============================================================

export class UXTreeItem extends vscode.TreeItem {
	constructor(
		public readonly itemLabel: string,
		public readonly itemType: 'project' | 'section' | 'history' | 'file' | 'memory' | 'action',
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly data?: any
	) {
		super(itemLabel, collapsibleState);
		this.setupItem();
	}

	private setupItem(): void {
		switch (this.itemType) {
			case 'project':
				this.iconPath = getIcon(this.data?.isActive ? 'projectActive' : 'project', 'charts.blue');
				this.contextValue = this.data?.isActive ? 'activeProject' : 'project';
				this.description = this.data?.type || '';
				break;

			case 'section':
				const config = SECTION_CONFIGS.find(s => s.id === this.data?.sectionId);
				if (config) {
					this.iconPath = getIcon(config.icon);
					this.description = config.description;
				}
				this.contextValue = 'section';
				break;

			case 'history':
				this.iconPath = getIcon('chat', 'charts.purple');
				this.description = this.data?.timeAgo || '';
				this.contextValue = 'historyItem';
				this.command = {
					command: 'tarx.ux.openHistory',
					title: 'Open Conversation',
					arguments: [this.data?.sessionId]
				};
				break;

			case 'file':
				this.iconPath = this.getFileIcon(this.data?.path);
				this.description = this.data?.size || '';
				this.contextValue = 'fileItem';
				this.command = {
					command: 'tarx.ux.openFile',
					title: 'Open File',
					arguments: [this.data?.path]
				};
				break;

			case 'memory':
				this.iconPath = getIcon('memory', 'charts.red');
				this.description = this.data?.value || '';
				this.contextValue = 'memoryItem';
				break;

			case 'action':
				this.iconPath = getIcon(this.data?.icon || 'add');
				this.contextValue = 'action';
				if (this.data?.command) {
					this.command = {
						command: this.data.command,
						title: this.itemLabel,
						arguments: this.data?.args
					};
				}
				break;
		}
	}

	private getFileIcon(filePath?: string): vscode.ThemeIcon {
		if (!filePath) return getIcon('file');

		const ext = path.extname(filePath).toLowerCase();
		const iconMap: Record<string, keyof typeof TARX_ICONS> = {
			'.ts': 'fileCode',
			'.tsx': 'fileCode',
			'.js': 'fileCode',
			'.jsx': 'fileCode',
			'.py': 'fileCode',
			'.rs': 'fileCode',
			'.go': 'fileCode',
			'.md': 'file',
			'.json': 'fileCode',
			'.png': 'fileMedia',
			'.jpg': 'fileMedia',
			'.svg': 'fileMedia',
		};

		return getIcon(iconMap[ext] || 'file');
	}
}

// ============================================================
// HISTORY CLICK HANDLER
// ============================================================

const DB_PATH = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');

function queryDB<T>(sql: string): T[] {
	try {
		const result = execSync(`sqlite3 "${DB_PATH}" -json`, {
			encoding: 'utf8',
			input: sql,
			timeout: 5000
		});
		return JSON.parse(result || '[]');
	} catch {
		return [];
	}
}

/**
 * Open history item - loads session and opens chat
 */
export async function openHistoryItem(sessionId: string): Promise<void> {
	console.log(`[UX] Opening history: ${sessionId}`);

	// Load session data
	const sessions = queryDB<any>(`
		SELECT id, title, updated_at, space_id, model
		FROM sessions WHERE id = '${sessionId}' LIMIT 1;
	`);

	if (sessions.length === 0) {
		vscode.window.showErrorMessage('Session not found');
		return;
	}

	const session = sessions[0];

	// Load turns from messages table (uses session_id)
	const turns = queryDB<any>(`
		SELECT id, role, content, created_at as timestamp
		FROM messages
		WHERE session_id = '${sessionId}'
		ORDER BY created_at ASC;
	`);

	// Set as active session
	execSync(`sqlite3 "${DB_PATH}"`, {
		input: `UPDATE sessions SET is_active = 0; UPDATE sessions SET is_active = 1 WHERE id = '${sessionId}';`,
		encoding: 'utf8'
	});

	// Store in workspace state
	await vscode.commands.executeCommand('tarx.setActiveSession', {
		id: session.id,
		title: session.title,
		turns: turns.map((t: any) => ({
			id: t.id,
			role: t.role,
			content: t.content,
			timestamp: t.timestamp
		}))
	});

	// Open chat
	await vscode.commands.executeCommand('workbench.action.chat.open');

	// Notify
	vscode.window.showInformationMessage(`Loaded "${session.title}" (${turns.length} messages)`);

	// Refresh sidebar
	await vscode.commands.executeCommand('tarx.history.refresh');
}

// ============================================================
// FILE CLICK HANDLER
// ============================================================

/**
 * Open file - preview or inject into chat
 */
export async function openFileItem(filePath: string, mode: 'preview' | 'inject' = 'preview'): Promise<void> {
	console.log(`[UX] Opening file: ${filePath}, mode: ${mode}`);

	if (mode === 'preview') {
		// Open in editor
		const uri = vscode.Uri.file(filePath);
		await vscode.window.showTextDocument(uri, { preview: true });
	} else {
		// Inject into chat context
		try {
			const content = fs.readFileSync(filePath, 'utf8');
			const ext = path.extname(filePath).slice(1);
			const name = path.basename(filePath);

			await vscode.commands.executeCommand('tarx.addFileToContext', {
				path: filePath,
				name: name,
				content: content,
				language: ext,
				lineCount: content.split('\n').length
			});

			vscode.window.showInformationMessage(`Added ${name} to chat context`);
		} catch (e) {
			vscode.window.showErrorMessage(`Failed to read file: ${filePath}`);
		}
	}
}

// ============================================================
// INSTRUCTIONS EDITOR
// ============================================================

/**
 * Edit project instructions
 */
export async function editInstructions(projectId: string): Promise<void> {
	// Get current instructions
	const projects = queryDB<any>(`
		SELECT id, name, instructions FROM projects WHERE id = '${projectId}' LIMIT 1;
	`);

	if (projects.length === 0) {
		vscode.window.showErrorMessage('Project not found');
		return;
	}

	const project = projects[0];

	// Show input box
	const newInstructions = await vscode.window.showInputBox({
		title: `Instructions for ${project.name}`,
		prompt: 'Describe the project, tech stack, coding conventions...',
		value: project.instructions || '',
		placeHolder: 'A TypeScript web app using React...',
		ignoreFocusOut: true
	});

	if (newInstructions === undefined) return; // Cancelled

	// Update DB
	const escaped = newInstructions.replace(/'/g, "''");
	execSync(`sqlite3 "${DB_PATH}"`, {
		input: `UPDATE projects SET instructions = '${escaped}', updated_at = strftime('%s', 'now') WHERE id = '${projectId}';`,
		encoding: 'utf8'
	});

	vscode.window.showInformationMessage(`Instructions updated for ${project.name}`);
	await vscode.commands.executeCommand('tarx.sections.refresh');
}

// ============================================================
// COMMAND REGISTRATION
// ============================================================

export function registerUXCommands(context: vscode.ExtensionContext): void {
	// History click
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.ux.openHistory', openHistoryItem)
	);

	// File click - preview
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.ux.openFile', (filePath: string) =>
			openFileItem(filePath, 'preview')
		)
	);

	// File click - inject
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.ux.injectFile', (filePath: string) =>
			openFileItem(filePath, 'inject')
		)
	);

	// Edit instructions
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.ux.editInstructions', editInstructions)
	);

	// Quick actions (Cycle 3)
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.showQuickActions', showQuickActions)
	);

	// TARX command palette (Cycle 6)
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.commands', showTarxCommands)
	);

	// Create status bar (Cycle 4)
	createStatusBar(context);

	// Log
	logUXCycle('UX commands registered: openHistory, openFile, injectFile, editInstructions, showQuickActions, commands + statusBar');

	console.log('[TARX] UX commands registered');
}

// ============================================================
// KEYBOARD NAVIGATION (Cycle 2)
// ============================================================

export interface KeyboardNav {
	currentIndex: number;
	items: string[];
	onSelect: (index: number) => void;
}

/**
 * Handle keyboard navigation in tree views
 */
export function handleKeyboardNav(
	event: { key: string; preventDefault: () => void },
	nav: KeyboardNav
): void {
	switch (event.key) {
		case 'ArrowDown':
			event.preventDefault();
			nav.currentIndex = Math.min(nav.currentIndex + 1, nav.items.length - 1);
			break;
		case 'ArrowUp':
			event.preventDefault();
			nav.currentIndex = Math.max(nav.currentIndex - 1, 0);
			break;
		case 'Enter':
		case ' ':
			event.preventDefault();
			nav.onSelect(nav.currentIndex);
			break;
		case 'Home':
			event.preventDefault();
			nav.currentIndex = 0;
			break;
		case 'End':
			event.preventDefault();
			nav.currentIndex = nav.items.length - 1;
			break;
	}
}

// ============================================================
// TOOLTIPS (Cycle 2)
// ============================================================

export interface TooltipConfig {
	text: string;
	shortcut?: string;
	position?: 'top' | 'bottom' | 'left' | 'right';
}

export function createTooltipMarkdown(config: TooltipConfig): vscode.MarkdownString {
	const md = new vscode.MarkdownString();
	md.appendText(config.text);
	if (config.shortcut) {
		md.appendText('\n\n');
		md.appendMarkdown(`*$(keyboard) ${config.shortcut}*`);
	}
	md.supportThemeIcons = true;
	return md;
}

export const TARX_TOOLTIPS: Record<string, TooltipConfig> = {
	newProject: { text: 'Create a new TARX project', shortcut: 'Ctrl+Shift+N' },
	openHistory: { text: 'Open this conversation', shortcut: 'Enter' },
	injectFile: { text: 'Add file to chat context', shortcut: 'Ctrl+Enter' },
	editInstructions: { text: 'Edit project instructions', shortcut: 'E' },
	refresh: { text: 'Refresh sidebar', shortcut: 'R' },
	collapse: { text: 'Collapse section', shortcut: 'Left Arrow' },
	expand: { text: 'Expand section', shortcut: 'Right Arrow' },
};

// ============================================================
// BADGES & NOTIFICATIONS (Cycle 2)
// ============================================================

export interface BadgeConfig {
	count: number;
	type: 'info' | 'warning' | 'error' | 'new';
	tooltip?: string;
}

export const BADGE_COLORS: Record<BadgeConfig['type'], string> = {
	info: UX_COLORS.electricBlue,
	warning: '#FFB800',
	error: '#FF4444',
	new: UX_COLORS.plasmaGreen,
};

export function createBadgeDecoration(config: BadgeConfig): vscode.ThemeIcon {
	const color = BADGE_COLORS[config.type];
	// VS Code uses specific theme color IDs
	const themeColor = config.type === 'error' ? 'errorForeground' :
		config.type === 'warning' ? 'editorWarning.foreground' :
		config.type === 'new' ? 'testing.iconPassed' : 'charts.blue';
	return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(themeColor));
}

export function formatBadgeCount(count: number): string {
	if (count > 99) return '99+';
	if (count > 9) return count.toString();
	return count.toString();
}

// ============================================================
// ANIMATION UTILITIES (Cycle 2)
// ============================================================

export const ANIMATION_CSS = `
/* Pulse animation for new items */
@keyframes tarx-pulse {
	0%, 100% { opacity: 1; }
	50% { opacity: 0.5; }
}

.tarx-new-item {
	animation: tarx-pulse 2s ease-in-out 3;
}

/* Slide in animation */
@keyframes tarx-slide-in {
	from {
		opacity: 0;
		transform: translateX(-10px);
	}
	to {
		opacity: 1;
		transform: translateX(0);
	}
}

.tarx-slide-in {
	animation: tarx-slide-in 200ms ease-out;
}

/* Fade in for sections */
@keyframes tarx-fade-in {
	from { opacity: 0; }
	to { opacity: 1; }
}

.tarx-section-content {
	animation: tarx-fade-in 150ms ease-out;
}

/* Bounce for actions */
@keyframes tarx-bounce {
	0%, 100% { transform: scale(1); }
	50% { transform: scale(1.1); }
}

.tarx-action:active {
	animation: tarx-bounce 100ms ease-out;
}
`;

/**
 * Get combined CSS for all UX styles
 */
export function getAllUXStyles(): string {
	return generateHoverCSS() + '\n' + ANIMATION_CSS;
}

// ============================================================
// CONTEXT MENU ACTIONS (Cycle 2)
// ============================================================

export interface ContextMenuItem {
	label: string;
	command: string;
	icon?: keyof typeof TARX_ICONS;
	group?: string;
}

export const CONTEXT_MENUS: Record<string, ContextMenuItem[]> = {
	project: [
		{ label: 'Open Project', command: 'tarx.openProject', icon: 'projectActive', group: 'navigation' },
		{ label: 'Edit Color', command: 'tarx.editProjectColor', icon: 'edit', group: 'modification' },
		{ label: 'Edit Instructions', command: 'tarx.ux.editInstructions', icon: 'instructions', group: 'modification' },
		{ label: 'Delete Project', command: 'tarx.deleteProject', icon: 'delete', group: 'danger' },
	],
	history: [
		{ label: 'Open Conversation', command: 'tarx.ux.openHistory', icon: 'chat', group: 'navigation' },
		{ label: 'Copy Summary', command: 'tarx.copySessionSummary', icon: 'edit', group: 'clipboard' },
		{ label: 'Delete', command: 'tarx.deleteSession', icon: 'delete', group: 'danger' },
	],
	file: [
		{ label: 'Open File', command: 'tarx.ux.openFile', icon: 'file', group: 'navigation' },
		{ label: 'Inject into Chat', command: 'tarx.ux.injectFile', icon: 'sparkle', group: 'ai' },
		{ label: 'Remove from Project', command: 'tarx.removeFile', icon: 'delete', group: 'danger' },
	],
};

// ============================================================
// DRAG & DROP (Cycle 3)
// ============================================================

export interface DragDropData {
	type: 'file' | 'folder' | 'text';
	paths: string[];
	content?: string;
}

/**
 * Handle file drop into project
 */
export async function handleFileDrop(
	projectId: string,
	data: DragDropData
): Promise<{ success: boolean; added: number }> {
	console.log(`[UX] File drop on project ${projectId}:`, data.paths.length, 'files');

	let addedCount = 0;

	for (const filePath of data.paths) {
		try {
			const stat = fs.statSync(filePath);
			if (stat.isFile()) {
				// Add file to project
				const name = path.basename(filePath);
				const ext = path.extname(filePath).slice(1);
				const size = stat.size;

				const escaped = filePath.replace(/'/g, "''");
				execSync(`sqlite3 "${DB_PATH}"`, {
					input: `INSERT OR REPLACE INTO project_files (project_id, path, name, extension, size, added_at)
						VALUES ('${projectId}', '${escaped}', '${name}', '${ext}', ${size}, strftime('%s', 'now'));`,
					encoding: 'utf8'
				});
				addedCount++;
			} else if (stat.isDirectory()) {
				// Recursively add folder contents (limit depth)
				const files = fs.readdirSync(filePath).slice(0, 50); // Limit to 50 files
				for (const file of files) {
					const fullPath = path.join(filePath, file);
					if (fs.statSync(fullPath).isFile()) {
						const result = await handleFileDrop(projectId, { type: 'file', paths: [fullPath] });
						addedCount += result.added;
					}
				}
			}
		} catch (e) {
			console.error('[UX] Failed to add file:', filePath, e);
		}
	}

	// Refresh sidebar
	await vscode.commands.executeCommand('tarx.sections.refresh');

	return { success: addedCount > 0, added: addedCount };
}

/**
 * Create VS Code drag-drop controller for sidebar
 */
export function createDragDropController(projectId: string): vscode.TreeDragAndDropController<UXTreeItem> {
	return {
		dragMimeTypes: ['application/vnd.code.tree.tarxFiles'],
		dropMimeTypes: ['text/uri-list', 'application/vnd.code.tree.tarxFiles'],

		handleDrag(source: readonly UXTreeItem[], dataTransfer: vscode.DataTransfer): void {
			const paths = source
				.filter(item => item.itemType === 'file' && item.data?.path)
				.map(item => item.data.path);
			dataTransfer.set('application/vnd.code.tree.tarxFiles', new vscode.DataTransferItem(paths));
		},

		async handleDrop(target: UXTreeItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
			// Handle files from Explorer
			const uriList = dataTransfer.get('text/uri-list');
			if (uriList) {
				const uris = (await uriList.asString()).split('\n').filter(u => u.startsWith('file://'));
				const paths = uris.map(u => vscode.Uri.parse(u).fsPath);
				await handleFileDrop(projectId, { type: 'file', paths });
			}
		}
	};
}

// ============================================================
// PROGRESS INDICATORS (Cycle 3)
// ============================================================

export interface ProgressConfig {
	title: string;
	cancellable?: boolean;
}

/**
 * Show progress indicator for long-running operations
 */
export async function withProgress<T>(
	config: ProgressConfig,
	task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<T>
): Promise<T> {
	return vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: config.title,
			cancellable: config.cancellable ?? false
		},
		task
	);
}

/**
 * Show sidebar loading state
 */
export function createLoadingItem(message: string = 'Loading...'): UXTreeItem {
	const item = new UXTreeItem(message, 'action', vscode.TreeItemCollapsibleState.None, {
		icon: 'loading'
	});
	return item;
}

// ============================================================
// SEARCH & FILTER (Cycle 3)
// ============================================================

export interface SearchFilter {
	query: string;
	type?: 'all' | 'projects' | 'files' | 'conversations';
	dateRange?: { from: Date; to: Date };
}

/**
 * Filter tree items by search query
 */
export function filterItems<T extends { label?: string | vscode.TreeItemLabel; description?: string }>(
	items: T[],
	filter: SearchFilter
): T[] {
	if (!filter.query) return items;

	const query = filter.query.toLowerCase();
	return items.filter(item => {
		const label = typeof item.label === 'string' ? item.label : item.label?.label || '';
		const desc = item.description?.toString() || '';
		return label.toLowerCase().includes(query) || desc.toLowerCase().includes(query);
	});
}

/**
 * Highlight search matches in text
 */
export function highlightMatches(text: string, query: string): vscode.TreeItemLabel {
	if (!query) return { label: text };

	const idx = text.toLowerCase().indexOf(query.toLowerCase());
	if (idx === -1) return { label: text };

	return {
		label: text,
		highlights: [[idx, idx + query.length]]
	};
}

// ============================================================
// QUICK ACTIONS (Cycle 3)
// ============================================================

export interface QuickAction {
	id: string;
	label: string;
	icon: keyof typeof TARX_ICONS;
	command: string;
	args?: any[];
	shortcut?: string;
}

export const QUICK_ACTIONS: QuickAction[] = [
	{ id: 'newChat', label: 'New Chat', icon: 'chat', command: 'tarx.newChat', shortcut: 'Ctrl+N' },
	{ id: 'newProject', label: 'New Project', icon: 'add', command: 'tarx.createProject', shortcut: 'Ctrl+Shift+N' },
	{ id: 'refresh', label: 'Refresh', icon: 'refresh', command: 'tarx.refresh', shortcut: 'Ctrl+R' },
	{ id: 'search', label: 'Search', icon: 'file', command: 'tarx.search', shortcut: 'Ctrl+Shift+F' },
];

/**
 * Show quick actions picker
 */
export async function showQuickActions(): Promise<void> {
	const items = QUICK_ACTIONS.map(action => ({
		label: `$(${TARX_ICONS[action.icon]}) ${action.label}`,
		description: action.shortcut,
		action
	}));

	const selected = await vscode.window.showQuickPick(items, {
		placeHolder: 'Quick Actions',
		matchOnDescription: true
	});

	if (selected) {
		await vscode.commands.executeCommand(selected.action.command, ...(selected.action.args || []));
	}
}

// ============================================================
// ACCESSIBILITY (Cycle 4)
// ============================================================

/**
 * Generate ARIA attributes for tree items
 */
export function getAriaAttributes(item: UXTreeItem): Record<string, string> {
	const attrs: Record<string, string> = {
		'role': 'treeitem',
		'aria-label': typeof item.label === 'string' ? item.label : item.label?.label || '',
	};

	if (item.collapsibleState !== vscode.TreeItemCollapsibleState.None) {
		attrs['aria-expanded'] = item.collapsibleState === vscode.TreeItemCollapsibleState.Expanded ? 'true' : 'false';
	}

	if (item.contextValue === 'activeProject') {
		attrs['aria-selected'] = 'true';
		attrs['aria-current'] = 'true';
	}

	if (item.description) {
		attrs['aria-description'] = item.description.toString();
	}

	return attrs;
}

/**
 * Screen reader announcements
 */
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
	// Use VS Code's accessibility API
	vscode.window.showInformationMessage(message, { modal: false });
	console.log(`[Announce] ${priority}: ${message}`);
}

export const ARIA_LABELS = {
	projectList: 'TARX Projects',
	sectionInstructions: 'Project instructions section, collapsible',
	sectionFiles: 'Project files section, collapsible',
	sectionConversations: 'Conversation history section, collapsible',
	sectionMemory: 'AI memory section, collapsible',
	historyItem: (title: string, time: string) => `Conversation: ${title}, ${time}`,
	fileItem: (name: string, size: string) => `File: ${name}, size ${size}`,
	actionButton: (label: string, shortcut?: string) => shortcut ? `${label}, shortcut ${shortcut}` : label,
};

// ============================================================
// STATUS BAR (Cycle 4)
// ============================================================

let statusBarItem: vscode.StatusBarItem | undefined;

export interface StatusBarConfig {
	projectName?: string;
	sessionTitle?: string;
	memoryCount?: number;
	isProcessing?: boolean;
}

/**
 * Create and manage TARX status bar
 */
export function createStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
	statusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Left,
		100
	);
	statusBarItem.name = 'TARX Status';
	statusBarItem.command = 'tarx.showQuickActions';
	context.subscriptions.push(statusBarItem);
	statusBarItem.show();
	updateStatusBar({});
	return statusBarItem;
}

/**
 * Update status bar with current state
 */
export function updateStatusBar(config: StatusBarConfig): void {
	// Guard: statusBarItem may be null during dispose
	if (!statusBarItem) return;

	try {
		const parts: string[] = ['$(sparkle) TARX'];

		if (config.isProcessing) {
			parts.push('$(loading~spin)');
		}

		if (config.projectName) {
			parts.push(`$(folder) ${config.projectName}`);
		}

		if (config.sessionTitle) {
			parts.push(`$(comment-discussion) ${truncateText(config.sessionTitle, 20)}`);
		}

		if (config.memoryCount !== undefined && config.memoryCount > 0) {
			parts.push(`$(database) ${config.memoryCount}`);
		}

		// Guard: check again after any async operations
		if (!statusBarItem) return;

		statusBarItem.text = parts.join('  ');
		statusBarItem.tooltip = new vscode.MarkdownString(
			`**TARX AI Assistant**\n\n` +
			(config.projectName ? `Project: ${config.projectName}\n` : '') +
			(config.sessionTitle ? `Session: ${config.sessionTitle}\n` : '') +
			(config.memoryCount ? `Memory items: ${config.memoryCount}\n` : '') +
			`\nClick to open quick actions`
		);
	} catch {
		// Silently ignore errors during status bar updates (disposed, etc.)
	}
}

/**
 * Truncate text with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return text.slice(0, maxLength - 1) + '…';
}

// ============================================================
// TREE VIEW DECORATIONS (Cycle 4)
// ============================================================

export interface DecorationConfig {
	badge?: string;
	color?: string;
	tooltip?: string;
	propagate?: boolean;
}

/**
 * Create file decoration provider for sidebar items
 */
export function createDecorationProvider(): vscode.FileDecorationProvider {
	const decorations = new Map<string, DecorationConfig>();

	return {
		provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
			const config = decorations.get(uri.toString());
			if (!config) return undefined;

			return {
				badge: config.badge,
				color: config.color ? new vscode.ThemeColor(config.color) : undefined,
				tooltip: config.tooltip,
				propagate: config.propagate ?? false
			};
		},

		onDidChangeFileDecorations: new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>().event
	};
}

// ============================================================
// THEME INTEGRATION (Cycle 4)
// ============================================================

/**
 * Get colors that adapt to current theme
 */
export function getThemeColors(): Record<string, string> {
	const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
		vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast;

	return {
		background: isDark ? '#1E1E1E' : '#FFFFFF',
		foreground: isDark ? '#CCCCCC' : '#333333',
		accent: isDark ? UX_COLORS.electricBlue : '#0066CC',
		hover: isDark ? UX_COLORS.hoverBg : '#E8E8E8',
		border: isDark ? '#333333' : '#DDDDDD',
		success: UX_COLORS.plasmaGreen,
		error: '#FF4444',
		warning: '#FFB800',
	};
}

/**
 * Watch for theme changes
 */
export function onThemeChange(callback: (isDark: boolean) => void): vscode.Disposable {
	return vscode.window.onDidChangeActiveColorTheme(theme => {
		const isDark = theme.kind === vscode.ColorThemeKind.Dark ||
			theme.kind === vscode.ColorThemeKind.HighContrast;
		callback(isDark);
	});
}

// ============================================================
// TIME FORMATTING (Cycle 5)
// ============================================================

/**
 * Format timestamp to relative time (e.g., "2 hours ago")
 */
export function formatTimeAgo(timestamp: number | string | Date): string {
	const date = typeof timestamp === 'number' ? new Date(timestamp * 1000) :
		typeof timestamp === 'string' ? new Date(timestamp) : timestamp;

	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHour = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHour / 24);
	const diffWeek = Math.floor(diffDay / 7);
	const diffMonth = Math.floor(diffDay / 30);

	if (diffSec < 10) return 'just now';
	if (diffSec < 60) return `${diffSec}s ago`;
	if (diffMin < 60) return `${diffMin}m ago`;
	if (diffHour < 24) return `${diffHour}h ago`;
	if (diffDay < 7) return `${diffDay}d ago`;
	if (diffWeek < 4) return `${diffWeek}w ago`;
	if (diffMonth < 12) return `${diffMonth}mo ago`;

	return date.toLocaleDateString();
}

/**
 * Format timestamp for tooltip (full date/time)
 */
export function formatFullTime(timestamp: number | string | Date): string {
	const date = typeof timestamp === 'number' ? new Date(timestamp * 1000) :
		typeof timestamp === 'string' ? new Date(timestamp) : timestamp;

	return date.toLocaleString(undefined, {
		weekday: 'short',
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

/**
 * Group items by time period
 */
export interface TimeGroup<T> {
	label: string;
	items: T[];
}

export function groupByTime<T>(
	items: T[],
	getTimestamp: (item: T) => number
): TimeGroup<T>[] {
	const now = Date.now();
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const todayMs = today.getTime();

	const groups: Record<string, T[]> = {
		'Today': [],
		'Yesterday': [],
		'This Week': [],
		'This Month': [],
		'Older': []
	};

	for (const item of items) {
		const ts = getTimestamp(item) * 1000; // Convert unix timestamp to ms
		const daysDiff = Math.floor((todayMs - ts) / (1000 * 60 * 60 * 24));

		if (ts >= todayMs) {
			groups['Today'].push(item);
		} else if (daysDiff === 0) {
			groups['Yesterday'].push(item);
		} else if (daysDiff < 7) {
			groups['This Week'].push(item);
		} else if (daysDiff < 30) {
			groups['This Month'].push(item);
		} else {
			groups['Older'].push(item);
		}
	}

	return Object.entries(groups)
		.filter(([, items]) => items.length > 0)
		.map(([label, items]) => ({ label, items }));
}

// ============================================================
// SIZE FORMATTING (Cycle 5)
// ============================================================

/**
 * Format file size to human readable
 */
export function formatFileSize(bytes: number): string {
	if (bytes === 0) return '0 B';

	const units = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	const size = bytes / Math.pow(1024, i);

	return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Format line count
 */
export function formatLineCount(lines: number): string {
	if (lines < 1000) return `${lines} lines`;
	return `${(lines / 1000).toFixed(1)}k lines`;
}

// ============================================================
// TREE ITEM BUILDERS (Cycle 5)
// ============================================================

/**
 * Build history tree items from database
 */
export async function buildHistoryItems(projectId: string): Promise<UXTreeItem[]> {
	const sessions = queryDB<any>(`
		SELECT id, title, updated_at, model
		FROM sessions
		WHERE space_id = '${projectId}'
		ORDER BY updated_at DESC
		LIMIT 50;
	`);

	if (sessions.length === 0) {
		return [new UXTreeItem('No conversations yet', 'action', vscode.TreeItemCollapsibleState.None, {
			icon: 'chat',
			command: 'tarx.newChat'
		})];
	}

	// Group by time
	const groups = groupByTime(sessions, s => s.updated_at);

	const items: UXTreeItem[] = [];
	for (const group of groups) {
		// Add group header
		items.push(new UXTreeItem(
			group.label,
			'action',
			vscode.TreeItemCollapsibleState.None,
			{ icon: 'clock' }
		));

		// Add session items
		for (const session of group.items) {
			items.push(new UXTreeItem(
				session.title || 'Untitled',
				'history',
				vscode.TreeItemCollapsibleState.None,
				{
					sessionId: session.id,
					timeAgo: formatTimeAgo(session.updated_at),
					fullTime: formatFullTime(session.updated_at),
					model: session.model
				}
			));
		}
	}

	return items;
}

/**
 * Build file tree items from database
 */
export async function buildFileItems(projectId: string): Promise<UXTreeItem[]> {
	const files = queryDB<any>(`
		SELECT path, name, extension, size
		FROM project_files
		WHERE project_id = '${projectId}'
		ORDER BY name ASC;
	`);

	if (files.length === 0) {
		return [new UXTreeItem('Drop files here', 'action', vscode.TreeItemCollapsibleState.None, {
			icon: 'add',
			command: 'tarx.addFiles'
		})];
	}

	return files.map(file => new UXTreeItem(
		file.name,
		'file',
		vscode.TreeItemCollapsibleState.None,
		{
			path: file.path,
			size: formatFileSize(file.size),
			extension: file.extension
		}
	));
}

/**
 * Build memory stats items
 */
export async function buildMemoryItems(projectId: string): Promise<UXTreeItem[]> {
	// Get memory stats - use messages table for session data
	// Note: rag_entries table may not exist, so just count messages
	let stat = { rag_count: 0, turn_count: 0 };
	try {
		const stats = queryDB<any>(`
			SELECT
				(SELECT COUNT(*) FROM messages WHERE session_id IN
					(SELECT id FROM sessions WHERE space_id = '${projectId}')) as turn_count;
		`);
		stat = { rag_count: 0, turn_count: stats[0]?.turn_count || 0 };
	} catch (e) {
		console.warn('[TARX] Memory stats query failed:', e);
	}

	return [
		new UXTreeItem('RAG Entries', 'memory', vscode.TreeItemCollapsibleState.None, {
			value: stat.rag_count.toString()
		}),
		new UXTreeItem('Messages', 'memory', vscode.TreeItemCollapsibleState.None, {
			value: stat.turn_count.toString()
		}),
	];
}

// ============================================================
// WEBVIEW MESSAGES (Cycle 6)
// ============================================================

export type WebviewMessageType =
	| 'ready'
	| 'expandSection'
	| 'collapseSection'
	| 'selectItem'
	| 'contextMenu'
	| 'dragStart'
	| 'drop'
	| 'search'
	| 'refresh';

export interface WebviewMessage {
	type: WebviewMessageType;
	payload?: any;
}

export interface WebviewMessageHandler {
	(message: WebviewMessage): void | Promise<void>;
}

/**
 * Create message handler for webview panel
 */
export function createWebviewMessageHandler(
	panel: vscode.WebviewPanel,
	context: vscode.ExtensionContext
): vscode.Disposable {
	return panel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
		console.log('[UX] Webview message:', message.type);

		switch (message.type) {
			case 'ready':
				// Send initial state
				await sendStateToWebview(panel, context);
				break;

			case 'expandSection':
				await saveSectionState(context, message.payload.sectionId, true);
				break;

			case 'collapseSection':
				await saveSectionState(context, message.payload.sectionId, false);
				break;

			case 'selectItem':
				await handleItemSelection(message.payload);
				break;

			case 'contextMenu':
				await showContextMenu(message.payload.itemType, message.payload.itemId);
				break;

			case 'search':
				// Handled in webview
				break;

			case 'refresh':
				await vscode.commands.executeCommand('tarx.sections.refresh');
				break;
		}
	});
}

/**
 * Send state to webview
 */
async function sendStateToWebview(
	panel: vscode.WebviewPanel,
	context: vscode.ExtensionContext
): Promise<void> {
	const state = await getSidebarState(context);
	panel.webview.postMessage({
		type: 'state',
		payload: state
	});
}

/**
 * Handle item selection from webview
 */
async function handleItemSelection(payload: { type: string; id: string }): Promise<void> {
	switch (payload.type) {
		case 'history':
			await openHistoryItem(payload.id);
			break;
		case 'file':
			await openFileItem(payload.id, 'preview');
			break;
		case 'project':
			await vscode.commands.executeCommand('tarx.openProject', payload.id);
			break;
	}
}

/**
 * Show context menu for item
 */
async function showContextMenu(itemType: string, itemId: string): Promise<void> {
	const menuItems = CONTEXT_MENUS[itemType];
	if (!menuItems) return;

	const selected = await vscode.window.showQuickPick(
		menuItems.map(item => ({
			label: `$(${TARX_ICONS[item.icon || 'edit']}) ${item.label}`,
			command: item.command,
			args: [itemId]
		})),
		{ placeHolder: 'Select action' }
	);

	if (selected) {
		await vscode.commands.executeCommand(selected.command, ...selected.args);
	}
}

// ============================================================
// STATE PERSISTENCE (Cycle 6)
// ============================================================

export interface SidebarState {
	expandedSections: Record<string, boolean>;
	selectedProject?: string;
	searchQuery?: string;
	scrollPosition?: number;
}

const STATE_KEY = 'tarx.sidebar.state';

/**
 * Get sidebar state from workspace state
 */
export async function getSidebarState(context: vscode.ExtensionContext): Promise<SidebarState> {
	const state = context.workspaceState.get<SidebarState>(STATE_KEY);
	return state || {
		expandedSections: {
			instructions: true,
			files: true,
			conversations: true,
			memory: false
		}
	};
}

/**
 * Save sidebar state
 */
export async function saveSidebarState(
	context: vscode.ExtensionContext,
	state: Partial<SidebarState>
): Promise<void> {
	const current = await getSidebarState(context);
	await context.workspaceState.update(STATE_KEY, { ...current, ...state });
}

/**
 * Save section expanded state
 */
export async function saveSectionState(
	context: vscode.ExtensionContext,
	sectionId: string,
	expanded: boolean
): Promise<void> {
	const state = await getSidebarState(context);
	state.expandedSections[sectionId] = expanded;
	await saveSidebarState(context, { expandedSections: state.expandedSections });
}

/**
 * Save selected project
 */
export async function saveSelectedProject(
	context: vscode.ExtensionContext,
	projectId: string
): Promise<void> {
	await saveSidebarState(context, { selectedProject: projectId });
}

// ============================================================
// COMMAND PALETTE INTEGRATION (Cycle 6)
// ============================================================

export interface CommandItem {
	id: string;
	label: string;
	description?: string;
	icon: keyof typeof TARX_ICONS;
	category: string;
}

export const TARX_COMMANDS: CommandItem[] = [
	{ id: 'tarx.newChat', label: 'New Chat', icon: 'chat', category: 'Chat' },
	{ id: 'tarx.createProject', label: 'Create Project', icon: 'add', category: 'Projects' },
	{ id: 'tarx.openProject', label: 'Open Project', icon: 'project', category: 'Projects' },
	{ id: 'tarx.addFiles', label: 'Add Files to Project', icon: 'file', category: 'Files' },
	{ id: 'tarx.ux.editInstructions', label: 'Edit Instructions', icon: 'instructions', category: 'Projects' },
	{ id: 'tarx.sections.refresh', label: 'Refresh Sidebar', icon: 'refresh', category: 'View' },
	{ id: 'tarx.showQuickActions', label: 'Quick Actions', icon: 'sparkle', category: 'General' },
];

/**
 * Show command palette with TARX commands
 */
export async function showTarxCommands(): Promise<void> {
	const items = TARX_COMMANDS.map(cmd => ({
		label: `$(${TARX_ICONS[cmd.icon]}) ${cmd.label}`,
		description: cmd.category,
		command: cmd.id
	}));

	const selected = await vscode.window.showQuickPick(items, {
		placeHolder: 'TARX Commands',
		matchOnDescription: true
	});

	if (selected) {
		await vscode.commands.executeCommand(selected.command);
	}
}

// ============================================================
// ERROR HANDLING (Cycle 8)
// ============================================================

export type ErrorSeverity = 'error' | 'warning' | 'info';

export interface UXError {
	message: string;
	severity: ErrorSeverity;
	code?: string;
	action?: { label: string; command: string };
}

/**
 * Show error with optional action
 */
export async function showError(error: UXError): Promise<void> {
	const showFn = error.severity === 'error' ? vscode.window.showErrorMessage :
		error.severity === 'warning' ? vscode.window.showWarningMessage :
		vscode.window.showInformationMessage;

	if (error.action) {
		const result = await showFn(error.message, error.action.label);
		if (result === error.action.label) {
			await vscode.commands.executeCommand(error.action.command);
		}
	} else {
		await showFn(error.message);
	}

	// Log error
	console.error(`[TARX ${error.severity}] ${error.code || ''}: ${error.message}`);
}

/**
 * Common error messages
 */
export const UX_ERRORS = {
	dbNotFound: (): UXError => ({
		message: 'TARX database not found. Please initialize TARX first.',
		severity: 'error',
		code: 'DB_NOT_FOUND',
		action: { label: 'Initialize', command: 'tarx.init' }
	}),
	projectNotFound: (id: string): UXError => ({
		message: `Project "${id}" not found.`,
		severity: 'error',
		code: 'PROJECT_NOT_FOUND'
	}),
	sessionNotFound: (id: string): UXError => ({
		message: `Conversation "${id}" not found.`,
		severity: 'error',
		code: 'SESSION_NOT_FOUND'
	}),
	fileReadError: (path: string): UXError => ({
		message: `Failed to read file: ${path}`,
		severity: 'error',
		code: 'FILE_READ_ERROR'
	}),
	networkError: (): UXError => ({
		message: 'Network error. Please check your connection.',
		severity: 'warning',
		code: 'NETWORK_ERROR',
		action: { label: 'Retry', command: 'tarx.refresh' }
	}),
};

// ============================================================
// VALIDATION (Cycle 8)
// ============================================================

export interface ValidationResult {
	valid: boolean;
	errors: string[];
}

/**
 * Validate project name
 */
export function validateProjectName(name: string): ValidationResult {
	const errors: string[] = [];

	if (!name || name.trim().length === 0) {
		errors.push('Project name is required');
	} else if (name.length < 2) {
		errors.push('Project name must be at least 2 characters');
	} else if (name.length > 100) {
		errors.push('Project name must be less than 100 characters');
	} else if (!/^[a-zA-Z0-9\s\-_]+$/.test(name)) {
		errors.push('Project name can only contain letters, numbers, spaces, hyphens, and underscores');
	}

	return { valid: errors.length === 0, errors };
}

/**
 * Validate file path
 */
export function validateFilePath(filePath: string): ValidationResult {
	const errors: string[] = [];

	if (!filePath || filePath.trim().length === 0) {
		errors.push('File path is required');
	} else if (!path.isAbsolute(filePath)) {
		errors.push('File path must be absolute');
	} else if (!fs.existsSync(filePath)) {
		errors.push('File does not exist');
	}

	return { valid: errors.length === 0, errors };
}

/**
 * Validate instructions text
 */
export function validateInstructions(text: string): ValidationResult {
	const errors: string[] = [];

	if (text.length > 10000) {
		errors.push('Instructions must be less than 10,000 characters');
	}

	return { valid: errors.length === 0, errors };
}

// ============================================================
// DEBOUNCE & THROTTLE (Cycle 8)
// ============================================================

/**
 * Debounce function calls
 */
export function debounce<T extends (...args: any[]) => any>(
	fn: T,
	delay: number
): (...args: Parameters<T>) => void {
	let timeoutId: NodeJS.Timeout;

	return (...args: Parameters<T>) => {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => fn(...args), delay);
	};
}

/**
 * Throttle function calls
 */
export function throttle<T extends (...args: any[]) => any>(
	fn: T,
	limit: number
): (...args: Parameters<T>) => void {
	let inThrottle = false;

	return (...args: Parameters<T>) => {
		if (!inThrottle) {
			fn(...args);
			inThrottle = true;
			setTimeout(() => { inThrottle = false; }, limit);
		}
	};
}

/**
 * Debounced search handler
 */
export const debouncedSearch = debounce((query: string, callback: (results: any[]) => void) => {
	// Perform search
	console.log('[UX] Searching for:', query);
	callback([]);
}, 300);

// ============================================================
// CLIPBOARD UTILITIES (Cycle 9)
// ============================================================

/**
 * Copy text to clipboard with feedback
 */
export async function copyToClipboard(text: string, feedbackMessage?: string): Promise<void> {
	await vscode.env.clipboard.writeText(text);
	if (feedbackMessage) {
		vscode.window.showInformationMessage(feedbackMessage);
	}
}

/**
 * Copy session summary to clipboard
 */
export async function copySessionSummary(sessionId: string): Promise<void> {
	const sessions = queryDB<any>(`
		SELECT id, title, updated_at, model
		FROM sessions WHERE id = '${sessionId}' LIMIT 1;
	`);

	if (sessions.length === 0) {
		await showError(UX_ERRORS.sessionNotFound(sessionId));
		return;
	}

	const session = sessions[0];
	// Use messages table for session data
	const turns = queryDB<any>(`
		SELECT role, content FROM messages
		WHERE session_id = '${sessionId}' ORDER BY created_at ASC;
	`);

	const summary = [
		`# ${session.title || 'Untitled Conversation'}`,
		`Model: ${session.model || 'Unknown'}`,
		`Date: ${formatFullTime(session.updated_at)}`,
		`Messages: ${turns.length}`,
		'',
		'## Conversation',
		...turns.map((t: any) => `**${t.role}**: ${t.content.slice(0, 200)}${t.content.length > 200 ? '...' : ''}`)
	].join('\n');

	await copyToClipboard(summary, 'Session summary copied to clipboard');
}

/**
 * Copy project context to clipboard
 */
export async function copyProjectContext(projectId: string): Promise<void> {
	const projects = queryDB<any>(`
		SELECT id, name, instructions FROM projects WHERE id = '${projectId}' LIMIT 1;
	`);

	if (projects.length === 0) {
		await showError(UX_ERRORS.projectNotFound(projectId));
		return;
	}

	const project = projects[0];
	const files = queryDB<any>(`
		SELECT name, path FROM project_files WHERE project_id = '${projectId}';
	`);

	const context = [
		`# Project: ${project.name}`,
		'',
		'## Instructions',
		project.instructions || '(No instructions set)',
		'',
		'## Files',
		...files.map((f: any) => `- ${f.name}`),
	].join('\n');

	await copyToClipboard(context, 'Project context copied to clipboard');
}

// ============================================================
// EXPORT FUNCTIONALITY (Cycle 9)
// ============================================================

export type ExportFormat = 'json' | 'markdown' | 'txt';

/**
 * Export session to file
 */
export async function exportSession(sessionId: string, format: ExportFormat = 'markdown'): Promise<void> {
	const sessions = queryDB<any>(`
		SELECT id, title, updated_at, model
		FROM sessions WHERE id = '${sessionId}' LIMIT 1;
	`);

	if (sessions.length === 0) {
		await showError(UX_ERRORS.sessionNotFound(sessionId));
		return;
	}

	const session = sessions[0];
	// Note: conversation_turns uses conversation_id and created_at
	const turns = queryDB<any>(`
		SELECT role, content, created_at as timestamp FROM conversation_turns
		WHERE conversation_id = '${sessionId}' ORDER BY created_at ASC;
	`);

	let content: string;
	let extension: string;

	switch (format) {
		case 'json':
			content = JSON.stringify({ session, turns }, null, 2);
			extension = 'json';
			break;
		case 'txt':
			content = turns.map((t: any) => `[${t.role}]\n${t.content}\n`).join('\n---\n\n');
			extension = 'txt';
			break;
		case 'markdown':
		default:
			content = [
				`# ${session.title || 'Untitled'}`,
				`> Model: ${session.model || 'Unknown'} | Date: ${formatFullTime(session.updated_at)}`,
				'',
				...turns.map((t: any) => `## ${t.role === 'user' ? 'User' : 'Assistant'}\n\n${t.content}\n`)
			].join('\n');
			extension = 'md';
			break;
	}

	// Show save dialog
	const uri = await vscode.window.showSaveDialog({
		defaultUri: vscode.Uri.file(path.join(os.homedir(), `tarx-export-${session.id}.${extension}`)),
		filters: {
			[format.toUpperCase()]: [extension]
		}
	});

	if (uri) {
		fs.writeFileSync(uri.fsPath, content);
		vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
	}
}

/**
 * Export project data
 */
export async function exportProject(projectId: string): Promise<void> {
	const projects = queryDB<any>(`
		SELECT * FROM projects WHERE id = '${projectId}' LIMIT 1;
	`);

	if (projects.length === 0) {
		await showError(UX_ERRORS.projectNotFound(projectId));
		return;
	}

	const project = projects[0];
	const files = queryDB<any>(`SELECT * FROM project_files WHERE project_id = '${projectId}';`);
	const sessions = queryDB<any>(`SELECT * FROM sessions WHERE space_id = '${projectId}';`);

	const exportData = {
		project,
		files,
		sessions,
		exportedAt: new Date().toISOString()
	};

	const uri = await vscode.window.showSaveDialog({
		defaultUri: vscode.Uri.file(path.join(os.homedir(), `tarx-project-${project.name}.json`)),
		filters: { 'JSON': ['json'] }
	});

	if (uri) {
		fs.writeFileSync(uri.fsPath, JSON.stringify(exportData, null, 2));
		vscode.window.showInformationMessage(`Project exported to ${uri.fsPath}`);
	}
}

// ============================================================
// IMPORT FUNCTIONALITY (Cycle 9)
// ============================================================

/**
 * Import project from JSON
 */
export async function importProject(): Promise<void> {
	const uris = await vscode.window.showOpenDialog({
		canSelectMany: false,
		filters: { 'JSON': ['json'] },
		openLabel: 'Import Project'
	});

	if (!uris || uris.length === 0) return;

	try {
		const content = fs.readFileSync(uris[0].fsPath, 'utf8');
		const data = JSON.parse(content);

		if (!data.project || !data.project.name) {
			throw new Error('Invalid project export file');
		}

		// Generate new ID for imported project
		const newId = `proj_${Date.now()}`;

		// Insert project
		const escaped = (str: string) => (str || '').replace(/'/g, "''");
		execSync(`sqlite3 "${DB_PATH}"`, {
			input: `INSERT INTO projects (id, name, instructions, type, color, created_at, updated_at)
				VALUES ('${newId}', '${escaped(data.project.name)} (Imported)', '${escaped(data.project.instructions)}',
					'${data.project.type || 'general'}', '${data.project.color || '#00F0FF'}',
					strftime('%s', 'now'), strftime('%s', 'now'));`,
			encoding: 'utf8'
		});

		vscode.window.showInformationMessage(`Imported project: ${data.project.name}`);
		await vscode.commands.executeCommand('tarx.sections.refresh');
	} catch (e) {
		await showError({
			message: `Failed to import project: ${e}`,
			severity: 'error',
			code: 'IMPORT_ERROR'
		});
	}
}

// ============================================================
// CONFIRMATION DIALOGS (Cycle 10)
// ============================================================

export interface ConfirmOptions {
	title: string;
	message: string;
	confirmLabel?: string;
	cancelLabel?: string;
	destructive?: boolean;
}

/**
 * Show confirmation dialog
 */
export async function confirm(options: ConfirmOptions): Promise<boolean> {
	const confirmLabel = options.confirmLabel || 'Confirm';
	const result = await vscode.window.showWarningMessage(
		`${options.title}\n\n${options.message}`,
		{ modal: true },
		confirmLabel
	);
	return result === confirmLabel;
}

/**
 * Confirm deletion
 */
export async function confirmDelete(itemType: string, itemName: string): Promise<boolean> {
	return confirm({
		title: `Delete ${itemType}?`,
		message: `Are you sure you want to delete "${itemName}"? This action cannot be undone.`,
		confirmLabel: 'Delete',
		destructive: true
	});
}

/**
 * Delete project with confirmation
 */
export async function deleteProject(projectId: string): Promise<void> {
	const projects = queryDB<any>(`SELECT name FROM projects WHERE id = '${projectId}' LIMIT 1;`);
	if (projects.length === 0) {
		await showError(UX_ERRORS.projectNotFound(projectId));
		return;
	}

	const confirmed = await confirmDelete('project', projects[0].name);
	if (!confirmed) return;

	try {
		execSync(`sqlite3 "${DB_PATH}"`, {
			input: `DELETE FROM project_files WHERE project_id = '${projectId}';
				DELETE FROM sessions WHERE space_id = '${projectId}';
				DELETE FROM projects WHERE id = '${projectId}';`,
			encoding: 'utf8'
		});

		vscode.window.showInformationMessage(`Project "${projects[0].name}" deleted`);
		await vscode.commands.executeCommand('tarx.sections.refresh');
	} catch (e) {
		await showError({ message: `Failed to delete project: ${e}`, severity: 'error' });
	}
}

/**
 * Delete session with confirmation
 */
export async function deleteSession(sessionId: string): Promise<void> {
	const sessions = queryDB<any>(`SELECT title FROM sessions WHERE id = '${sessionId}' LIMIT 1;`);
	if (sessions.length === 0) {
		await showError(UX_ERRORS.sessionNotFound(sessionId));
		return;
	}

	const confirmed = await confirmDelete('conversation', sessions[0].title || 'Untitled');
	if (!confirmed) return;

	try {
		// Delete from messages (session data) - conversation_turns is for old conversations schema
		execSync(`sqlite3 "${DB_PATH}"`, {
			input: `DELETE FROM messages WHERE session_id = '${sessionId}';
				DELETE FROM sessions WHERE id = '${sessionId}';`,
			encoding: 'utf8'
		});

		vscode.window.showInformationMessage('Conversation deleted');
		await vscode.commands.executeCommand('tarx.sections.refresh');
	} catch (e) {
		await showError({ message: `Failed to delete conversation: ${e}`, severity: 'error' });
	}
}

/**
 * Remove file from project with confirmation
 */
export async function removeFile(projectId: string, filePath: string): Promise<void> {
	const fileName = path.basename(filePath);
	const confirmed = await confirm({
		title: 'Remove file from project?',
		message: `Remove "${fileName}" from this project? The file will not be deleted from disk.`,
		confirmLabel: 'Remove'
	});

	if (!confirmed) return;

	try {
		const escaped = filePath.replace(/'/g, "''");
		execSync(`sqlite3 "${DB_PATH}"`, {
			input: `DELETE FROM project_files WHERE project_id = '${projectId}' AND path = '${escaped}';`,
			encoding: 'utf8'
		});

		vscode.window.showInformationMessage(`Removed ${fileName} from project`);
		await vscode.commands.executeCommand('tarx.sections.refresh');
	} catch (e) {
		await showError({ message: `Failed to remove file: ${e}`, severity: 'error' });
	}
}

// ============================================================
// FINAL COMMAND REGISTRATION (Cycle 10)
// ============================================================

/**
 * Register all additional UX commands
 */
export function registerAllUXCommands(context: vscode.ExtensionContext): void {
	// Already registered in registerUXCommands:
	// - tarx.ux.openHistory
	// - tarx.ux.openFile
	// - tarx.ux.injectFile
	// - tarx.ux.editInstructions
	// - tarx.showQuickActions
	// - tarx.commands

	// Additional commands (Cycle 9-10)
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.copySessionSummary', copySessionSummary),
		vscode.commands.registerCommand('tarx.copyProjectContext', copyProjectContext),
		vscode.commands.registerCommand('tarx.exportSession', (sessionId: string) => exportSession(sessionId, 'markdown')),
		vscode.commands.registerCommand('tarx.exportProject', exportProject),
		vscode.commands.registerCommand('tarx.importProject', importProject),
		vscode.commands.registerCommand('tarx.deleteProject', deleteProject),
		vscode.commands.registerCommand('tarx.deleteSession', deleteSession),
		vscode.commands.registerCommand('tarx.removeFile', removeFile),
	);

	logUXCycle('Additional UX commands registered (Cycle 10): export, import, delete, copy');
	console.log('[TARX] All UX commands registered');
}

// ============================================================
// INLINE RENAME (Cycle 11)
// ============================================================

/**
 * Show inline input box for renaming
 */
export async function inlineRename(
	currentName: string,
	itemType: 'project' | 'session',
	itemId: string
): Promise<void> {
	const newName = await vscode.window.showInputBox({
		value: currentName,
		prompt: `Rename ${itemType}`,
		placeHolder: `Enter new ${itemType} name`,
		validateInput: (value) => {
			const result = validateProjectName(value);
			return result.valid ? null : result.errors[0];
		}
	});

	if (!newName || newName === currentName) return;

	try {
		const escaped = newName.replace(/'/g, "''");
		const table = itemType === 'project' ? 'projects' : 'sessions';
		const field = itemType === 'project' ? 'name' : 'title';

		execSync(`sqlite3 "${DB_PATH}"`, {
			input: `UPDATE ${table} SET ${field} = '${escaped}', updated_at = strftime('%s', 'now') WHERE id = '${itemId}';`,
			encoding: 'utf8'
		});

		vscode.window.showInformationMessage(`Renamed to "${newName}"`);
		await vscode.commands.executeCommand('tarx.sections.refresh');
	} catch (e) {
		await showError({ message: `Failed to rename: ${e}`, severity: 'error' });
	}
}

// ============================================================
// CONTEXT MENU CONTRIBUTIONS (Cycle 11)
// ============================================================

/**
 * Generate package.json menu contributions for context menus
 */
export function getMenuContributions(): object {
	return {
		'view/item/context': [
			// Project context menu
			{
				command: 'tarx.openProject',
				when: 'viewItem == project || viewItem == activeProject',
				group: 'navigation'
			},
			{
				command: 'tarx.ux.editInstructions',
				when: 'viewItem == project || viewItem == activeProject',
				group: '1_modify@1'
			},
			{
				command: 'tarx.editProjectColor',
				when: 'viewItem == project || viewItem == activeProject',
				group: '1_modify@2'
			},
			{
				command: 'tarx.renameProject',
				when: 'viewItem == project || viewItem == activeProject',
				group: '1_modify@3'
			},
			{
				command: 'tarx.exportProject',
				when: 'viewItem == project || viewItem == activeProject',
				group: '2_export'
			},
			{
				command: 'tarx.deleteProject',
				when: 'viewItem == project || viewItem == activeProject',
				group: 'z_danger'
			},
			// History context menu
			{
				command: 'tarx.ux.openHistory',
				when: 'viewItem == historyItem',
				group: 'navigation'
			},
			{
				command: 'tarx.renameSession',
				when: 'viewItem == historyItem',
				group: '1_modify'
			},
			{
				command: 'tarx.copySessionSummary',
				when: 'viewItem == historyItem',
				group: '2_clipboard'
			},
			{
				command: 'tarx.exportSession',
				when: 'viewItem == historyItem',
				group: '3_export'
			},
			{
				command: 'tarx.deleteSession',
				when: 'viewItem == historyItem',
				group: 'z_danger'
			},
			// File context menu
			{
				command: 'tarx.ux.openFile',
				when: 'viewItem == fileItem',
				group: 'navigation'
			},
			{
				command: 'tarx.ux.injectFile',
				when: 'viewItem == fileItem',
				group: '1_ai'
			},
			{
				command: 'tarx.removeFile',
				when: 'viewItem == fileItem',
				group: 'z_danger'
			}
		],
		'view/title': [
			{
				command: 'tarx.createProject',
				when: 'view == tarx.projectSections',
				group: 'navigation@1'
			},
			{
				command: 'tarx.importProject',
				when: 'view == tarx.projectSections',
				group: 'navigation@2'
			},
			{
				command: 'tarx.sections.refresh',
				when: 'view == tarx.projectSections',
				group: 'navigation@3'
			}
		]
	};
}

// ============================================================
// KEYBOARD SHORTCUTS CONFIG (Cycle 11)
// ============================================================

/**
 * Generate keybindings for package.json
 */
export function getKeybindingContributions(): object[] {
	return [
		{
			command: 'tarx.newChat',
			key: 'ctrl+n',
			mac: 'cmd+n',
			when: 'view.tarx.projectSections.visible'
		},
		{
			command: 'tarx.createProject',
			key: 'ctrl+shift+n',
			mac: 'cmd+shift+n',
			when: 'view.tarx.projectSections.visible'
		},
		{
			command: 'tarx.sections.refresh',
			key: 'ctrl+r',
			mac: 'cmd+r',
			when: 'view.tarx.projectSections.visible'
		},
		{
			command: 'tarx.showQuickActions',
			key: 'ctrl+shift+p',
			mac: 'cmd+shift+p',
			when: 'view.tarx.projectSections.visible'
		},
		{
			command: 'tarx.ux.injectFile',
			key: 'ctrl+enter',
			mac: 'cmd+enter',
			when: 'viewItem == fileItem && view.tarx.projectSections.visible'
		}
	];
}

// ============================================================
// TREE ITEM PROVIDER HELPERS (Cycle 11)
// ============================================================

export interface TreeItemOptions {
	icon?: keyof typeof TARX_ICONS;
	iconColor?: string;
	description?: string;
	tooltip?: string | vscode.MarkdownString;
	command?: vscode.Command;
	contextValue?: string;
	collapsible?: vscode.TreeItemCollapsibleState;
}

/**
 * Create a tree item with standard options
 */
export function createTreeItem(
	label: string,
	options: TreeItemOptions = {}
): vscode.TreeItem {
	const item = new vscode.TreeItem(
		label,
		options.collapsible ?? vscode.TreeItemCollapsibleState.None
	);

	if (options.icon) {
		item.iconPath = getIcon(options.icon, options.iconColor);
	}

	if (options.description) {
		item.description = options.description;
	}

	if (options.tooltip) {
		item.tooltip = options.tooltip;
	}

	if (options.command) {
		item.command = options.command;
	}

	if (options.contextValue) {
		item.contextValue = options.contextValue;
	}

	return item;
}

/**
 * Create section header tree item
 */
export function createSectionHeader(
	config: SectionConfig,
	expanded: boolean
): vscode.TreeItem {
	const item = createTreeItem(config.label, {
		icon: config.icon,
		description: config.description,
		collapsible: expanded
			? vscode.TreeItemCollapsibleState.Expanded
			: vscode.TreeItemCollapsibleState.Collapsed,
		contextValue: `section-${config.id}`
	});

	item.tooltip = new vscode.MarkdownString(
		`**${config.label}**\n\n${config.description}\n\n*Click to ${expanded ? 'collapse' : 'expand'}*`
	);

	return item;
}

// ============================================================
// TREE DATA PROVIDER BASE (Cycle 12)
// ============================================================

/**
 * Base class for TARX tree data providers
 */
export abstract class TarxTreeProvider<T extends vscode.TreeItem> implements vscode.TreeDataProvider<T> {
	protected _onDidChangeTreeData = new vscode.EventEmitter<T | undefined | null | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	protected items: T[] = [];
	protected isLoading = false;

	/**
	 * Refresh the tree view
	 */
	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	/**
	 * Refresh a specific item
	 */
	refreshItem(item: T): void {
		this._onDidChangeTreeData.fire(item);
	}

	/**
	 * Get tree item representation
	 */
	getTreeItem(element: T): vscode.TreeItem {
		return element;
	}

	/**
	 * Get children - implement in subclass
	 */
	abstract getChildren(element?: T): vscode.ProviderResult<T[]>;

	/**
	 * Get parent - optional
	 */
	getParent?(element: T): vscode.ProviderResult<T>;
}

/**
 * Project sections tree provider
 */
export class ProjectSectionsProvider extends TarxTreeProvider<UXTreeItem> {
	private activeProjectId: string | undefined;
	private expandedSections: Set<string> = new Set(['instructions', 'files', 'conversations']);

	constructor(private context: vscode.ExtensionContext) {
		super();
		this.loadState();
	}

	private async loadState(): Promise<void> {
		const state = await getSidebarState(this.context);
		this.expandedSections = new Set(
			Object.entries(state.expandedSections)
				.filter(([, expanded]) => expanded)
				.map(([id]) => id)
		);
		this.activeProjectId = state.selectedProject;
	}

	setActiveProject(projectId: string): void {
		this.activeProjectId = projectId;
		saveSelectedProject(this.context, projectId);
		this.refresh();
	}

	toggleSection(sectionId: string): void {
		if (this.expandedSections.has(sectionId)) {
			this.expandedSections.delete(sectionId);
			saveSectionState(this.context, sectionId, false);
		} else {
			this.expandedSections.add(sectionId);
			saveSectionState(this.context, sectionId, true);
		}
		this.refresh();
	}

	async getChildren(element?: UXTreeItem): Promise<UXTreeItem[]> {
		if (!element) {
			// Root level - show sections
			if (!this.activeProjectId) {
				return [new UXTreeItem('Select a project', 'action', vscode.TreeItemCollapsibleState.None, {
					icon: 'project',
					command: 'tarx.openProject'
				})];
			}

			return SECTION_CONFIGS.map(config => {
				const expanded = this.expandedSections.has(config.id);
				return new UXTreeItem(
					config.label,
					'section',
					expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
					{ sectionId: config.id }
				);
			});
		}

		// Section children
		if (element.itemType === 'section' && element.data?.sectionId) {
			const sectionId = element.data.sectionId as SectionId;

			switch (sectionId) {
				case 'instructions':
					return this.getInstructionsItems();
				case 'files':
					return buildFileItems(this.activeProjectId!);
				case 'conversations':
					return buildHistoryItems(this.activeProjectId!);
				case 'memory':
					return buildMemoryItems(this.activeProjectId!);
			}
		}

		return [];
	}

	private async getInstructionsItems(): Promise<UXTreeItem[]> {
		const projects = queryDB<any>(`
			SELECT instructions FROM projects WHERE id = '${this.activeProjectId}' LIMIT 1;
		`);

		const instructions = projects[0]?.instructions || '';
		if (!instructions) {
			return [new UXTreeItem('Click to add instructions', 'action', vscode.TreeItemCollapsibleState.None, {
				icon: 'add',
				command: 'tarx.ux.editInstructions',
				args: [this.activeProjectId]
			})];
		}

		// Show preview of instructions
		const preview = instructions.slice(0, 100) + (instructions.length > 100 ? '...' : '');
		return [new UXTreeItem(preview, 'action', vscode.TreeItemCollapsibleState.None, {
			icon: 'instructions',
			command: 'tarx.ux.editInstructions',
			args: [this.activeProjectId]
		})];
	}
}

// ============================================================
// REVEAL & FOCUS (Cycle 12)
// ============================================================

/**
 * Reveal item in tree view
 */
export async function revealInTree(
	view: vscode.TreeView<UXTreeItem>,
	item: UXTreeItem,
	options?: { select?: boolean; focus?: boolean; expand?: boolean }
): Promise<void> {
	try {
		await view.reveal(item, {
			select: options?.select ?? true,
			focus: options?.focus ?? false,
			expand: options?.expand ?? false
		});
	} catch (e) {
		console.error('[UX] Failed to reveal item:', e);
	}
}

/**
 * Focus sidebar view
 */
export async function focusSidebar(): Promise<void> {
	await vscode.commands.executeCommand('tarx.projectSections.focus');
}

// ============================================================
// SCROLL TO (Cycle 12)
// ============================================================

/**
 * Send scroll message to webview
 */
export function scrollToItem(webview: vscode.Webview, itemId: string): void {
	webview.postMessage({
		type: 'scrollTo',
		payload: { itemId }
	});
}

/**
 * Scroll to top
 */
export function scrollToTop(webview: vscode.Webview): void {
	webview.postMessage({
		type: 'scrollTo',
		payload: { position: 'top' }
	});
}

/**
 * Scroll to bottom
 */
export function scrollToBottom(webview: vscode.Webview): void {
	webview.postMessage({
		type: 'scrollTo',
		payload: { position: 'bottom' }
	});
}

// ============================================================
// WEBVIEW HTML GENERATION (Cycle 13)
// ============================================================

/**
 * Generate webview HTML for sidebar
 */
export function generateSidebarHTML(
	webview: vscode.Webview,
	extensionUri: vscode.Uri,
	state: SidebarState
): string {
	// Get URIs for resources
	const scriptUri = webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'sidebar.js')
	);
	const styleUri = webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'sidebar.css')
	);

	const nonce = getNonce();

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<link href="${styleUri}" rel="stylesheet">
	<title>TARX Sidebar</title>
	<style>${getAllUXStyles()}</style>
</head>
<body>
	<div id="tarx-sidebar" class="tarx-sidebar" role="tree" aria-label="${ARIA_LABELS.projectList}">
		<div id="loading" class="tarx-loading">
			<div class="tarx-skeleton" style="width: 80%; height: 24px; margin-bottom: 8px;"></div>
			<div class="tarx-skeleton" style="width: 60%; height: 24px; margin-bottom: 8px;"></div>
			<div class="tarx-skeleton" style="width: 70%; height: 24px;"></div>
		</div>
		<div id="content" style="display: none;"></div>
		<div id="empty" class="tarx-empty" style="display: none;">
			<span class="codicon codicon-folder-library"></span>
			<p>No project selected</p>
			<button class="tarx-button" onclick="selectProject()">Select Project</button>
		</div>
	</div>
	<script nonce="${nonce}">
		const vscode = acquireVsCodeApi();
		const state = ${JSON.stringify(state)};

		// Initialize
		document.addEventListener('DOMContentLoaded', () => {
			vscode.postMessage({ type: 'ready' });
		});

		// Handle messages from extension
		window.addEventListener('message', event => {
			const message = event.data;
			switch (message.type) {
				case 'state':
					updateState(message.payload);
					break;
				case 'refresh':
					vscode.postMessage({ type: 'ready' });
					break;
				case 'scrollTo':
					handleScroll(message.payload);
					break;
			}
		});

		function updateState(newState) {
			Object.assign(state, newState);
			document.getElementById('loading').style.display = 'none';
			document.getElementById('content').style.display = 'block';
		}

		function handleScroll(payload) {
			if (payload.itemId) {
				const el = document.getElementById(payload.itemId);
				if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
			} else if (payload.position === 'top') {
				document.getElementById('tarx-sidebar').scrollTop = 0;
			} else if (payload.position === 'bottom') {
				const sidebar = document.getElementById('tarx-sidebar');
				sidebar.scrollTop = sidebar.scrollHeight;
			}
		}

		function selectProject() {
			vscode.postMessage({ type: 'selectItem', payload: { type: 'action', id: 'selectProject' } });
		}
	</script>
	<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

/**
 * Generate nonce for CSP
 */
function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

// ============================================================
// SECTION HTML GENERATION (Cycle 13)
// ============================================================

/**
 * Generate HTML for a section
 */
export function generateSectionHTML(
	config: SectionConfig,
	items: UXTreeItem[],
	expanded: boolean
): string {
	const chevron = expanded ? 'chevron-down' : 'chevron-right';

	return `
<div class="tarx-section ${expanded ? 'expanded' : ''}" id="section-${config.id}">
	<div class="tarx-section-header"
		 role="treeitem"
		 aria-expanded="${expanded}"
		 aria-label="${ARIA_LABELS[`section${config.id.charAt(0).toUpperCase() + config.id.slice(1)}` as keyof typeof ARIA_LABELS]}"
		 onclick="toggleSection('${config.id}')">
		<span class="codicon codicon-${chevron} tarx-chevron"></span>
		<span class="codicon codicon-${TARX_ICONS[config.icon]}" style="color: ${config.color};"></span>
		<span class="tarx-section-label">${config.label}</span>
		<span class="tarx-section-count">${items.length}</span>
	</div>
	<div class="tarx-section-content" role="group" ${expanded ? '' : 'style="display: none;"'}>
		${items.map(item => generateItemHTML(item)).join('')}
	</div>
</div>`;
}

/**
 * Generate HTML for a tree item
 */
export function generateItemHTML(item: UXTreeItem): string {
	const label = typeof item.label === 'string' ? item.label : item.label?.label || '';
	const description = item.description?.toString() || '';
	const icon = item.iconPath instanceof vscode.ThemeIcon ? item.iconPath.id : 'file';

	const classList = ['tarx-item', `tarx-${item.itemType}-item`];
	if (item.contextValue === 'activeProject') {
		classList.push('active');
	}

	return `
<div class="${classList.join(' ')}"
	 id="item-${item.data?.id || ''}"
	 role="treeitem"
	 aria-label="${label}${description ? `, ${description}` : ''}"
	 onclick="selectItem('${item.itemType}', '${item.data?.id || ''}')"
	 oncontextmenu="showContextMenu(event, '${item.itemType}', '${item.data?.id || ''}')">
	<span class="codicon codicon-${icon} tarx-icon"></span>
	<span class="tarx-item-label">${label}</span>
	${description ? `<span class="tarx-item-description">${description}</span>` : ''}
</div>`;
}

// ============================================================
// PROJECT CARD HTML (Cycle 13)
// ============================================================

/**
 * Generate project card HTML
 */
export function generateProjectCardHTML(project: {
	id: string;
	name: string;
	type: string;
	color: string;
	sessionCount: number;
	lastActive?: string;
}): string {
	return `
<div class="tarx-project-card"
	 style="--project-color: ${project.color};"
	 onclick="selectProject('${project.id}')"
	 oncontextmenu="showContextMenu(event, 'project', '${project.id}')">
	<div class="tarx-project-icon" style="background: ${project.color}20;">
		<span class="codicon codicon-folder-library" style="color: ${project.color};"></span>
	</div>
	<div class="tarx-project-info">
		<div class="tarx-project-name">${project.name}</div>
		<div class="tarx-project-meta">
			<span class="tarx-project-type">${project.type}</span>
			<span class="tarx-project-sessions">${project.sessionCount} chats</span>
		</div>
	</div>
	${project.lastActive ? `<div class="tarx-project-time">${project.lastActive}</div>` : ''}
</div>`;
}

// ============================================================
// UX LOGGING
// ============================================================

let uxCycleCount = 0;

export function logUXCycle(message: string, codePath?: string): void {
	uxCycleCount++;
	try {
		const logPath = path.join(os.homedir(), 'TARX', 'sidebar-ux-log.txt');
		const timestamp = new Date().toISOString();
		let entry = `[${timestamp}] [UX Cycle ${uxCycleCount}] ${message}`;
		if (codePath) {
			entry += `\n  Path: ${codePath}`;
		}
		entry += '\n';
		fs.appendFileSync(logPath, entry);
	} catch (e) {
		console.error('[UX] Failed to log:', e);
	}
}

// All exports are inline above
