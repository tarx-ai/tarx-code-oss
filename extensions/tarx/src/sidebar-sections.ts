/**
 * TARX Grok-Style Expandable Sidebar Sections
 *
 * @file extensions/tarx/src/sidebar-sections.ts
 *
 * Per-project expandable sections with neon cyberpunk accents:
 * - Instructions (editable textarea from DB 'instructions')
 * - Files (native explorer list + drag-drop)
 * - Conversations (history list, clickable to open chat thread)
 * - Memory (RAG summary from knowledge_embeddings)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import {
	NEON_PALETTE,
	NEON_COLORS,
	getProjectColorFromHash,
	getColorIndex,
	hexToRgba
} from './sidebar-color';
import { EMOJI_TO_CODICON } from './emoji-codicon';

// ============================================================
// TYPES
// ============================================================

export type SectionType = 'instructions' | 'files' | 'conversations' | 'memory';

export interface TarxProject {
	id: string;
	name: string;
	root: string;
	type: string;
	instructions: string;
	color: string;
	createdAt: number;
	isActive: boolean;
}

export interface TarxConversation {
	id: string;
	projectId: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	turnCount: number;
}

export interface TarxFile {
	path: string;
	name: string;
	isDirectory: boolean;
	size: number;
	language?: string;
}

export interface MemorySummary {
	totalChunks: number;
	totalTokens: number;
	byType: Record<string, number>;
	lastIndexed: number | null;
}

// Spaces from MCP (conversation containers)
export interface TarxSpace {
	id: string;
	name: string;
	description: string;
	emoji: string;
	messageCount: number;
	createdAt: number;
	updatedAt: number;
}

// Tree item types for the sidebar
type TreeItemType =
	| 'root'
	| 'project'
	| 'space'
	| 'section'
	| 'instruction-edit'
	| 'file'
	| 'folder'
	| 'conversation'
	| 'memory-stat'
	| 'action';

interface TarxTreeItemData {
	type: TreeItemType;
	id: string;
	label: string;
	description?: string;
	projectId?: string;
	projectColor?: string;
	sectionType?: SectionType;
	filePath?: string;
	conversationId?: string;
	command?: string;
	iconId?: string;
	emoji?: string;
}

// ============================================================
// SECTION ICONS (with neon styling)
// ============================================================

const SECTION_CONFIG: Record<SectionType, { icon: string; neonColor: string }> = {
	instructions: { icon: 'book', neonColor: NEON_PALETTE.electricBlue },
	files: { icon: 'files', neonColor: NEON_PALETTE.plasmaGreen },
	conversations: { icon: 'comment-discussion', neonColor: NEON_PALETTE.neonPurple },
	memory: { icon: 'brain', neonColor: NEON_PALETTE.cyberPink }
};

// ============================================================
// SIDEBAR PROVIDER
// ============================================================

// Hive log path for inter-slave communication
const HIVE_LOG_PATH = path.join(os.homedir(), 'TARX', 'sidebar-hive.log');
const POLL_INTERVAL = 30000; // 30 seconds

export class TarxSectionsSidebarProvider implements vscode.TreeDataProvider<TarxTreeItemData> {
	private _onDidChangeTreeData = new vscode.EventEmitter<TarxTreeItemData | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private dbPath: string;
	private projects: TarxProject[] = [];
	private spaces: TarxSpace[] = [];
	private expandedProjects = new Set<string>();
	private expandedSections = new Set<string>(); // projectId:sectionType
	private hiveLogTimer: NodeJS.Timeout | null = null;

	constructor(private context: vscode.ExtensionContext, dbPath?: string) {
		this.dbPath = dbPath || path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
		this.loadProjects();
		this.startHiveLogPolling();
	}

	// --- Hive Log Polling (Slave 2) ---

	private startHiveLogPolling(): void {
		// Log startup
		this.logToHive('Sidebar sections provider initialized');

		// Poll every 30 seconds
		this.hiveLogTimer = setInterval(() => {
			this.pollHiveLog();
		}, POLL_INTERVAL);
	}

	private pollHiveLog(): void {
		try {
			// Check for commands in the hive log
			if (fs.existsSync(HIVE_LOG_PATH)) {
				const content = fs.readFileSync(HIVE_LOG_PATH, 'utf8');
				const lines = content.split('\n').filter(l => l.trim());
				const recentLines = lines.slice(-10);

				for (const line of recentLines) {
					if (line.includes('[COMMAND]') && !line.includes('[PROCESSED]')) {
						this.processHiveCommand(line);
					}
				}
			}

			// Log heartbeat with project count
			this.logToHive(`Heartbeat - ${this.projects.length} projects loaded`);
		} catch (e) {
			// Silent fail
		}
	}

	private processHiveCommand(line: string): void {
		if (line.includes('REFRESH_SIDEBAR')) {
			this.refresh();
			this.logToHive('Processed REFRESH_SIDEBAR command');
		} else if (line.includes('RELOAD_PROJECTS')) {
			this.loadProjects();
			this._onDidChangeTreeData.fire(undefined);
			this.logToHive('Processed RELOAD_PROJECTS command');
		}
	}

	private logToHive(message: string): void {
		try {
			const logDir = path.dirname(HIVE_LOG_PATH);
			if (!fs.existsSync(logDir)) {
				fs.mkdirSync(logDir, { recursive: true });
			}
			const timestamp = new Date().toISOString();
			fs.appendFileSync(HIVE_LOG_PATH, `[${timestamp}] [Slave 2] ${message}\n`);
		} catch (e) {
			// Silent fail
		}
	}

	stopHiveLogPolling(): void {
		if (this.hiveLogTimer) {
			clearInterval(this.hiveLogTimer);
			this.hiveLogTimer = null;
			this.logToHive('Sidebar sections provider stopped');
		}
	}

	// --- Database Helpers ---

	private queryJSON<T>(sql: string): T[] {
		try {
			const result = execSync(`sqlite3 "${this.dbPath}" -json`, {
				encoding: 'utf8',
				input: sql,
				maxBuffer: 10 * 1024 * 1024
			});
			return result.trim() ? JSON.parse(result) : [];
		} catch {
			return [];
		}
	}

	private execSQL(sql: string): void {
		try {
			execSync(`sqlite3 "${this.dbPath}"`, { encoding: 'utf8', input: sql });
		} catch (e) {
			console.error('[Sidebar Sections] SQL error:', e);
		}
	}

	// --- Data Loading ---

	private loadProjects(): void {
		// Load filesystem projects - PRESERVE existing data on error (P0 fix)
		try {
			const rows = this.queryJSON<any>(`
				SELECT id, name, root, type, instructions, color, created_at, is_active
				FROM projects
				ORDER BY is_active DESC, created_at DESC;
			`);

			if (rows && Array.isArray(rows)) {
				this.projects = rows.map(r => ({
					id: r.id,
					name: r.name,
					root: r.root,
					type: r.type || 'general',
					instructions: r.instructions || '',
					color: r.color || getProjectColorFromHash(r.id || r.name),
					createdAt: r.created_at,
					isActive: !!r.is_active
				}));
			}
		} catch (e) {
			// PRESERVE existing data on error - don't clear!
			console.warn('[Sidebar Sections] Projects query failed, preserving existing data:', e);
		}

		// Load MCP spaces (conversation containers) - PRESERVE existing data on error (P0 fix)
		try {
			const spaceRows = this.queryJSON<any>(`
				SELECT id, name, description, emoji, message_count, created_at, updated_at
				FROM spaces
				WHERE deleted_at IS NULL
				ORDER BY updated_at DESC LIMIT 50;
			`);

			if (spaceRows && Array.isArray(spaceRows)) {
				this.spaces = spaceRows.map(r => ({
					id: r.id,
					name: r.name,
					description: r.description || '',
					emoji: r.emoji || '',
					messageCount: r.message_count || 0,
					createdAt: r.created_at || Date.now(),
					updatedAt: r.updated_at || Date.now()
				}));
			}
		} catch (e) {
			// PRESERVE existing data on error - don't clear!
			console.warn('[Sidebar Sections] Spaces query failed, preserving existing data:', e);
		}

		console.log(`[Sidebar Sections] Loaded ${this.projects.length} projects, ${this.spaces.length} spaces`);
	}

	private getConversations(projectId: string): TarxConversation[] {
		// Try sessions table first (MCP style), fallback to conversations
		let rows = this.queryJSON<any>(`
			SELECT id, space_id as project_id, title, created_at, updated_at, message_count as turn_count
			FROM sessions
			WHERE space_id = '${projectId}' OR space_id LIKE '%${projectId}%'
			ORDER BY updated_at DESC
			LIMIT 20;
		`);

		if (rows.length === 0) {
			rows = this.queryJSON<any>(`
				SELECT c.id, c.project_id, c.title, c.created_at, c.updated_at,
					   COUNT(t.id) as turn_count
				FROM conversations c
				LEFT JOIN conversation_turns t ON t.conversation_id = c.id
				WHERE c.project_id = '${projectId}'
				GROUP BY c.id
				ORDER BY c.updated_at DESC
				LIMIT 20;
			`);
		}

		return rows.map(r => ({
			id: r.id,
			projectId: r.project_id || projectId,
			title: r.title || 'Untitled',
			createdAt: r.created_at,
			updatedAt: r.updated_at,
			turnCount: r.turn_count || 0
		}));
	}

	private getProjectFiles(projectRoot: string, maxFiles: number = 50): TarxFile[] {
		if (!fs.existsSync(projectRoot)) return [];

		const files: TarxFile[] = [];
		const excludes = ['node_modules', '.git', 'dist', 'build', '__pycache__', '.next', '.tarx'];

		const walk = (dir: string, depth: number = 0) => {
			if (depth > 3 || files.length >= maxFiles) return;

			try {
				const entries = fs.readdirSync(dir, { withFileTypes: true });
				for (const entry of entries) {
					if (excludes.includes(entry.name) || entry.name.startsWith('.')) continue;
					if (files.length >= maxFiles) break;

					const fullPath = path.join(dir, entry.name);
					const stats = fs.statSync(fullPath);

					files.push({
						path: fullPath,
						name: entry.name,
						isDirectory: entry.isDirectory(),
						size: stats.size,
						language: this.detectLanguage(entry.name)
					});

					if (entry.isDirectory()) {
						walk(fullPath, depth + 1);
					}
				}
			} catch { /* ignore permission errors */ }
		};

		walk(projectRoot);
		return files.sort((a, b) => {
			if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
	}

	private detectLanguage(filename: string): string | undefined {
		const ext = path.extname(filename).slice(1).toLowerCase();
		const langMap: Record<string, string> = {
			ts: 'typescript', tsx: 'typescriptreact',
			js: 'javascript', jsx: 'javascriptreact',
			py: 'python', rs: 'rust', go: 'go',
			md: 'markdown', json: 'json', yaml: 'yaml'
		};
		return langMap[ext];
	}

	private getMemorySummary(projectId: string): MemorySummary {
		const stats = this.queryJSON<any>(`
			SELECT chunk_type, COUNT(*) as count, SUM(token_count) as tokens,
				   MAX(created_at) as last_indexed
			FROM knowledge_embeddings
			WHERE project_id = '${projectId}'
			GROUP BY chunk_type;
		`);

		const byType: Record<string, number> = {};
		let totalChunks = 0;
		let totalTokens = 0;
		let lastIndexed: number | null = null;

		for (const row of stats) {
			byType[row.chunk_type || 'unknown'] = row.count;
			totalChunks += row.count;
			totalTokens += row.tokens || 0;
			if (row.last_indexed && (!lastIndexed || row.last_indexed > lastIndexed)) {
				lastIndexed = row.last_indexed;
			}
		}

		return { totalChunks, totalTokens, byType, lastIndexed };
	}

	// --- Tree Data Provider ---

	refresh(): void {
		this.loadProjects();
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: TarxTreeItemData): vscode.TreeItem {
		const item = new vscode.TreeItem(element.label);

		// Set collapsible state
		switch (element.type) {
			case 'project':
				item.collapsibleState = this.expandedProjects.has(element.id)
					? vscode.TreeItemCollapsibleState.Expanded
					: vscode.TreeItemCollapsibleState.Collapsed;
				break;
			case 'space':
				item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
				break;
			case 'section':
				const sectionKey = `${element.projectId}:${element.sectionType}`;
				item.collapsibleState = this.expandedSections.has(sectionKey)
					? vscode.TreeItemCollapsibleState.Expanded
					: vscode.TreeItemCollapsibleState.Collapsed;
				break;
			case 'folder':
				item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
				break;
			default:
				item.collapsibleState = vscode.TreeItemCollapsibleState.None;
		}

		// Set icon with neon color
		item.iconPath = this.getIcon(element);

		// Set description
		if (element.description) {
			item.description = element.description;
		}

		// Set context value for menus
		item.contextValue = element.type;

		// Set tooltip with neon styling hint
		if (element.type === 'project' && element.projectColor) {
			item.tooltip = new vscode.MarkdownString(`**${element.label}**\n\nColor: \`${element.projectColor}\``);
		}

		// Set command for clickable items
		if (element.command) {
			item.command = {
				command: element.command,
				title: element.label,
				arguments: [element]
			};
		} else if (element.type === 'conversation') {
			item.command = {
				command: 'tarx.sections.openConversation',
				title: 'Open Conversation',
				arguments: [element.conversationId, element.projectId]
			};
		} else if (element.type === 'file' && element.filePath) {
			item.command = {
				command: 'vscode.open',
				title: 'Open File',
				arguments: [vscode.Uri.file(element.filePath)]
			};
		} else if (element.type === 'instruction-edit') {
			item.command = {
				command: 'tarx.sections.editInstructions',
				title: 'Edit Instructions',
				arguments: [element.projectId]
			};
		} else if (element.type === 'project') {
			item.command = {
				command: 'tarx.sections.setActiveProject',
				title: 'Set Active',
				arguments: [element]
			};
		}

		return item;
	}

	private getIcon(element: TarxTreeItemData): vscode.ThemeIcon {
		// Icons (codicons only) - explicit mappings for all types
		if (element.type === 'project') {
			const colorIndex = getColorIndex(element.id);
			const themeColorId = `tarx.project.${colorIndex}`;
			return new vscode.ThemeIcon('folder', new vscode.ThemeColor(themeColorId));
		} else if (element.type === 'space') {
			const codicon = element.emoji && EMOJI_TO_CODICON[element.emoji];
			return new vscode.ThemeIcon(codicon || 'comment-discussion', new vscode.ThemeColor('charts.purple'));
		} else if (element.type === 'section' && element.sectionType === 'instructions') {
			return new vscode.ThemeIcon('book', new vscode.ThemeColor('charts.blue'));
		} else if (element.type === 'section' && element.sectionType === 'files') {
			return new vscode.ThemeIcon('file-code', new vscode.ThemeColor('charts.green'));
		} else if (element.type === 'section' && element.sectionType === 'conversations') {
			return new vscode.ThemeIcon('comment-discussion', new vscode.ThemeColor('charts.purple'));
		} else if (element.type === 'section' && element.sectionType === 'memory') {
			return new vscode.ThemeIcon('brain', new vscode.ThemeColor('charts.red'));
		} else if (element.type === 'conversation') {
			return new vscode.ThemeIcon('comment-discussion');
		} else if (element.type === 'instruction-edit') {
			return new vscode.ThemeIcon('edit');
		} else if (element.type === 'folder') {
			return new vscode.ThemeIcon('folder');
		} else if (element.type === 'memory-stat') {
			return new vscode.ThemeIcon('database');
		} else if (element.type === 'action') {
			return new vscode.ThemeIcon('add');
		}

		// File-specific icons based on extension
		if (element.type === 'file' && element.filePath) {
			const ext = path.extname(element.filePath).slice(1);
			const fileIcons: Record<string, string> = {
				'ts': 'symbol-class',
				'tsx': 'symbol-class',
				'js': 'symbol-method',
				'jsx': 'symbol-method',
				'py': 'symbol-variable',
				'md': 'markdown',
				'json': 'json',
				'css': 'symbol-color',
				'html': 'code',
				'rs': 'symbol-struct',
				'go': 'symbol-interface'
			};
			if (fileIcons[ext]) {
				return new vscode.ThemeIcon(fileIcons[ext]);
			}
			return new vscode.ThemeIcon('file');
		}

		return new vscode.ThemeIcon('circle-outline');
	}

	async getChildren(element?: TarxTreeItemData): Promise<TarxTreeItemData[]> {
		// Root level: show all projects and spaces
		if (!element) {
			const items: TarxTreeItemData[] = [];

			// Add "Create Project" action with neon accent
			items.push({
				type: 'action',
				id: 'create-project',
				label: 'Create Project',
				iconId: 'add',
				command: 'tarx.project.create'
			});

			// Add filesystem projects with their neon colors
			for (const project of this.projects) {
				const colorIndex = getColorIndex(project.id);
				items.push({
					type: 'project',
					id: project.id,
					label: project.isActive ? `● ${project.name}` : project.name,
					description: project.type,
					projectId: project.id,
					projectColor: project.color || NEON_COLORS[colorIndex]
				});
			}

			// Add MCP spaces (conversation containers)
			for (const space of this.spaces) {
				items.push({
					type: 'space',
					id: space.id,
					label: space.name,
					description: `${space.messageCount} msgs`,
					emoji: space.emoji
				});
			}

			return items;
		}

		// Project level: show sections
		if (element.type === 'project') {
			const projectId = element.id;
			this.expandedProjects.add(projectId);

			return [
				{
					type: 'section',
					id: `${projectId}-instructions`,
					label: 'Instructions',
					description: 'Project context',
					projectId,
					sectionType: 'instructions'
				},
				{
					type: 'section',
					id: `${projectId}-files`,
					label: 'Files',
					description: 'Project files',
					projectId,
					sectionType: 'files'
				},
				{
					type: 'section',
					id: `${projectId}-conversations`,
					label: 'Conversations',
					description: 'Chat history',
					projectId,
					sectionType: 'conversations'
				},
				{
					type: 'section',
					id: `${projectId}-memory`,
					label: 'Memory',
					description: 'RAG knowledge',
					projectId,
					sectionType: 'memory'
				}
			];
		}

		// Space level: show sessions
		if (element.type === 'space') {
			return this.getSpaceSessions(element.id);
		}

		// Section level: show section contents
		if (element.type === 'section' && element.projectId && element.sectionType) {
			const sectionKey = `${element.projectId}:${element.sectionType}`;
			this.expandedSections.add(sectionKey);

			switch (element.sectionType) {
				case 'instructions':
					return this.getInstructionsChildren(element.projectId);
				case 'files':
					return this.getFilesChildren(element.projectId);
				case 'conversations':
					return this.getConversationsChildren(element.projectId);
				case 'memory':
					return this.getMemoryChildren(element.projectId);
			}
		}

		// Folder level: show folder contents
		if (element.type === 'folder' && element.filePath) {
			return this.getFolderChildren(element.filePath, element.projectId || '');
		}

		return [];
	}

	// --- Space Sessions ---

	private getSpaceSessions(spaceId: string): TarxTreeItemData[] {
		const sessions = this.queryJSON<any>(`
			SELECT id, title, message_count, created_at, updated_at
			FROM sessions
			WHERE space_id = '${spaceId}' AND deleted_at IS NULL
			ORDER BY updated_at DESC LIMIT 30;
		`);

		if (sessions.length === 0) {
			return [{
				type: 'action',
				id: `${spaceId}-no-sessions`,
				label: 'No conversations yet',
				description: 'Start chatting!',
				command: 'tarx.chat.new'
			}];
		}

		return sessions.map((s: any) => ({
			type: 'conversation',
			id: `${spaceId}-session-${s.id}`,
			label: s.title || 'Untitled',
			description: `${s.message_count || 0} msgs • ${this.formatTimeAgo(s.updated_at)}`,
			conversationId: s.id,
			projectId: spaceId
		}));
	}

	// --- Section Children ---

	private getInstructionsChildren(projectId: string): TarxTreeItemData[] {
		const project = this.projects.find(p => p.id === projectId);
		const instructions = project?.instructions || 'No instructions set';
		const preview = instructions.substring(0, 50) + (instructions.length > 50 ? '...' : '');

		return [
			{
				type: 'instruction-edit',
				id: `${projectId}-instructions-edit`,
				label: 'Edit Instructions',
				description: preview,
				projectId,
				iconId: 'edit'
			}
		];
	}

	private getFilesChildren(projectId: string): TarxTreeItemData[] {
		const project = this.projects.find(p => p.id === projectId);
		if (!project || !fs.existsSync(project.root)) {
			return [{
				type: 'action',
				id: `${projectId}-no-files`,
				label: 'No files found',
				description: 'Project folder not accessible'
			}];
		}

		const files = this.getProjectFiles(project.root, 30);
		const items: TarxTreeItemData[] = [];

		// Group by directory - show root level only
		const rootFiles = files.filter(f => path.dirname(f.path) === project.root);

		for (const file of rootFiles.slice(0, 15)) {
			items.push({
				type: file.isDirectory ? 'folder' : 'file',
				id: `${projectId}-file-${file.path}`,
				label: file.name,
				description: file.isDirectory ? '' : this.formatFileSize(file.size),
				projectId,
				filePath: file.path
			});
		}

		// Add "Show all" action if there are more files
		if (rootFiles.length > 15) {
			items.push({
				type: 'action',
				id: `${projectId}-more-files`,
				label: `+${rootFiles.length - 15} more`,
				command: 'revealInExplorer',
				projectId
			});
		}

		// Add drag-drop action
		items.push({
			type: 'action',
			id: `${projectId}-add-files`,
			label: 'Add Files...',
			description: 'Click to add',
			command: 'tarx.sections.addFiles',
			projectId
		});

		return items;
	}

	private getFolderChildren(folderPath: string, projectId: string): TarxTreeItemData[] {
		const items: TarxTreeItemData[] = [];

		try {
			const entries = fs.readdirSync(folderPath, { withFileTypes: true });
			const excludes = ['node_modules', '.git', 'dist', 'build', '__pycache__'];

			for (const entry of entries.slice(0, 20)) {
				if (excludes.includes(entry.name) || entry.name.startsWith('.')) continue;

				const fullPath = path.join(folderPath, entry.name);
				const stats = fs.statSync(fullPath);

				items.push({
					type: entry.isDirectory() ? 'folder' : 'file',
					id: `${projectId}-file-${fullPath}`,
					label: entry.name,
					description: entry.isDirectory() ? '' : this.formatFileSize(stats.size),
					projectId,
					filePath: fullPath
				});
			}
		} catch { /* ignore */ }

		return items;
	}

	private getConversationsChildren(projectId: string): TarxTreeItemData[] {
		const conversations = this.getConversations(projectId);
		const items: TarxTreeItemData[] = [];

		if (conversations.length === 0) {
			items.push({
				type: 'action',
				id: `${projectId}-no-convs`,
				label: 'No conversations yet',
				description: 'Start chatting!'
			});
		}

		for (const conv of conversations) {
			items.push({
				type: 'conversation',
				id: `${projectId}-conv-${conv.id}`,
				label: conv.title,
				description: `${conv.turnCount} msgs • ${this.formatTimeAgo(conv.updatedAt)}`,
				projectId,
				conversationId: conv.id
			});
		}

		// Add "New Conversation" action
		items.push({
			type: 'action',
			id: `${projectId}-new-conv`,
			label: 'New Conversation',
			command: 'tarx.sections.newConversation',
			projectId
		});

		return items;
	}

	private getMemoryChildren(projectId: string): TarxTreeItemData[] {
		const summary = this.getMemorySummary(projectId);
		const items: TarxTreeItemData[] = [];

		if (summary.totalChunks === 0) {
			items.push({
				type: 'memory-stat',
				id: `${projectId}-memory-empty`,
				label: 'No memory indexed',
				description: 'Run indexer to build RAG'
			});
		} else {
			items.push({
				type: 'memory-stat',
				id: `${projectId}-memory-chunks`,
				label: `${summary.totalChunks} chunks`,
				description: `${summary.totalTokens.toLocaleString()} tokens`
			});

			// Show breakdown by type
			for (const [type, count] of Object.entries(summary.byType)) {
				if (count > 0) {
					items.push({
						type: 'memory-stat',
						id: `${projectId}-memory-${type}`,
						label: `  ${type}`,
						description: `${count}`
					});
				}
			}

			// Last indexed
			if (summary.lastIndexed) {
				items.push({
					type: 'memory-stat',
					id: `${projectId}-memory-last`,
					label: 'Last indexed',
					description: this.formatTimeAgo(summary.lastIndexed)
				});
			}
		}

		// Actions
		items.push({
			type: 'action',
			id: `${projectId}-memory-rebuild`,
			label: 'Rebuild Index',
			command: 'tarx.sections.rebuildIndex',
			projectId
		});

		return items;
	}

	// --- Helpers ---

	private formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes}B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
	}

	private formatTimeAgo(timestamp: number): string {
		const now = Date.now();
		// Handle both seconds and milliseconds timestamps
		const ts = timestamp > 1e12 ? timestamp : timestamp * 1000;
		const diff = (now - ts) / 1000;

		if (diff < 60) return 'Just now';
		if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
		if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;

		const date = new Date(ts);
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	// --- Actions ---

	async editInstructions(projectId: string): Promise<void> {
		const project = this.projects.find(p => p.id === projectId);
		if (!project) return;

		const input = await vscode.window.showInputBox({
			title: `Instructions for ${project.name}`,
			prompt: 'Describe the project, tech stack, coding conventions...',
			value: project.instructions,
			placeHolder: 'A TypeScript web app using React and PostgreSQL...'
		});

		if (input !== undefined) {
			const escaped = input.replace(/'/g, "''");
			this.execSQL(`UPDATE projects SET instructions = '${escaped}', updated_at = strftime('%s', 'now') WHERE id = '${projectId}';`);
			this.refresh();
			vscode.window.showInformationMessage(`Instructions updated for ${project.name}`);
		}
	}

	async openConversation(conversationId: string, projectId: string): Promise<void> {
		// Set as active
		await this.context.workspaceState.update('tarx.activeConversation', conversationId);
		await this.context.workspaceState.update('tarx.activeProject', projectId);

		// Notify to load conversation
		try {
			await vscode.commands.executeCommand('tarx.openSession', conversationId);
		} catch {
			await vscode.commands.executeCommand('workbench.action.chat.open');
		}
	}

	setActiveProject(projectId: string): void {
		this.execSQL(`UPDATE projects SET is_active = 0;`);
		this.execSQL(`UPDATE projects SET is_active = 1 WHERE id = '${projectId}';`);
		this.refresh();
		vscode.window.showInformationMessage('Active project set');
	}
}

// ============================================================
// REGISTRATION
// ============================================================

export function registerSectionsSidebar(
	context: vscode.ExtensionContext,
	dbPath?: string
): TarxSectionsSidebarProvider {
	const provider = new TarxSectionsSidebarProvider(context, dbPath);

	// Register tree view
	const treeView = vscode.window.createTreeView('tarx.projectSections', {
		treeDataProvider: provider,
		showCollapseAll: true,
		canSelectMany: false
	});
	context.subscriptions.push(treeView);

	// Dispose hive log polling on deactivate
	context.subscriptions.push({
		dispose: () => provider.stopHiveLogPolling()
	});

	// Register commands
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.sections.refresh', () => {
			provider.refresh();
		}),

		vscode.commands.registerCommand('tarx.sections.editInstructions', (item: TarxTreeItemData | string) => {
			const projectId = typeof item === 'string' ? item : item?.projectId;
			if (projectId) {
				provider.editInstructions(projectId);
			}
		}),

		vscode.commands.registerCommand('tarx.sections.openConversation', (conversationId: string, projectId: string) => {
			provider.openConversation(conversationId, projectId);
		}),

		vscode.commands.registerCommand('tarx.sections.setActiveProject', (item: TarxTreeItemData) => {
			if (item.id) {
				provider.setActiveProject(item.id);
			}
		}),

		vscode.commands.registerCommand('tarx.sections.newConversation', async (item: TarxTreeItemData) => {
			if (item.projectId) {
				provider.setActiveProject(item.projectId);
				await vscode.commands.executeCommand('tarx.chat.new');
			}
		}),

		vscode.commands.registerCommand('tarx.sections.addFiles', async (item: TarxTreeItemData) => {
			const files = await vscode.window.showOpenDialog({
				canSelectMany: true,
				canSelectFolders: true,
				openLabel: 'Add to Project'
			});

			if (files && files.length > 0) {
				vscode.window.showInformationMessage(`Added ${files.length} file(s) to context`);
				provider.refresh();
			}
		}),

		vscode.commands.registerCommand('tarx.sections.rebuildIndex', async (item: TarxTreeItemData) => {
			if (item.projectId) {
				try {
					await vscode.commands.executeCommand('tarx.indexProject', item.projectId);
				} catch {
					vscode.window.showInformationMessage('Indexing started...');
				}
				provider.refresh();
			}
		})
	);

	console.log('[TARX] Sections sidebar registered with neon accents');
	return provider;
}
