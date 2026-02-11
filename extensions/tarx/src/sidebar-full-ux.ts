/**
 * TARX Sidebar Full UX Module
 * Complete sidebar implementation with icons, hover, projects, history, files
 *
 * Features:
 * - Icons (codicons): folder, clock, brain, chat, file, memory
 * - Hover: Contrast background, scale 1.02, electric-blue focus ring
 * - Collapsible project TreeItem with children
 * - History click: Open chat thread
 * - File click: Inject content into chat prompt
 * - Project creation: Native flow with skip folder option
 *
 * @file extensions/tarx/src/sidebar-full-ux.ts
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import { emojiToCodeicon, EMOJI_TO_CODICON } from './emoji-codicon';

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
	DB_PATH: path.join(os.homedir(), 'Library/Application Support/tarx/memory.db'),
	TARX_ROOT: path.join(os.homedir(), 'TARX'),
	HIVE_LOG: path.join(os.homedir(), 'TARX', 'sidebar-hive.log'),
	POLL_INTERVAL: 30000,
};

// ============================================================
// NEON COLOR PALETTE
// ============================================================

export const COLORS = {
	electricBlue: '#00F0FF',
	neonPurple: '#B026FF',
	cyberPink: '#FF2E97',
	plasmaGreen: '#00FF94',
	violetGlow: '#7B2FF7',
	neonMint: '#00FFCC',
	lavaOrange: '#FF6B00',
	hoverBg: '#2A2D4A',
	activeBg: 'rgba(0, 240, 255, 0.1)',
	focusRing: '#00F0FF',
} as const;

// ============================================================
// ICONS (ThemeIcon with colors)
// ============================================================

export const ICONS = {
	// Section icons
	projects: new vscode.ThemeIcon('folder', new vscode.ThemeColor('charts.blue')),
	projectsOpen: new vscode.ThemeIcon('folder-opened', new vscode.ThemeColor('charts.blue')),
	history: new vscode.ThemeIcon('history', new vscode.ThemeColor('charts.purple')),
	skills: new vscode.ThemeIcon('lightbulb', new vscode.ThemeColor('charts.yellow')),
	conversations: new vscode.ThemeIcon('comment-discussion', new vscode.ThemeColor('charts.green')),
	files: new vscode.ThemeIcon('file-code', new vscode.ThemeColor('charts.orange')),
	memory: new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.purple')),
	instructions: new vscode.ThemeIcon('book', new vscode.ThemeColor('charts.blue')),

	// Project states
	projectActive: new vscode.ThemeIcon('folder-opened', new vscode.ThemeColor('charts.green')),
	projectInactive: new vscode.ThemeIcon('folder', new vscode.ThemeColor('foreground')),

	// Space (conversation container)
	space: new vscode.ThemeIcon('comment-discussion', new vscode.ThemeColor('charts.purple')),
	spaceActive: new vscode.ThemeIcon('comment-discussion', new vscode.ThemeColor('charts.green')),

	// Session states
	sessionRecent: new vscode.ThemeIcon('comment-discussion', new vscode.ThemeColor('charts.blue')),
	sessionOld: new vscode.ThemeIcon('comment', new vscode.ThemeColor('descriptionForeground')),

	// File types
	fileTs: new vscode.ThemeIcon('symbol-method', new vscode.ThemeColor('charts.blue')),
	filePy: new vscode.ThemeIcon('symbol-misc', new vscode.ThemeColor('charts.yellow')),
	fileRust: new vscode.ThemeIcon('symbol-struct', new vscode.ThemeColor('charts.orange')),
	fileJson: new vscode.ThemeIcon('json', new vscode.ThemeColor('charts.yellow')),
	fileMd: new vscode.ThemeIcon('markdown', new vscode.ThemeColor('charts.blue')),
	fileGeneric: new vscode.ThemeIcon('file', new vscode.ThemeColor('foreground')),

	// Actions
	add: new vscode.ThemeIcon('add', new vscode.ThemeColor('charts.green')),
	refresh: new vscode.ThemeIcon('refresh'),
	settings: new vscode.ThemeIcon('gear'),
	trash: new vscode.ThemeIcon('trash', new vscode.ThemeColor('charts.red')),
	edit: new vscode.ThemeIcon('edit'),

	// Status
	loading: new vscode.ThemeIcon('loading~spin'),
	error: new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red')),
	success: new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green')),
};

// ============================================================
// DATABASE UTILITIES
// ============================================================

function queryDB<T>(sql: string): T[] {
	try {
		const result = execSync(`sqlite3 "${CONFIG.DB_PATH}" -json`, {
			encoding: 'utf8',
			input: sql,
			timeout: 5000,
			maxBuffer: 10 * 1024 * 1024
		});
		return JSON.parse(result || '[]');
	} catch {
		return [];
	}
}

function execDB(sql: string): void {
	try {
		execSync(`sqlite3 "${CONFIG.DB_PATH}"`, {
			input: sql,
			encoding: 'utf8',
			timeout: 5000
		});
	} catch (e) {
		console.error('[TARX] DB exec error:', e);
	}
}

// ============================================================
// TIME FORMATTING
// ============================================================

export function formatTimeAgo(timestamp: number | string | Date): string {
	const date = typeof timestamp === 'number'
		? new Date(timestamp > 1e12 ? timestamp : timestamp * 1000)
		: typeof timestamp === 'string' ? new Date(timestamp) : timestamp;

	const now = new Date();
	const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

	if (diffSec < 60) return 'just now';
	if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
	if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
	if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
	return date.toLocaleDateString();
}

export function formatFileSize(bytes: number): string {
	if (bytes === 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// ============================================================
// CSS STYLES (for webviews)
// ============================================================

export const HOVER_CSS = `
/* TARX Sidebar UX Styles - Scale 1.02, Electric Blue Focus Ring */

:root {
	--electric-blue: #00F0FF;
	--tarx-bg-hover: #2A2D4A;
	--transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.tarx-item {
	transition: all var(--transition-fast);
	border-radius: 6px;
	padding: 6px 8px;
	margin: 2px 4px;
}

.tarx-item:hover {
	background: var(--tarx-bg-hover);
	transform: scale(1.02);
	box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
}

.tarx-item.active {
	background: rgba(0, 240, 255, 0.1);
	border-left: 2px solid var(--electric-blue);
}

.tarx-item:focus,
.tarx-item:focus-visible {
	outline: none;
	box-shadow: 0 0 0 2px rgba(0, 240, 255, 0.5);
}

.tarx-item:hover .tarx-icon {
	filter: drop-shadow(0 0 4px var(--electric-blue));
}

.tarx-section-header {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 4px 8px;
	font-size: 11px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	cursor: pointer;
	border-radius: 6px;
	transition: all var(--transition-fast);
}

.tarx-section-header:hover {
	background: var(--tarx-bg-hover);
	transform: scale(1.02);
}

.tarx-section-header:focus {
	outline: none;
	box-shadow: 0 0 0 2px rgba(0, 240, 255, 0.5);
}

.tarx-chevron {
	transition: transform 150ms ease;
}

.tarx-section.expanded .tarx-chevron {
	transform: rotate(90deg);
}
`;

// ============================================================
// TYPES
// ============================================================

export type SectionId = 'instructions' | 'files' | 'conversations' | 'memory';
export type ItemType = 'project' | 'space' | 'section' | 'history' | 'file' | 'memory' | 'action' | 'instruction';

interface TarxProject {
	id: string;
	name: string;
	path: string;
	type: string;
	color?: string;
	isActive: boolean;
	createdAt: number;
	instructions?: string;
}

interface TarxSession {
	id: string;
	projectId: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	turnCount: number;
}

// Spaces from MCP (conversation containers without filesystem paths)
interface TarxSpace {
	id: string;
	name: string;
	description: string;
	emoji: string;
	messageCount: number;
	createdAt: number;
	updatedAt: number;
}

interface FileContextData {
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

// ============================================================
// TREE ITEM CLASS
// ============================================================

export class TarxTreeItem extends vscode.TreeItem {
	constructor(
		public readonly itemLabel: string,
		public readonly itemType: ItemType,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly data?: Record<string, any>
	) {
		super(itemLabel, collapsibleState);
		this.configureItem();
	}

	private configureItem(): void {
		switch (this.itemType) {
			case 'project':
				this.iconPath = this.data?.isActive ? ICONS.projectActive : ICONS.projectInactive;
				this.contextValue = this.data?.isActive ? 'activeProject' : 'project';
				this.description = this.data?.type || '';
				this.tooltip = `${this.itemLabel}\n${this.data?.path || ''}`;
				this.command = {
					command: 'tarx.sidebar.setActiveProject',
					title: 'Set Active',
					arguments: [this.data?.id]
				};
				break;

			case 'space':
				this.iconPath = this.data?.emoji ? emojiToCodeicon(this.data.emoji, new vscode.ThemeColor('charts.purple')) : (this.data?.isActive ? ICONS.spaceActive : ICONS.space);
				this.contextValue = 'space';
				this.description = `${this.data?.messageCount || 0} msgs`;
				this.tooltip = `${this.itemLabel}\n${this.data?.description || 'Conversation space'}`;
				this.command = {
					command: 'tarx.sidebar.openSpace',
					title: 'Open Space',
					arguments: [this.data?.id]
				};
				break;

			case 'section':
				this.iconPath = this.getSectionIcon(this.data?.sectionId);
				this.contextValue = `section-${this.data?.sectionId}`;
				this.description = this.data?.count ? `${this.data.count}` : '';
				break;

			case 'history':
				const isRecent = Date.now() - (this.data?.updatedAt || 0) < 24 * 60 * 60 * 1000;
				this.iconPath = isRecent ? ICONS.sessionRecent : ICONS.sessionOld;
				this.description = this.data?.timeAgo || formatTimeAgo(this.data?.updatedAt);
				this.contextValue = 'historyItem';
				this.command = {
					command: 'tarx.sidebar.openHistory',
					title: 'Open Conversation',
					arguments: [this.data?.sessionId || this.data?.id]
				};
				break;

			case 'file':
				this.iconPath = this.getFileIcon(this.data?.path || this.data?.language);
				this.description = this.data?.size || `${this.data?.lineCount || 0} lines`;
				this.contextValue = 'fileItem';
				this.tooltip = this.data?.path || this.itemLabel;
				this.command = {
					command: 'tarx.sidebar.injectFile',
					title: 'Inject File',
					arguments: [this.data?.path]
				};
				break;

			case 'memory':
				this.iconPath = ICONS.memory;
				this.description = this.data?.value || '';
				this.contextValue = 'memoryItem';
				break;

			case 'instruction':
				this.iconPath = ICONS.edit;
				this.contextValue = 'instructionItem';
				this.tooltip = 'Click to edit instructions';
				this.command = {
					command: 'tarx.sidebar.editInstructions',
					title: 'Edit',
					arguments: [this.data?.projectId]
				};
				break;

			case 'action':
				this.iconPath = this.data?.icon || ICONS.add;
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

	private getSectionIcon(sectionId?: string): vscode.ThemeIcon {
		switch (sectionId) {
			case 'instructions': return ICONS.instructions;
			case 'files': return ICONS.files;
			case 'conversations': return ICONS.conversations;
			case 'memory': return ICONS.memory;
			default: return ICONS.projects;
		}
	}

	private getFileIcon(pathOrLang?: string): vscode.ThemeIcon {
		if (!pathOrLang) return ICONS.fileGeneric;

		const ext = pathOrLang.includes('.') ? path.extname(pathOrLang).toLowerCase() : `.${pathOrLang}`;
		switch (ext) {
			case '.ts':
			case '.tsx':
			case 'typescript':
				return ICONS.fileTs;
			case '.py':
			case 'python':
				return ICONS.filePy;
			case '.rs':
			case 'rust':
				return ICONS.fileRust;
			case '.json':
			case 'json':
				return ICONS.fileJson;
			case '.md':
			case 'markdown':
				return ICONS.fileMd;
			default:
				return ICONS.fileGeneric;
		}
	}
}

// ============================================================
// PROJECTS SIDEBAR PROVIDER
// ============================================================

export class TarxSidebarProvider implements vscode.TreeDataProvider<TarxTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<TarxTreeItem | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private projects: TarxProject[] = [];
	private spaces: TarxSpace[] = [];
	private activeProjectId: string | undefined;
	private expandedSections = new Set<string>(['instructions', 'files', 'conversations']);
	private hiveLogTimer: NodeJS.Timeout | null = null;

	constructor(private context: vscode.ExtensionContext) {
		this.loadState();
		this.loadProjects();
		this.startHivePolling();
	}

	private async loadState(): Promise<void> {
		this.activeProjectId = this.context.workspaceState.get('tarx.activeProject');
		const expanded = this.context.workspaceState.get<string[]>('tarx.expandedSections');
		if (expanded) {
			this.expandedSections = new Set(expanded);
		}
	}

	private async saveState(): Promise<void> {
		await this.context.workspaceState.update('tarx.activeProject', this.activeProjectId);
		await this.context.workspaceState.update('tarx.expandedSections', Array.from(this.expandedSections));
	}

	refresh(): void {
		this.loadProjects();
		this._onDidChangeTreeData.fire();
	}

	setActiveProject(projectId: string): void {
		this.activeProjectId = projectId;
		execDB(`UPDATE projects SET is_active = 0; UPDATE projects SET is_active = 1 WHERE id = '${projectId}';`);
		this.saveState();
		this.refresh();
	}

	toggleSection(sectionId: string): void {
		if (this.expandedSections.has(sectionId)) {
			this.expandedSections.delete(sectionId);
		} else {
			this.expandedSections.add(sectionId);
		}
		this.saveState();
		this.refresh();
	}

	getTreeItem(element: TarxTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: TarxTreeItem): Promise<TarxTreeItem[]> {
		if (!element) {
			return this.getProjectItems();
		}

		if (element.itemType === 'project') {
			return this.getProjectSections(element.data as TarxProject);
		}

		if (element.itemType === 'space') {
			return this.getSpaceSessions(element.data as TarxSpace);
		}

		if (element.itemType === 'section' && element.data?.sectionId) {
			return this.getSectionChildren(element.data.sectionId as SectionId, element.data.projectId);
		}

		return [];
	}

	// --- Data Loading ---

	private loadProjects(): void {
		// Load filesystem projects
		// CRITICAL: Preserve existing data on error - don't clear arrays if query fails
		try {
			const result = queryDB<any>(`
				SELECT id, name, root as path, type, color, is_active, created_at, instructions
				FROM projects ORDER BY is_active DESC, created_at DESC LIMIT 50
			`);

			// Only update if we got valid results (not error/empty due to DB lock)
			if (result && Array.isArray(result)) {
				this.projects = result.map(r => ({
					id: r.id,
					name: r.name,
					path: r.path || r.root || '',
					type: r.type || 'general',
					color: r.color,
					isActive: r.is_active === 1,
					createdAt: r.created_at || Date.now(),
					instructions: r.instructions
				}));

				// Update active project ID
				const active = this.projects.find(p => p.isActive);
				if (active) {
					this.activeProjectId = active.id;
				}
			}
		} catch (e) {
			// PRESERVE existing data on error - don't clear!
			console.warn('[TARX Sidebar] Projects query failed, preserving existing data:', e);
		}

		// Load MCP spaces (conversation containers)
		try {
			const spacesResult = queryDB<any>(`
				SELECT id, name, description, emoji, message_count, created_at, updated_at
				FROM spaces
				WHERE deleted_at IS NULL
				ORDER BY updated_at DESC LIMIT 50
			`);

			// Only update if we got valid results
			if (spacesResult && Array.isArray(spacesResult)) {
				this.spaces = spacesResult.map(r => ({
					id: r.id,
					name: r.name,
					description: r.description || '',
					emoji: r.emoji || '',
					messageCount: r.message_count || 0,
					createdAt: r.created_at || Date.now(),
					updatedAt: r.updated_at || Date.now()
				}));
			}

			console.log(`[TARX Sidebar] Loaded ${this.projects.length} projects, ${this.spaces.length} spaces`);
		} catch (e) {
			// PRESERVE existing data on error - don't clear!
			console.warn('[TARX Sidebar] Spaces query failed, preserving existing data:', e);
		}
	}

	private getProjectItems(): TarxTreeItem[] {
		const items: TarxTreeItem[] = [];

		// Add filesystem projects first
		if (this.projects.length > 0) {
			items.push(...this.projects.map(p => new TarxTreeItem(
				p.name,
				'project',
				vscode.TreeItemCollapsibleState.Collapsed,
				p
			)));
		}

		// Add MCP spaces (conversation containers)
		if (this.spaces.length > 0) {
			items.push(...this.spaces.map(s => new TarxTreeItem(
				s.name,
				'space',
				vscode.TreeItemCollapsibleState.Collapsed,
				s
			)));
		}

		// Show create action if nothing exists
		if (items.length === 0) {
			return [new TarxTreeItem(
				'Create your first project',
				'action',
				vscode.TreeItemCollapsibleState.None,
				{ icon: ICONS.add, command: 'tarx.createProject' }
			)];
		}

		return items;
	}

	private getProjectSections(project: TarxProject): TarxTreeItem[] {
		const fileCount = this.getCount(`SELECT COUNT(*) as c FROM project_files WHERE project_id = '${project.id}'`);
		const convCount = this.getCount(`SELECT COUNT(*) as c FROM conversation_sessions WHERE project_id = '${project.id}'`);
		const memCount = this.getCount(`SELECT COUNT(*) as c FROM project_memory WHERE project_id = '${project.id}'`);

		return [
			new TarxTreeItem('INSTRUCTIONS', 'section', vscode.TreeItemCollapsibleState.Collapsed,
				{ sectionId: 'instructions', projectId: project.id, count: 1 }),
			new TarxTreeItem('FILES', 'section', vscode.TreeItemCollapsibleState.Collapsed,
				{ sectionId: 'files', projectId: project.id, count: fileCount }),
			new TarxTreeItem('CONVERSATIONS', 'section', vscode.TreeItemCollapsibleState.Collapsed,
				{ sectionId: 'conversations', projectId: project.id, count: convCount }),
			new TarxTreeItem('MEMORY', 'section', vscode.TreeItemCollapsibleState.Collapsed,
				{ sectionId: 'memory', projectId: project.id, count: memCount }),
		];
	}

	private getSpaceSessions(space: TarxSpace): TarxTreeItem[] {
		// Load sessions from the MCP sessions table
		const sessions = queryDB<any>(`
			SELECT id, title, message_count, created_at, updated_at
			FROM sessions
			WHERE space_id = '${space.id}' AND deleted_at IS NULL
			ORDER BY updated_at DESC LIMIT 30
		`);

		if (sessions.length === 0) {
			return [new TarxTreeItem('No conversations yet', 'action', vscode.TreeItemCollapsibleState.None,
				{ icon: ICONS.conversations, command: 'tarx.chat.new', args: [space.id] })];
		}

		return sessions.map(s => new TarxTreeItem(
			s.title || 'Untitled',
			'history',
			vscode.TreeItemCollapsibleState.None,
			{
				sessionId: s.id,
				spaceId: space.id,
				updatedAt: s.updated_at,
				messageCount: s.message_count || 0,
				timeAgo: formatTimeAgo(s.updated_at)
			}
		));
	}

	private getSectionChildren(sectionId: SectionId, projectId: string): TarxTreeItem[] {
		switch (sectionId) {
			case 'instructions':
				return this.getInstructionItems(projectId);
			case 'files':
				return this.getFileItems(projectId);
			case 'conversations':
				return this.getConversationItems(projectId);
			case 'memory':
				return this.getMemoryItems(projectId);
			default:
				return [];
		}
	}

	private getInstructionItems(projectId: string): TarxTreeItem[] {
		const project = this.projects.find(p => p.id === projectId);
		if (!project) return [];

		let instructions = project.instructions || '';

		// Try to load from .tarx/instructions.md
		if (project.path) {
			try {
				const instructionsPath = path.join(project.path, '.tarx', 'instructions.md');
				if (fs.existsSync(instructionsPath)) {
					instructions = fs.readFileSync(instructionsPath, 'utf8');
				}
			} catch (e) { /* ignore */ }
		}

		const preview = instructions
			? instructions.slice(0, 60).replace(/\n/g, ' ') + (instructions.length > 60 ? '...' : '')
			: 'Click to add instructions';

		return [new TarxTreeItem(preview, 'instruction', vscode.TreeItemCollapsibleState.None,
			{ projectId, instructions, path: project.path })];
	}

	private getFileItems(projectId: string): TarxTreeItem[] {
		const files = queryDB<any>(`
			SELECT file_path as path, language FROM project_files
			WHERE project_id = '${projectId}' LIMIT 20
		`);

		if (files.length === 0) {
			return [new TarxTreeItem('No files indexed', 'action', vscode.TreeItemCollapsibleState.None,
				{ icon: ICONS.add, command: 'tarx.sidebar.addFiles', args: [projectId] })];
		}

		return files.map((f, i) => {
			const name = path.basename(f.path);
			const lineCount = this.getFileLineCount(f.path);

			return new TarxTreeItem(name, 'file', vscode.TreeItemCollapsibleState.None, {
				projectId,
				path: f.path,
				name,
				language: f.language || this.detectLanguage(name),
				lineCount
			});
		});
	}

	private getConversationItems(projectId: string): TarxTreeItem[] {
		// Use messages table for session turn counts
		const sessions = queryDB<any>(`
			SELECT id, title, created_at, updated_at,
				(SELECT COUNT(*) FROM messages WHERE session_id = s.id) as turn_count
			FROM conversation_sessions s
			WHERE project_id = '${projectId}'
			ORDER BY updated_at DESC LIMIT 10
		`);

		if (sessions.length === 0) {
			return [new TarxTreeItem('No conversations yet', 'action', vscode.TreeItemCollapsibleState.None,
				{ icon: ICONS.conversations, command: 'tarx.newChat' })];
		}

		return sessions.map(s => new TarxTreeItem(
			s.title || `Session ${s.id.slice(0, 8)}`,
			'history',
			vscode.TreeItemCollapsibleState.None,
			{
				projectId,
				id: s.id,
				sessionId: s.id,
				title: s.title,
				createdAt: s.created_at,
				updatedAt: s.updated_at,
				turnCount: s.turn_count || 0
			}
		));
	}

	private getMemoryItems(projectId: string): TarxTreeItem[] {
		const memories = queryDB<any>(`
			SELECT id, key, value, created_at FROM project_memory
			WHERE project_id = '${projectId}'
			ORDER BY created_at DESC LIMIT 10
		`);

		if (memories.length === 0) {
			return [new TarxTreeItem('No memories stored', 'action', vscode.TreeItemCollapsibleState.None,
				{ icon: ICONS.memory })];
		}

		return memories.map(m => new TarxTreeItem(
			m.key,
			'memory',
			vscode.TreeItemCollapsibleState.None,
			{ projectId, id: m.id, key: m.key, value: m.value?.slice(0, 40), createdAt: m.created_at }
		));
	}

	// --- Helpers ---

	private getCount(sql: string): number {
		const result = queryDB<any>(sql);
		return result[0]?.c || 0;
	}

	private getFileLineCount(filePath: string): number {
		try {
			const content = fs.readFileSync(filePath, 'utf8');
			return content.split('\n').length;
		} catch {
			return 0;
		}
	}

	private detectLanguage(filename: string): string {
		const ext = path.extname(filename).toLowerCase();
		const map: Record<string, string> = {
			'.ts': 'typescript', '.tsx': 'typescript',
			'.js': 'javascript', '.jsx': 'javascript',
			'.py': 'python', '.rs': 'rust', '.go': 'go',
			'.json': 'json', '.md': 'markdown',
			'.html': 'html', '.css': 'css'
		};
		return map[ext] || 'text';
	}

	// --- Hive Log Polling ---

	private startHivePolling(): void {
		this.logToHive('Sidebar provider initialized');

		this.hiveLogTimer = setInterval(() => {
			this.pollHiveLog();
		}, CONFIG.POLL_INTERVAL);
	}

	private pollHiveLog(): void {
		try {
			if (fs.existsSync(CONFIG.HIVE_LOG)) {
				const content = fs.readFileSync(CONFIG.HIVE_LOG, 'utf8');
				const lines = content.split('\n').slice(-10);

				for (const line of lines) {
					if (line.includes('[COMMAND]') && !line.includes('[PROCESSED]')) {
						if (line.includes('REFRESH_SIDEBAR')) {
							this.refresh();
							this.logToHive('Processed REFRESH_SIDEBAR');
						}
					}
				}
			}
			this.logToHive(`Heartbeat - ${this.projects.length} projects`);
		} catch (e) { /* silent */ }
	}

	private logToHive(message: string): void {
		try {
			const logDir = path.dirname(CONFIG.HIVE_LOG);
			if (!fs.existsSync(logDir)) {
				fs.mkdirSync(logDir, { recursive: true });
			}
			const timestamp = new Date().toISOString();
			fs.appendFileSync(CONFIG.HIVE_LOG, `[${timestamp}] [Sidebar-UX] ${message}\n`);
		} catch (e) { /* silent */ }
	}

	stopHivePolling(): void {
		if (this.hiveLogTimer) {
			clearInterval(this.hiveLogTimer);
			this.hiveLogTimer = null;
			this.logToHive('Sidebar provider stopped');
		}
	}
}

// ============================================================
// COMMAND HANDLERS
// ============================================================

export async function openHistoryItem(sessionId: string): Promise<void> {
	console.log(`[TARX] Opening history: ${sessionId}`);

	// First try the MCP sessions table (for space-based sessions)
	const mcpSessions = queryDB<any>(`
		SELECT s.id, s.title, s.space_id, sp.name as space_name
		FROM sessions s
		LEFT JOIN spaces sp ON s.space_id = sp.id
		WHERE s.id = '${sessionId.replace(/'/g, "''")}'
		LIMIT 1;
	`);

	if (mcpSessions.length > 0) {
		// Found in MCP sessions - open with TarxSessionPanel
		console.log(`[TARX] Found MCP session: ${mcpSessions[0].title}`);
		await vscode.commands.executeCommand('tarx.openSessionPanel', sessionId);
		return;
	}

	// Fall back to conversation_sessions table (for project-based conversations)
	const projectSessions = queryDB<any>(`
		SELECT id, title, updated_at, project_id FROM conversation_sessions WHERE id = '${sessionId.replace(/'/g, "''")}' LIMIT 1;
	`);

	if (projectSessions.length === 0) {
		vscode.window.showErrorMessage('Session not found');
		return;
	}

	const session = projectSessions[0];

	// Open session panel (loads messages from DB internally)
	await vscode.commands.executeCommand('tarx.openSessionPanel', sessionId);

	console.log(`[TARX] Loaded "${session.title || sessionId.slice(0, 8)}"`);
}

export async function injectFileIntoChat(context: vscode.ExtensionContext, filePath: string): Promise<void> {
	console.log(`[TARX] Injecting file: ${filePath}`);

	try {
		if (!fs.existsSync(filePath)) {
			vscode.window.showErrorMessage(`File not found: ${filePath}`);
			return;
		}

		const content = fs.readFileSync(filePath, 'utf8');
		const ext = path.extname(filePath).slice(1);
		const name = path.basename(filePath);

		const fileData: FileContextData = {
			path: filePath,
			name: name,
			content: content,
			language: ext,
			lineCount: content.split('\n').length
		};

		// Add to workspace state
		const files = context.workspaceState.get<FileContextData[]>('tarx.fileContext', []);
		const existing = files.findIndex(f => f.path === filePath);

		if (existing >= 0) {
			files[existing] = fileData;
		} else {
			files.push(fileData);
		}

		await context.workspaceState.update('tarx.fileContext', files);
		await vscode.commands.executeCommand('tarx.sidebar.refreshContext');

		vscode.window.showInformationMessage(`Added ${name} to chat context`);
	} catch (e) {
		vscode.window.showErrorMessage(`Failed to read file: ${e}`);
	}
}

export async function editInstructions(projectId: string): Promise<void> {
	const projects = queryDB<any>(`
		SELECT id, name, root as path, instructions FROM projects WHERE id = '${projectId}' LIMIT 1;
	`);

	if (projects.length === 0) {
		vscode.window.showErrorMessage('Project not found');
		return;
	}

	const project = projects[0];

	// Try to open instructions.md if it exists
	if (project.path) {
		const instructionsPath = path.join(project.path, '.tarx', 'instructions.md');
		if (fs.existsSync(instructionsPath)) {
			const doc = await vscode.workspace.openTextDocument(instructionsPath);
			await vscode.window.showTextDocument(doc);
			return;
		}
	}

	// Otherwise show input box
	const newInstructions = await vscode.window.showInputBox({
		title: `Instructions for ${project.name}`,
		prompt: 'Describe the project, tech stack, coding conventions...',
		value: project.instructions || '',
		placeHolder: 'A TypeScript web app using React and Tailwind...',
		ignoreFocusOut: true
	});

	if (newInstructions === undefined) return;

	const escaped = newInstructions.replace(/'/g, "''");
	execDB(`UPDATE projects SET instructions = '${escaped}', updated_at = ${Date.now()} WHERE id = '${projectId}';`);

	// Save to file if path exists
	if (project.path) {
		try {
			const tarxDir = path.join(project.path, '.tarx');
			if (!fs.existsSync(tarxDir)) {
				fs.mkdirSync(tarxDir, { recursive: true });
			}
			fs.writeFileSync(path.join(tarxDir, 'instructions.md'), newInstructions, 'utf8');
		} catch (e) { /* ignore */ }
	}

	vscode.window.showInformationMessage(`Instructions updated for ${project.name}`);
	await vscode.commands.executeCommand('tarx.sidebar.refresh');
}

// ============================================================
// PROJECT CREATION (Native Flow with Skip Folder)
// ============================================================

export async function createProject(): Promise<void> {
	// Step 1: Project name
	const name = await vscode.window.showInputBox({
		title: 'Create TARX Project (1/4)',
		prompt: 'Enter project name',
		placeHolder: 'My Awesome Project',
		validateInput: (value) => {
			if (!value || value.trim().length < 2) return 'Name must be at least 2 characters';
			if (value.length > 100) return 'Name must be less than 100 characters';
			return null;
		}
	});

	if (!name) return;

	// Step 2: Project type
	const typeItems = [
		{ label: 'Web App', description: 'Frontend/fullstack web application' },
		{ label: 'API/Backend', description: 'Server-side application or API' },
		{ label: 'CLI Tool', description: 'Command-line application' },
		{ label: 'Library', description: 'Reusable package/library' },
		{ label: 'General', description: 'Other project type' },
	];

	const type = await vscode.window.showQuickPick(typeItems, {
		title: 'Create TARX Project (2/4)',
		placeHolder: 'Select project type'
	});

	if (!type) return;

	// Step 3: Folder selection (optional - can skip)
	const folderChoice = await vscode.window.showQuickPick([
		{ label: 'Select existing folder', description: 'Link to a folder on disk' },
		{ label: 'Create in ~/TARX', description: `Create at ~/TARX/${name}` },
		{ label: 'Skip folder', description: 'Create project without local folder' },
	], {
		title: 'Create TARX Project (3/4)',
		placeHolder: 'Link project to folder?'
	});

	if (!folderChoice) return;

	let folder = '';
	if (folderChoice.label === 'Select existing folder') {
		const uris = await vscode.window.showOpenDialog({
			canSelectFolders: true,
			canSelectFiles: false,
			canSelectMany: false,
			title: 'Select Project Folder'
		});
		if (uris && uris.length > 0) {
			folder = uris[0].fsPath;
		}
	} else if (folderChoice.label === 'Create in ~/TARX') {
		folder = path.join(CONFIG.TARX_ROOT, name);
		try {
			await vscode.workspace.fs.createDirectory(vscode.Uri.file(folder));
		} catch (e) { /* ignore if exists */ }
	}
	// Skip folder: folder stays empty string

	// Step 4: Color selection
	const colorItems = [
		{ label: 'Electric Blue', description: '#00F0FF', color: COLORS.electricBlue },
		{ label: 'Neon Purple', description: '#B026FF', color: COLORS.neonPurple },
		{ label: 'Cyber Pink', description: '#FF2E97', color: COLORS.cyberPink },
		{ label: 'Plasma Green', description: '#00FF94', color: COLORS.plasmaGreen },
		{ label: 'Violet Glow', description: '#7B2FF7', color: COLORS.violetGlow },
		{ label: 'Lava Orange', description: '#FF6B00', color: COLORS.lavaOrange },
	];

	const colorChoice = await vscode.window.showQuickPick(colorItems, {
		title: 'Create TARX Project (4/4)',
		placeHolder: 'Select project color'
	});

	if (!colorChoice) return;

	// Create project in database
	const projectId = `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	const escapedName = name.replace(/'/g, "''");
	const escapedFolder = folder.replace(/'/g, "''");
	const now = Date.now();

	execDB(`
		INSERT INTO projects (id, name, root, type, color, instructions, created_at, updated_at, is_active)
		VALUES ('${projectId}', '${escapedName}', '${escapedFolder}', '${type.label}', '${colorChoice.color}', '', ${now}, ${now}, 1);
		UPDATE projects SET is_active = 0 WHERE id != '${projectId}';
	`);

	// Create .tarx folder if path exists
	if (folder) {
		try {
			const tarxDir = path.join(folder, '.tarx');
			if (!fs.existsSync(tarxDir)) {
				fs.mkdirSync(tarxDir, { recursive: true });
			}
			fs.writeFileSync(path.join(tarxDir, 'config.json'), JSON.stringify({
				name,
				type: type.label,
				color: colorChoice.color,
				created: new Date().toISOString()
			}, null, 2), 'utf8');
		} catch (e) { /* ignore */ }
	}

	vscode.window.showInformationMessage(`Created project: ${name}`, 'Open Folder').then(sel => {
		if (sel === 'Open Folder' && folder) {
			vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folder));
		}
	});

	await vscode.commands.executeCommand('tarx.sidebar.refresh');
}

export async function addFilesToProject(projectId: string): Promise<void> {
	const uris = await vscode.window.showOpenDialog({
		canSelectFiles: true,
		canSelectFolders: false,
		canSelectMany: true,
		title: 'Add Files to Project'
	});

	if (!uris || uris.length === 0) return;

	let added = 0;
	for (const uri of uris) {
		try {
			const stat = fs.statSync(uri.fsPath);
			const name = path.basename(uri.fsPath);
			const ext = path.extname(uri.fsPath).slice(1);
			const escapedPath = uri.fsPath.replace(/'/g, "''");

			execDB(`
				INSERT OR REPLACE INTO project_files (project_id, file_path, name, language, size, added_at)
				VALUES ('${projectId}', '${escapedPath}', '${name}', '${ext}', ${stat.size}, ${Date.now()});
			`);
			added++;
		} catch (e) {
			console.error('[TARX] Failed to add file:', uri.fsPath, e);
		}
	}

	vscode.window.showInformationMessage(`Added ${added} file(s) to project`);
	await vscode.commands.executeCommand('tarx.sidebar.refresh');
}

// ============================================================
// CONTEXT FILES PROVIDER
// ============================================================

export class TarxContextFilesProvider implements vscode.TreeDataProvider<TarxTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<TarxTreeItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(private context: vscode.ExtensionContext) {}

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: TarxTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(): Promise<TarxTreeItem[]> {
		const files = this.context.workspaceState.get<FileContextData[]>('tarx.fileContext', []);
		const selections = this.context.workspaceState.get<FileContextData[]>('tarx.selectionContext', []);

		const items: TarxTreeItem[] = [];

		for (const file of files) {
			items.push(new TarxTreeItem(
				file.name,
				'file',
				vscode.TreeItemCollapsibleState.None,
				{ ...file, size: `${file.lineCount} lines` }
			));
		}

		for (const sel of selections) {
			const range = sel.selection ? `L${sel.selection.startLine}-${sel.selection.endLine}` : '';
			items.push(new TarxTreeItem(
				`${sel.name}:${range}`,
				'file',
				vscode.TreeItemCollapsibleState.None,
				{ ...sel, size: `${sel.lineCount} lines` }
			));
		}

		if (items.length === 0) {
			items.push(new TarxTreeItem(
				'No files in context',
				'action',
				vscode.TreeItemCollapsibleState.None,
				{ icon: new vscode.ThemeIcon('info') }
			));
		}

		return items;
	}
}

// ============================================================
// REGISTRATION
// ============================================================

let sidebarProvider: TarxSidebarProvider | null = null;
let contextProvider: TarxContextFilesProvider | null = null;

export function registerSidebarFullUX(context: vscode.ExtensionContext): void {
	// Create providers
	sidebarProvider = new TarxSidebarProvider(context);
	contextProvider = new TarxContextFilesProvider(context);

	// Register tree views
	const mainView = vscode.window.createTreeView('tarx.sidebar', {
		treeDataProvider: sidebarProvider,
		showCollapseAll: true
	});
	context.subscriptions.push(mainView);

	const contextView = vscode.window.createTreeView('tarx.contextFiles', {
		treeDataProvider: contextProvider,
		showCollapseAll: false
	});
	context.subscriptions.push(contextView);

	// Cleanup on deactivate
	context.subscriptions.push({
		dispose: () => sidebarProvider?.stopHivePolling()
	});

	// Register commands
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.sidebar.refresh', () => sidebarProvider?.refresh()),

		vscode.commands.registerCommand('tarx.sidebar.refreshContext', () => contextProvider?.refresh()),

		vscode.commands.registerCommand('tarx.sidebar.setActiveProject', (projectId: string) => {
			sidebarProvider?.setActiveProject(projectId);
		}),

		vscode.commands.registerCommand('tarx.sidebar.toggleSection', (sectionId: string) => {
			sidebarProvider?.toggleSection(sectionId);
		}),

		vscode.commands.registerCommand('tarx.sidebar.openHistory', openHistoryItem),

		vscode.commands.registerCommand('tarx.sidebar.openSpace', async (spaceId: string) => {
			console.log(`[TARX] Opening space: ${spaceId}`);
			// Open the chat and set the active space
			try {
				await vscode.commands.executeCommand('workbench.action.chat.open', { query: '@tarx ' });
				await context.workspaceState.update('tarx.activeSpace', spaceId);
				vscode.window.showInformationMessage(`Opened space: ${spaceId.slice(0, 20)}...`);
			} catch (e) {
				console.error('[TARX] Failed to open space:', e);
			}
		}),

		vscode.commands.registerCommand('tarx.sidebar.injectFile', (filePath: string) => {
			injectFileIntoChat(context, filePath);
		}),

		vscode.commands.registerCommand('tarx.sidebar.editInstructions', editInstructions),

		vscode.commands.registerCommand('tarx.createProject', createProject),

		vscode.commands.registerCommand('tarx.sidebar.addFiles', async (projectId?: string) => {
			const pid = projectId || context.workspaceState.get<string>('tarx.activeProject');
			if (pid) {
				await addFilesToProject(pid);
			} else {
				vscode.window.showWarningMessage('Select a project first');
			}
		}),

		vscode.commands.registerCommand('tarx.sidebar.clearContext', async () => {
			await context.workspaceState.update('tarx.fileContext', []);
			await context.workspaceState.update('tarx.selectionContext', []);
			contextProvider?.refresh();
			vscode.window.showInformationMessage('Context cleared');
		}),

		vscode.commands.registerCommand('tarx.sidebar.injectSelection', async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) return;

			const selection = editor.selection;
			const text = editor.document.getText(selection);

			if (!text) {
				vscode.window.showWarningMessage('No text selected');
				return;
			}

			const fileData: FileContextData = {
				path: editor.document.uri.fsPath,
				name: path.basename(editor.document.uri.fsPath),
				content: text,
				language: editor.document.languageId,
				lineCount: selection.end.line - selection.start.line + 1,
				selection: {
					startLine: selection.start.line + 1,
					endLine: selection.end.line + 1,
					text
				}
			};

			const selections = context.workspaceState.get<FileContextData[]>('tarx.selectionContext', []);
			selections.push(fileData);
			await context.workspaceState.update('tarx.selectionContext', selections);
			contextProvider?.refresh();

			vscode.window.showInformationMessage('Added selection to context');
		})
	);

	console.log('[TARX] Sidebar Full UX registered');
}

// Export for extension.ts
export { sidebarProvider, contextProvider };
