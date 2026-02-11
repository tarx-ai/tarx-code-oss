/**
 * TARX Sidebar Icons & Hover States
 * Shadcn-inspired minimal styling with vscode.ThemeIcon
 *
 * @file extensions/tarx/src/sidebar-icons-hover.ts
 */

import * as vscode from 'vscode';

// ========================================
// ICON DEFINITIONS
// ========================================

export const TARX_ICONS = {
	// Section icons - Core sidebar sections
	projects: new vscode.ThemeIcon('folder', new vscode.ThemeColor('charts.blue')),
	projectsOpen: new vscode.ThemeIcon('folder-opened', new vscode.ThemeColor('charts.blue')),
	history: new vscode.ThemeIcon('history', new vscode.ThemeColor('charts.purple')),
	skills: new vscode.ThemeIcon('lightbulb', new vscode.ThemeColor('charts.yellow')),
	skillsAuto: new vscode.ThemeIcon('sparkle', new vscode.ThemeColor('charts.yellow')),
	conversations: new vscode.ThemeIcon('comment-discussion', new vscode.ThemeColor('charts.green')),
	files: new vscode.ThemeIcon('file-code', new vscode.ThemeColor('charts.orange')),
	memory: new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.purple')),
	instructions: new vscode.ThemeIcon('book', new vscode.ThemeColor('charts.blue')),

	// Project state icons
	projectActive: new vscode.ThemeIcon('folder-opened', new vscode.ThemeColor('charts.green')),
	projectInactive: new vscode.ThemeIcon('folder', new vscode.ThemeColor('foreground')),

	// Session icons
	sessionRecent: new vscode.ThemeIcon('comment-discussion', new vscode.ThemeColor('charts.blue')),
	sessionOld: new vscode.ThemeIcon('comment', new vscode.ThemeColor('descriptionForeground')),

	// File type icons
	fileTs: new vscode.ThemeIcon('symbol-method', new vscode.ThemeColor('charts.blue')),
	filePy: new vscode.ThemeIcon('symbol-misc', new vscode.ThemeColor('charts.yellow')),
	fileRust: new vscode.ThemeIcon('symbol-struct', new vscode.ThemeColor('charts.orange')),
	fileJson: new vscode.ThemeIcon('json', new vscode.ThemeColor('charts.yellow')),
	fileMd: new vscode.ThemeIcon('markdown', new vscode.ThemeColor('charts.blue')),
	fileGeneric: new vscode.ThemeIcon('file', new vscode.ThemeColor('foreground')),

	// Action icons
	add: new vscode.ThemeIcon('add', new vscode.ThemeColor('charts.green')),
	refresh: new vscode.ThemeIcon('refresh'),
	settings: new vscode.ThemeIcon('gear'),
	search: new vscode.ThemeIcon('search'),
	color: new vscode.ThemeIcon('symbol-color'),
	expand: new vscode.ThemeIcon('chevron-right'),
	collapse: new vscode.ThemeIcon('chevron-down'),
	trash: new vscode.ThemeIcon('trash', new vscode.ThemeColor('charts.red')),
	edit: new vscode.ThemeIcon('edit'),
	copy: new vscode.ThemeIcon('copy'),

	// Status icons
	loading: new vscode.ThemeIcon('loading~spin'),
	error: new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red')),
	success: new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green')),
	warning: new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.orange')),
	info: new vscode.ThemeIcon('info', new vscode.ThemeColor('charts.blue')),
};

// ========================================
// TREE ITEM BASE CLASS
// ========================================

export type SidebarItemType = 'section' | 'project' | 'session' | 'skill' | 'action';

export interface SidebarItemOptions {
	id: string;
	label: string;
	type: SidebarItemType;
	icon?: vscode.ThemeIcon;
	description?: string;
	tooltip?: string | vscode.MarkdownString;
	contextValue?: string;
	command?: vscode.Command;
	collapsibleState?: vscode.TreeItemCollapsibleState;
	isActive?: boolean;
	color?: string;
}

/**
 * Enhanced TreeItem with Shadcn-style presentation
 */
export class SidebarTreeItem extends vscode.TreeItem {
	public readonly itemType: SidebarItemType;
	public readonly itemId: string;
	public isActive: boolean;
	public itemColor?: string;

	constructor(options: SidebarItemOptions) {
		super(
			options.label,
			options.collapsibleState ?? vscode.TreeItemCollapsibleState.None
		);

		this.itemId = options.id;
		this.itemType = options.type;
		this.isActive = options.isActive ?? false;
		this.itemColor = options.color;

		// Set icon based on type and state
		this.iconPath = options.icon ?? this._getDefaultIcon();

		// Set description (shows to the right of label)
		this.description = options.description;

		// Set tooltip with markdown support
		this.tooltip = options.tooltip ?? this._buildTooltip();

		// Set context value for menu contributions
		this.contextValue = options.contextValue ?? this._getContextValue();

		// Set command
		this.command = options.command;
	}

	private _getDefaultIcon(): vscode.ThemeIcon {
		switch (this.itemType) {
			case 'section':
				return TARX_ICONS.projects;
			case 'project':
				return this.isActive ? TARX_ICONS.projectActive : TARX_ICONS.projectInactive;
			case 'session':
				return TARX_ICONS.sessionRecent;
			case 'skill':
				return TARX_ICONS.skills;
			case 'action':
				return TARX_ICONS.add;
			default:
				return new vscode.ThemeIcon('circle-outline');
		}
	}

	private _buildTooltip(): vscode.MarkdownString {
		const md = new vscode.MarkdownString();
		md.supportHtml = true;

		switch (this.itemType) {
			case 'project':
				md.appendMarkdown(`**${this.label}**\n\n`);
				if (this.isActive) {
					md.appendMarkdown('$(check) Active project\n\n');
				}
				if (this.description) {
					md.appendMarkdown(`_${this.description}_`);
				}
				break;
			case 'session':
				md.appendMarkdown(`**${this.label}**\n\n`);
				if (this.description) {
					md.appendMarkdown(`Last updated: ${this.description}`);
				}
				break;
			default:
				md.appendText(this.label?.toString() ?? '');
		}

		return md;
	}

	private _getContextValue(): string {
		if (this.itemType === 'project') {
			return this.isActive ? 'activeProject' : 'project';
		}
		return this.itemType;
	}
}

// ========================================
// SECTION HEADER ITEMS
// ========================================

export class ProjectsSectionItem extends SidebarTreeItem {
	constructor(projectCount: number = 0) {
		super({
			id: 'section-projects',
			label: 'PROJECTS',
			type: 'section',
			icon: TARX_ICONS.projects,
			description: projectCount > 0 ? `${projectCount}` : undefined,
			collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
			contextValue: 'projectsSection'
		});
	}
}

export class HistorySectionItem extends SidebarTreeItem {
	constructor(sessionCount: number = 0) {
		super({
			id: 'section-history',
			label: 'HISTORY',
			type: 'section',
			icon: TARX_ICONS.history,
			description: sessionCount > 0 ? `${sessionCount}` : undefined,
			collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
			contextValue: 'historySection'
		});
	}
}

export class SkillsSectionItem extends SidebarTreeItem {
	constructor(skillCount: number = 0) {
		super({
			id: 'section-skills',
			label: 'SKILLS',
			type: 'section',
			icon: TARX_ICONS.skills,
			description: skillCount > 0 ? `${skillCount}` : undefined,
			collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
			contextValue: 'skillsSection'
		});
	}
}

export class ConversationsSectionItem extends SidebarTreeItem {
	constructor(count: number = 0) {
		super({
			id: 'section-conversations',
			label: 'CONVERSATIONS',
			type: 'section',
			icon: TARX_ICONS.conversations,
			description: count > 0 ? `${count}` : undefined,
			collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
			contextValue: 'conversationsSection'
		});
	}
}

export class FilesSectionItem extends SidebarTreeItem {
	constructor(count: number = 0) {
		super({
			id: 'section-files',
			label: 'FILES',
			type: 'section',
			icon: TARX_ICONS.files,
			description: count > 0 ? `${count}` : undefined,
			collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
			contextValue: 'filesSection'
		});
	}
}

export class MemorySectionItem extends SidebarTreeItem {
	constructor(count: number = 0) {
		super({
			id: 'section-memory',
			label: 'MEMORY',
			type: 'section',
			icon: TARX_ICONS.memory,
			description: count > 0 ? `${count}` : undefined,
			collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
			contextValue: 'memorySection'
		});
	}
}

export class InstructionsSectionItem extends SidebarTreeItem {
	constructor(count: number = 0) {
		super({
			id: 'section-instructions',
			label: 'INSTRUCTIONS',
			type: 'section',
			icon: TARX_ICONS.instructions,
			description: count > 0 ? `${count}` : undefined,
			collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
			contextValue: 'instructionsSection'
		});
	}
}

// ========================================
// PROJECT ITEM
// ========================================

export interface ProjectItemData {
	id: string;
	name: string;
	path: string;
	isActive: boolean;
	color?: string;
	lastOpened?: number;
}

export class ProjectTreeItem extends SidebarTreeItem {
	public readonly projectPath: string;

	constructor(data: ProjectItemData) {
		const icon = getColoredProjectIcon(data.color, data.isActive);

		super({
			id: data.id,
			label: data.name,
			type: 'project',
			icon,
			description: data.isActive ? '● Active' : undefined,
			isActive: data.isActive,
			color: data.color,
			contextValue: data.isActive ? 'activeProject' : 'project',
			command: {
				command: 'tarx.setActiveProject',
				title: 'Set Active',
				arguments: [data.id]
			}
		});

		this.projectPath = data.path;
		this.resourceUri = vscode.Uri.file(data.path);
	}
}

// ========================================
// SESSION ITEM
// ========================================

export interface SessionItemData {
	id: string;
	title: string;
	updatedAt: number;
	messageCount?: number;
	model?: string;
}

export class SessionTreeItem extends SidebarTreeItem {
	constructor(data: SessionItemData) {
		const timeAgo = formatTimeAgo(data.updatedAt);
		const isRecent = Date.now() - data.updatedAt < 24 * 60 * 60 * 1000; // 24 hours

		super({
			id: data.id,
			label: data.title || 'Untitled',
			type: 'session',
			icon: isRecent ? TARX_ICONS.sessionRecent : TARX_ICONS.sessionOld,
			description: timeAgo,
			contextValue: 'session',
			command: {
				command: 'tarx.openSession',
				title: 'Open Session',
				arguments: [data.id]
			}
		});
	}
}

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Get colored folder icon for project
 */
export function getColoredProjectIcon(color: string | undefined, isActive: boolean): vscode.ThemeIcon {
	const colorMap: Record<string, string> = {
		'#0066FF': 'charts.blue',
		'#10B981': 'charts.green',
		'#8B5CF6': 'charts.purple',
		'#F97316': 'charts.orange',
		'#EC4899': 'charts.red',
		'#06B6D4': 'charts.blue',
		'#EAB308': 'charts.yellow',
		'#EF4444': 'charts.red',
	};

	const themeColor = color ? (colorMap[color] || 'charts.blue') : 'foreground';
	const iconName = isActive ? 'folder-opened' : 'folder';

	return new vscode.ThemeIcon(iconName, new vscode.ThemeColor(themeColor));
}

/**
 * Format timestamp to relative time
 */
function formatTimeAgo(timestamp: number): string {
	const seconds = Math.floor((Date.now() - timestamp) / 1000);

	if (seconds < 60) return 'just now';
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
	if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

	return new Date(timestamp).toLocaleDateString();
}

// ========================================
// CSS FOR WEBVIEW (Shadcn-inspired)
// ========================================

export const SIDEBAR_HOVER_CSS = `
/* ========================================
   TARX Sidebar Hover States
   Shadcn-inspired with electric blue accents
   Dark theme: #1A1D3A base → #2A2D4A hover
   ======================================== */

:root {
	--electric-blue: #00F0FF;
	--electric-blue-rgb: 0, 240, 255;
	--tarx-bg-base: #1A1D3A;
	--tarx-bg-hover: #2A2D4A;
	--tarx-bg-active: #3A3D5A;
	--hover-bg-light: rgba(0, 0, 0, 0.06);
	--hover-bg-dark: #2A2D4A;
	--focus-ring-width: 2px;
	--transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* Base tree item */
.tarx-tree-item {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 12px;
	border-radius: 6px;
	cursor: pointer;
	background: transparent;
	transition:
		background-color var(--transition-fast),
		transform var(--transition-fast),
		box-shadow var(--transition-fast);
	user-select: none;
}

/* Hover state - higher contrast with scale */
.tarx-tree-item:hover {
	background: var(--hover-bg-light);
	transform: scale(1.02);
}

.vscode-dark .tarx-tree-item:hover,
[data-vscode-theme-kind="vscode-dark"] .tarx-tree-item:hover {
	background: var(--tarx-bg-hover);
}

/* Focus state - electric blue ring */
.tarx-tree-item:focus,
.tarx-tree-item:focus-visible {
	outline: none;
	box-shadow:
		0 0 0 var(--focus-ring-width) var(--background),
		0 0 0 calc(var(--focus-ring-width) + 2px) var(--electric-blue);
}

/* Active/selected state */
.tarx-tree-item.active,
.tarx-tree-item[data-active="true"] {
	background: rgba(var(--electric-blue-rgb), 0.1);
	border-left: 3px solid var(--electric-blue);
	padding-left: 9px;
}

/* Section headers */
.tarx-section-header {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 12px;
	font-size: 11px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	color: var(--muted-foreground);
	cursor: pointer;
	border-radius: 6px;
	transition:
		background-color var(--transition-fast),
		transform var(--transition-fast);
}

.tarx-section-header:hover {
	background: var(--hover-bg-light);
	transform: scale(1.02);
}

.vscode-dark .tarx-section-header:hover {
	background: var(--tarx-bg-hover);
}

/* Section header focus ring */
.tarx-section-header:focus,
.tarx-section-header:focus-visible {
	outline: none;
	box-shadow:
		0 0 0 var(--focus-ring-width) var(--background, #1A1D3A),
		0 0 0 calc(var(--focus-ring-width) + 2px) var(--electric-blue);
}

/* Section-specific icon colors */
.tarx-section-header[data-section="projects"] .tarx-section-icon { color: #60A5FA; }
.tarx-section-header[data-section="history"] .tarx-section-icon { color: #A78BFA; }
.tarx-section-header[data-section="skills"] .tarx-section-icon { color: #FBBF24; }
.tarx-section-header[data-section="conversations"] .tarx-section-icon { color: #34D399; }
.tarx-section-header[data-section="files"] .tarx-section-icon { color: #FB923C; }
.tarx-section-header[data-section="memory"] .tarx-section-icon { color: #A78BFA; }
.tarx-section-header[data-section="instructions"] .tarx-section-icon { color: #60A5FA; }

/* Section icon base */
.tarx-section-icon {
	width: 16px;
	height: 16px;
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: transform var(--transition-fast);
}

.tarx-section-header:hover .tarx-section-icon {
	transform: scale(1.1);
}

/* Section chevron animation */
.tarx-section-chevron {
	width: 12px;
	height: 12px;
	transition: transform var(--transition-fast);
}

.tarx-section.expanded .tarx-section-chevron {
	transform: rotate(90deg);
}

/* Icon styling */
.tarx-item-icon {
	width: 16px;
	height: 16px;
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
}

/* Label */
.tarx-item-label {
	flex: 1;
	font-size: 13px;
	font-weight: 500;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

/* Description (right-aligned) */
.tarx-item-description {
	font-size: 11px;
	color: var(--muted-foreground);
	flex-shrink: 0;
}

/* Badge */
.tarx-item-badge {
	font-size: 10px;
	padding: 2px 6px;
	border-radius: 9999px;
	background: var(--tarx-primary, #0066FF);
	color: white;
	font-weight: 600;
}

/* Active indicator dot */
.tarx-active-dot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: var(--electric-blue);
	animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
	0%, 100% { opacity: 1; transform: scale(1); }
	50% { opacity: 0.7; transform: scale(0.9); }
}

/* Project color dot */
.tarx-color-indicator {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	flex-shrink: 0;
}

/* Loading state */
.tarx-tree-item.loading {
	opacity: 0.6;
	pointer-events: none;
}

.tarx-tree-item.loading .tarx-item-icon {
	animation: spin 1s linear infinite;
}

@keyframes spin {
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}

/* Empty state */
.tarx-empty-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 32px 16px;
	text-align: center;
	color: var(--muted-foreground);
}

.tarx-empty-icon {
	font-size: 32px;
	margin-bottom: 12px;
	opacity: 0.5;
}

.tarx-empty-title {
	font-weight: 500;
	font-size: 14px;
	color: var(--foreground);
	margin-bottom: 4px;
}

.tarx-empty-text {
	font-size: 12px;
	margin-bottom: 16px;
}

/* Action button in empty state */
.tarx-empty-action {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 8px 16px;
	font-size: 13px;
	font-weight: 500;
	border-radius: 6px;
	border: none;
	background: var(--tarx-primary, #0066FF);
	color: white;
	cursor: pointer;
	transition:
		background-color var(--transition-fast),
		transform var(--transition-fast);
}

.tarx-empty-action:hover {
	background: var(--tarx-primary-dark, #0052CC);
	transform: scale(1.02);
}

.tarx-empty-action:focus {
	outline: none;
	box-shadow:
		0 0 0 2px var(--background),
		0 0 0 4px var(--electric-blue);
}
`;

