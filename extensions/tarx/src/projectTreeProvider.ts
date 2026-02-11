/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TARX Project Tree Provider
 *
 * Provides a tree view for the VS Code sidebar showing:
 * - TARX spaces from memory.db (primary navigation)
 * - Sessions under each space (expandable)
 * - Current workspace project (if any)
 * - Recent filesystem projects
 *
 * Uses native VS Code TreeDataProvider pattern for clean integration.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import { emojiToCodeicon } from './emoji-codicon';

// Debug flag - set via TARX_DEBUG=true environment variable
const DEBUG = process.env.TARX_DEBUG === 'true';

function debugLog(...args: unknown[]): void {
	if (DEBUG) {
		console.log('[TARX ProjectTree]', ...args);
	}
}

function sanitizeSQL(value: string): string {
	if (!value) return '';
	return value.replace(/'/g, "''");
}

export interface ProjectData {
	id: string;
	name: string;
	path: string;
	type?: string;
	createdAt: number;
	updatedAt: number;
	instructions?: string;
	fileCount?: number;
	spaceId?: string;  // Link to MCP space
}

export interface SpaceData {
	id: string;
	name: string;
	description: string;
	emoji?: string;
	sessionCount: number;
	updatedAt: number;
}

export interface SessionData {
	id: string;
	title: string;
	spaceId: string;
	messageCount: number;
	createdAt: number;
	updatedAt: number;
}

type ProjectItemType = 'project' | 'current-project' | 'action' | 'header' | 'info' | 'session' | 'space';

export class ProjectItem extends vscode.TreeItem {
	constructor(
		public readonly itemType: ProjectItemType,
		public readonly label: string,
		public readonly projectData?: ProjectData,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
		public readonly sessionData?: SessionData,
		public readonly spaceData?: SpaceData
	) {
		super(label, collapsibleState);
		this.setupItem();
	}

	private setupItem(): void {
		switch (this.itemType) {
			case 'current-project':
				this.contextValue = 'currentProject';
				this.iconPath = new vscode.ThemeIcon('folder-opened', new vscode.ThemeColor('charts.green'));
				this.description = 'Current';
				if (this.projectData) {
					this.tooltip = `${this.projectData.path}\n${this.projectData.fileCount || 0} files indexed`;
				}
				break;

			case 'project':
				this.contextValue = 'project';
				this.iconPath = new vscode.ThemeIcon('folder');
				if (this.projectData) {
					this.description = this.formatRelativeTime(this.projectData.updatedAt);
					this.tooltip = this.projectData.path;
				}
				break;

			case 'space':
				this.contextValue = 'space';
				this.iconPath = emojiToCodeicon(this.spaceData?.emoji);
				if (this.spaceData) {
					const count = this.spaceData.sessionCount;
					this.description = `${count} session${count !== 1 ? 's' : ''}`;
					this.tooltip = this.spaceData.description || this.spaceData.name;
				}
				break;

			case 'session':
				this.contextValue = 'session';
				this.iconPath = new vscode.ThemeIcon('comment-discussion');
				if (this.sessionData) {
					this.description = `${this.sessionData.messageCount} msgs \u2022 ${this.formatRelativeTime(this.sessionData.updatedAt)}`;
					this.tooltip = `Session: ${this.sessionData.title}\nClick to open`;
					this.command = {
						command: 'tarx.openSession',
						title: 'Open Session',
						arguments: [this.sessionData.id, this.sessionData.spaceId]
					};
				}
				break;

			case 'action':
				this.contextValue = 'action';
				break;

			case 'header':
				this.contextValue = 'header';
				break;

			case 'info':
				this.contextValue = 'info';
				this.iconPath = new vscode.ThemeIcon('info');
				break;
		}
	}

	private formatRelativeTime(timestamp: number): string {
		const now = Date.now();
		const diff = now - timestamp;

		if (diff < 60000) return 'Just now';
		if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
		if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
		if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

		const date = new Date(timestamp);
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
}

export class ProjectTreeProvider implements vscode.TreeDataProvider<ProjectItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<ProjectItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private workspaceState: vscode.Memento;
	private currentProject: ProjectData | null = null;
	private recentProjects: ProjectData[] = [];

	private static readonly WORKSPACE_STATE_KEY = 'tarx.projects';
	private static readonly CURRENT_PROJECT_KEY = 'tarx.currentProject';

	constructor(private context: vscode.ExtensionContext) {
		this.workspaceState = context.workspaceState;
		this.loadFromWorkspaceState();
		this.detectCurrentWorkspaceProject();
	}

	/**
	 * Check if a path is valid (not a UUID, is absolute)
	 */
	private isValidPath(projectPath: string): boolean {
		if (!projectPath) return false;

		// Check if path looks like a UUID
		const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		if (uuidPattern.test(projectPath) || uuidPattern.test(path.basename(projectPath))) {
			console.warn(`[TARX] Rejecting UUID as path: ${projectPath}`);
			return false;
		}

		// Must be absolute
		if (!path.isAbsolute(projectPath)) {
			console.warn(`[TARX] Rejecting non-absolute path: ${projectPath}`);
			return false;
		}

		return true;
	}

	/**
	 * Load projects from workspace state
	 */
	private loadFromWorkspaceState(): void {
		const stored = this.workspaceState.get<ProjectData[]>(ProjectTreeProvider.WORKSPACE_STATE_KEY, []);

		// Filter out projects with invalid paths (UUIDs, non-existent, etc.)
		const validProjects = stored.filter(project => {
			if (!this.isValidPath(project.path)) {
				console.warn(`[TARX] Removing project with invalid path: ${project.name} -> ${project.path}`);
				return false;
			}
			// Also check if path still exists
			if (!fs.existsSync(project.path)) {
				console.warn(`[TARX] Removing project with non-existent path: ${project.name} -> ${project.path}`);
				return false;
			}
			return true;
		});

		// Save cleaned list if we removed any
		if (validProjects.length !== stored.length) {
			console.log(`[TARX] Cleaned up ${stored.length - validProjects.length} invalid projects`);
			this.workspaceState.update(ProjectTreeProvider.WORKSPACE_STATE_KEY, validProjects);
		}

		this.recentProjects = validProjects;

		const currentId = this.workspaceState.get<string>(ProjectTreeProvider.CURRENT_PROJECT_KEY);
		if (currentId) {
			this.currentProject = this.recentProjects.find(p => p.id === currentId) || null;
			// If current project was removed, clear the reference
			if (!this.currentProject) {
				this.workspaceState.update(ProjectTreeProvider.CURRENT_PROJECT_KEY, null);
			}
		}
	}

	/**
	 * Save projects to workspace state
	 */
	private async saveToWorkspaceState(): Promise<void> {
		debugLog('saveToWorkspaceState() - saving', this.recentProjects.length, 'projects, currentProject:', this.currentProject?.name);
		await this.workspaceState.update(ProjectTreeProvider.WORKSPACE_STATE_KEY, this.recentProjects);
		await this.workspaceState.update(
			ProjectTreeProvider.CURRENT_PROJECT_KEY,
			this.currentProject?.id || null
		);
		debugLog('saveToWorkspaceState() - completed');
	}

	/**
	 * Detect if current workspace folder should become a project
	 */
	private detectCurrentWorkspaceProject(): void {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return;
		}

		const workspacePath = workspaceFolders[0].uri.fsPath;
		const workspaceName = workspaceFolders[0].name;

		// Check if this workspace is already in our projects
		const existing = this.recentProjects.find(p => p.path === workspacePath);
		if (existing) {
			this.currentProject = existing;
			existing.updatedAt = Date.now();
			this.saveToWorkspaceState();
			return;
		}

		// Check for .tarx folder to see if it's a TARX project
		const tarxDir = path.join(workspacePath, '.tarx');
		if (fs.existsSync(tarxDir)) {
			// Auto-create project from .tarx folder
			const newProject = this.createProjectFromPath(workspacePath, workspaceName);
			this.addProject(newProject);
			this.currentProject = newProject;
		}
	}

	/**
	 * Create a project data object from a path
	 */
	private createProjectFromPath(projectPath: string, name?: string): ProjectData {
		const projectName = name || path.basename(projectPath);
		const projectType = this.detectProjectType(projectPath);

		return {
			id: this.generateId(),
			name: projectName,
			path: projectPath,
			type: projectType,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			fileCount: 0
		};
	}

	/**
	 * Detect project type from folder contents
	 */
	private detectProjectType(projectPath: string): string {
		try {
			if (fs.existsSync(path.join(projectPath, 'package.json'))) {
				const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf-8'));
				if (pkg.devDependencies?.typescript || pkg.dependencies?.typescript) {
					return 'typescript';
				}
				return 'javascript';
			}
			if (fs.existsSync(path.join(projectPath, 'Cargo.toml'))) return 'rust';
			if (fs.existsSync(path.join(projectPath, 'requirements.txt')) ||
				fs.existsSync(path.join(projectPath, 'setup.py')) ||
				fs.existsSync(path.join(projectPath, 'pyproject.toml'))) return 'python';
			if (fs.existsSync(path.join(projectPath, 'go.mod'))) return 'go';
			if (fs.existsSync(path.join(projectPath, 'pom.xml')) ||
				fs.existsSync(path.join(projectPath, 'build.gradle'))) return 'java';
		} catch {
			// Ignore detection errors
		}
		return 'general';
	}

	/**
	 * Generate a unique ID
	 */
	private generateId(): string {
		return `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Add a project to the list
	 */
	addProject(project: ProjectData): void {
		debugLog('addProject() called with:', project.name, project.path);

		// Validate path before adding
		if (!this.isValidPath(project.path)) {
			debugLog(`Cannot add project with invalid path: ${project.path}`);
			return;
		}

		// Remove if already exists
		this.recentProjects = this.recentProjects.filter(p => p.path !== project.path);
		// Add to front
		this.recentProjects.unshift(project);
		// Keep only last 20
		this.recentProjects = this.recentProjects.slice(0, 20);

		debugLog('recentProjects now has', this.recentProjects.length, 'projects');

		this.saveToWorkspaceState();
		this.refresh();

		debugLog('addProject() completed, refresh() called');
	}

	/**
	 * Set the current project
	 */
	setCurrentProject(project: ProjectData | null): void {
		this.currentProject = project;
		if (project) {
			project.updatedAt = Date.now();
			this.addProject(project);
		}
		this.saveToWorkspaceState();
		this.refresh();
	}

	/**
	 * Get the current project
	 */
	getCurrentProject(): ProjectData | null {
		return this.currentProject;
	}

	/**
	 * Get all recent projects
	 */
	getRecentProjects(): ProjectData[] {
		return this.recentProjects;
	}

	/**
	 * Remove a project from the list
	 */
	removeProject(projectId: string): void {
		this.recentProjects = this.recentProjects.filter(p => p.id !== projectId);
		if (this.currentProject?.id === projectId) {
			this.currentProject = null;
		}
		this.saveToWorkspaceState();
		this.refresh();
	}

	/**
	 * Update a project's data
	 */
	updateProject(projectId: string, updates: Partial<ProjectData>): void {
		const project = this.recentProjects.find(p => p.id === projectId);
		if (project) {
			Object.assign(project, updates, { updatedAt: Date.now() });
			this.saveToWorkspaceState();
			this.refresh();
		}
	}

	/**
	 * Create project from current workspace
	 */
	async createFromCurrentWorkspace(): Promise<ProjectData | null> {
		console.log('[TARX] createFromCurrentWorkspace started');

		try {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				console.log('[TARX] No workspace folders found');
				vscode.window.showWarningMessage('No workspace folder open. Open a folder first.');
				return null;
			}

			const workspacePath = workspaceFolders[0].uri.fsPath;
			const workspaceName = workspaceFolders[0].name;
			console.log('[TARX] Workspace path:', workspacePath, 'name:', workspaceName);

			// Check if already exists
			const existing = this.recentProjects.find(p => p.path === workspacePath);
			if (existing) {
				console.log('[TARX] Project already exists:', existing.id);
				this.setCurrentProject(existing);
				return existing;
			}

			// Create new project
			console.log('[TARX] Creating new project from path');
			const project = this.createProjectFromPath(workspacePath, workspaceName);
			console.log('[TARX] Project created:', project.id, project.name);

			// Create .tarx directory
			const tarxDir = path.join(workspacePath, '.tarx');
			console.log('[TARX] Creating .tarx directory:', tarxDir);
			if (!fs.existsSync(tarxDir)) {
				fs.mkdirSync(tarxDir, { recursive: true });
			}
			console.log('[TARX] .tarx directory ready');

			console.log('[TARX] Adding project to list');
			this.addProject(project);
			console.log('[TARX] Setting as current project');
			this.setCurrentProject(project);
			console.log('[TARX] createFromCurrentWorkspace complete');

			return project;
		} catch (error) {
			console.error('[TARX] createFromCurrentWorkspace error:', error);
			throw error;
		}
	}

	/**
	 * Get database path for MCP memory.db
	 */
	private getDbPath(): string {
		return path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
	}

	/**
	 * Query database for JSON results (uses stdin to avoid shell injection)
	 */
	private queryJSON<T>(sql: string): T[] {
		try {
			const dbPath = this.getDbPath();
			if (!fs.existsSync(dbPath)) {
				return [];
			}
			const result = execSync(`sqlite3 "${dbPath}" -json`, {
				encoding: 'utf8',
				input: sql,
				maxBuffer: 10 * 1024 * 1024,
				timeout: 5000
			});
			return result.trim() ? JSON.parse(result) : [];
		} catch {
			return [];
		}
	}

	/**
	 * Get all spaces from memory.db
	 */
	getSpaces(): SpaceData[] {
		const spaces = this.queryJSON<any>(`
			SELECT sp.id, sp.name, sp.description, sp.emoji,
			       COUNT(s.id) as session_count,
			       MAX(s.updated_at) as last_activity
			FROM spaces sp
			LEFT JOIN sessions s ON s.space_id = sp.id AND s.deleted_at IS NULL
			GROUP BY sp.id
			ORDER BY last_activity DESC NULLS LAST
			LIMIT 20;
		`);

		return spaces.map((sp: any) => ({
			id: sp.id,
			name: sp.name || 'Untitled Space',
			description: sp.description || '',
			emoji: sp.emoji || undefined,
			sessionCount: sp.session_count || 0,
			updatedAt: sp.last_activity || 0
		}));
	}

	/**
	 * Get sessions for a specific space
	 */
	getSpaceSessions(spaceId: string): SessionData[] {
		const rows = this.queryJSON<any>(`
			SELECT id, title, space_id, message_count, created_at, updated_at
			FROM sessions
			WHERE space_id = '${sanitizeSQL(spaceId)}'
			  AND deleted_at IS NULL
			ORDER BY updated_at DESC
			LIMIT 50;
		`);

		// Deduplicate sessions with identical titles (e.g. "Autonomic Daemon Session")
		const seen = new Map<string, { row: any; count: number }>();
		for (const s of rows) {
			const title = s.title || 'Untitled';
			const existing = seen.get(title);
			if (existing) {
				existing.count++;
			} else {
				seen.set(title, { row: s, count: 1 });
			}
		}

		return Array.from(seen.values()).map(({ row: s, count }) => ({
			id: s.id,
			title: count > 1 ? `${s.title || 'Untitled'} (${count})` : (s.title || 'Untitled'),
			spaceId: s.space_id,
			messageCount: s.message_count || 0,
			createdAt: s.created_at || Date.now(),
			updatedAt: s.updated_at || Date.now()
		}));
	}

	/**
	 * Get sessions for a project (by spaceId link)
	 */
	getProjectSessions(project: ProjectData): SessionData[] {
		if (!project.spaceId) {
			return [];
		}
		return this.getSpaceSessions(project.spaceId);
	}

	/**
	 * Get all sessions grouped by recent activity
	 */
	getRecentSessions(limit: number = 10): SessionData[] {
		const sessions = this.queryJSON<any>(`
			SELECT id, title, space_id, message_count, created_at, updated_at
			FROM sessions
			WHERE deleted_at IS NULL
			ORDER BY updated_at DESC
			LIMIT ${Number(limit) || 10};
		`);

		return sessions.map((s: any) => ({
			id: s.id,
			title: s.title || 'Untitled',
			spaceId: s.space_id,
			messageCount: s.message_count || 0,
			createdAt: s.created_at || Date.now(),
			updatedAt: s.updated_at || Date.now()
		}));
	}

	/**
	 * Refresh the tree view
	 */
	refresh(): void {
		debugLog('refresh() - currentProject:', this.currentProject?.name, 'recentProjects count:', this.recentProjects.length);
		this._onDidChangeTreeData.fire(undefined);
	}

	/**
	 * Sync with MCP database
	 */
	async syncWithMCP(): Promise<void> {
		this.refresh();
	}

	getTreeItem(element: ProjectItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: ProjectItem): ProjectItem[] {
		debugLog('getChildren() called, element:', element?.label, element?.itemType);

		if (!element) {
			return this.getRootItems();
		}

		// Header expansion
		if (element.itemType === 'header') {
			if (element.label === 'SPACES') {
				return this.getSpaceItems();
			}
			if (element.label === 'CURRENT PROJECT') {
				return this.getCurrentProjectItems();
			}
			if (element.label === 'RECENT PROJECTS') {
				return this.getRecentProjectItems();
			}
		}

		// Space expansion - show sessions for this space
		if (element.itemType === 'space' && element.spaceData) {
			const sessions = this.getSpaceSessions(element.spaceData.id);
			debugLog('getSpaceSessions() for', element.spaceData.name, '→', sessions.length, 'sessions');

			if (sessions.length === 0) {
				const emptyItem = new ProjectItem(
					'info',
					'No sessions yet',
					undefined,
					vscode.TreeItemCollapsibleState.None
				);
				return [emptyItem];
			}

			return sessions.map(session =>
				new ProjectItem(
					'session',
					session.title,
					undefined,
					vscode.TreeItemCollapsibleState.None,
					session
				)
			);
		}

		// Project expansion - show sessions as children
		if (element.itemType === 'project' || element.itemType === 'current-project') {
			if (element.projectData) {
				const sessions = this.getProjectSessions(element.projectData);

				if (sessions.length === 0) {
					const newChatItem = new ProjectItem(
						'action',
						'Start New Chat',
						element.projectData,
						vscode.TreeItemCollapsibleState.None
					);
					newChatItem.iconPath = new vscode.ThemeIcon('add');
					newChatItem.command = {
						command: 'workbench.action.chat.open',
						title: 'Start New Chat'
					};

					return [newChatItem];
				}

				return sessions.map(session =>
					new ProjectItem(
						'session',
						session.title,
						element.projectData,
						vscode.TreeItemCollapsibleState.None,
						session
					)
				);
			}
		}

		return [];
	}

	private getRootItems(): ProjectItem[] {
		const items: ProjectItem[] = [];

		// SPACES header - primary navigation (always show, expanded)
		const spacesHeader = new ProjectItem(
			'header',
			'SPACES',
			undefined,
			vscode.TreeItemCollapsibleState.Expanded
		);
		items.push(spacesHeader);

		// Current project header (only if there's a workspace open)
		if (this.currentProject) {
			const currentHeader = new ProjectItem(
				'header',
				'CURRENT PROJECT',
				undefined,
				vscode.TreeItemCollapsibleState.Collapsed
			);
			items.push(currentHeader);
		}

		// Recent projects header (only if there are other projects)
		const otherProjects = this.recentProjects.filter(p => p.id !== this.currentProject?.id);
		if (otherProjects.length > 0) {
			const recentHeader = new ProjectItem(
				'header',
				'RECENT PROJECTS',
				undefined,
				vscode.TreeItemCollapsibleState.Collapsed
			);
			items.push(recentHeader);
		}

		return items;
	}

	private getSpaceItems(): ProjectItem[] {
		const spaces = this.getSpaces();
		debugLog('getSpaceItems() → found', spaces.length, 'spaces');

		if (spaces.length === 0) {
			const emptyItem = new ProjectItem(
				'info',
				'No spaces found',
				undefined,
				vscode.TreeItemCollapsibleState.None
			);
			emptyItem.tooltip = 'Start a conversation to create your first space';
			return [emptyItem];
		}

		return spaces.map(space =>
			new ProjectItem(
				'space',
				space.name,
				undefined,
				vscode.TreeItemCollapsibleState.Collapsed,
				undefined,
				space
			)
		);
	}

	private getCurrentProjectItems(): ProjectItem[] {
		const items: ProjectItem[] = [];

		debugLog('getCurrentProjectItems() - this.currentProject:', this.currentProject?.name || 'null');

		if (this.currentProject) {
			debugLog('Adding current project item:', this.currentProject.name);
			items.push(new ProjectItem(
				'current-project',
				this.currentProject.name,
				this.currentProject,
				vscode.TreeItemCollapsibleState.Collapsed
			));
		} else {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (workspaceFolders && workspaceFolders.length > 0) {
				const createItem = new ProjectItem('action', 'Initialize Project');
				createItem.iconPath = new vscode.ThemeIcon('add');
				createItem.command = {
					command: 'tarx.openCreateProject',
					title: 'Initialize Project'
				};
				createItem.tooltip = 'Create a TARX project from current workspace';
				items.push(createItem);
			} else {
				const createItem = new ProjectItem('action', 'Create Project');
				createItem.iconPath = new vscode.ThemeIcon('add');
				createItem.command = {
					command: 'tarx.projects.create',
					title: 'Create Project'
				};
				items.push(createItem);
			}
		}

		return items;
	}

	private getRecentProjectItems(): ProjectItem[] {
		// Filter out current project
		const otherProjects = this.recentProjects.filter(p => p.id !== this.currentProject?.id);

		return otherProjects.slice(0, 10).map(project =>
			new ProjectItem(
				'project',
				project.name,
				project,
				vscode.TreeItemCollapsibleState.Collapsed
			)
		);
	}
}

/**
 * Register the project tree provider and related commands
 */
export function registerProjectTreeProvider(context: vscode.ExtensionContext): ProjectTreeProvider {
	debugLog('registerProjectTreeProvider() starting...');

	const provider = new ProjectTreeProvider(context);
	debugLog('ProjectTreeProvider instance created');

	// Register tree view
	const treeView = vscode.window.createTreeView('tarx.projects', {
		treeDataProvider: provider,
		showCollapseAll: false
	});
	context.subscriptions.push(treeView);
	debugLog('Tree view registered for tarx.projects');

	// Safe command registration helper - prevents "command already exists" errors
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

	// Register commands
	// NOTE: tarx.projects.refresh is registered in extension.ts to avoid duplicates

	safeRegister('tarx.projects.createFromWorkspace', async () => {
			console.log('[TARX] tarx.projects.createFromWorkspace command started');
			try {
				const project = await provider.createFromCurrentWorkspace();
				console.log('[TARX] createFromCurrentWorkspace result:', project?.name || 'null');

				if (project) {
					vscode.window.showInformationMessage(`Project "${project.name}" initialized`);

					// Open project context panel - wrap in try-catch
					try {
						console.log('[TARX] Opening project context panel for:', project.id);
						await vscode.commands.executeCommand('tarx.openProjectContext', project.id);
						console.log('[TARX] Project context panel opened');
					} catch (panelError) {
						console.error('[TARX] Failed to open project context panel:', panelError);
					}
				}
			} catch (error) {
				console.error('[TARX] createFromWorkspace command error:', error);
				vscode.window.showErrorMessage(`Failed to initialize project: ${error instanceof Error ? error.message : String(error)}`);
			}
		});

	safeRegister('tarx.projects.open', async (projectPath: string) => {
			// Validate path - must be an actual file system path, not a UUID
			if (!projectPath) {
				vscode.window.showErrorMessage('No project path provided');
				return;
			}
			// Check if this is a space ID (from TARX memory.db)
			if (projectPath.startsWith('space-') || projectPath.startsWith('session-')) {
				console.log('[TARX] Detected space/session ID, delegating to main handler:', projectPath);
				try {
					await vscode.commands.executeCommand('tarx.openSession', undefined, projectPath);
					vscode.window.showInformationMessage(`Opening space: ${projectPath.slice(0, 20)}...`);
				} catch (e) {
					console.error('[TARX] Failed to open space:', e);
				}
				return;
			}
			// Check if path looks like a UUID - delegate to space/session opener
			const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
			if (uuidPattern.test(projectPath) || uuidPattern.test(path.basename(projectPath))) {
				console.log('[TARX] UUID detected in projects.open, opening as space:', projectPath);
				try {
					// Query most recent session in this space via MCP database
					const mcpDbPath = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
					if (fs.existsSync(mcpDbPath)) {
						const query = `SELECT id FROM sessions WHERE space_id = '${projectPath}' AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 1`;
						const result = execSync(`sqlite3 "${mcpDbPath}" -json`, { encoding: 'utf8', input: query });
						const sessions = JSON.parse(result || '[]') as Array<{ id: string }>;
						if (sessions.length > 0) {
							await vscode.commands.executeCommand('tarx.openSession', sessions[0].id, projectPath);
							return;
						}
					}
					await vscode.commands.executeCommand('workbench.action.chat.open', { query: '@tarx ' });
					vscode.window.showInformationMessage('No sessions in this space yet. Start chatting!');
				} catch (e) {
					console.error('[TARX] Failed to open space:', e);
					await vscode.commands.executeCommand('workbench.action.chat.open', { query: '@tarx ' });
				}
				return;
			}
			// Check if path is absolute and exists
			if (!path.isAbsolute(projectPath)) {
				vscode.window.showErrorMessage(`Project path must be absolute: "${projectPath}"`);
				return;
			}
			// Verify path exists
			if (!fs.existsSync(projectPath)) {
				vscode.window.showErrorMessage(`Project path does not exist: "${projectPath}"`);
				const project = provider.getRecentProjects().find(p => p.path === projectPath);
				if (project) {
					provider.removeProject(project.id);
				}
				return;
			}
			const uri = vscode.Uri.file(projectPath);
			await vscode.commands.executeCommand('vscode.openFolder', uri);
		});
	safeRegister('tarx.projects.remove', (item: ProjectItem) => {
		if (item.projectData) {
			provider.removeProject(item.projectData.id);
			vscode.window.showInformationMessage(`Removed "${item.projectData.name}" from recent projects`);
		}
	});

	safeRegister('tarx.projects.syncMCP', async () => {
		await provider.syncWithMCP();
		vscode.window.showInformationMessage('Synced with MCP database');
	});

	// Add project command - used by projectContextPanel to register newly created projects
	safeRegister('tarx.projects.addProject', (projectData: {
		id: string;
		name: string;
		path: string;
		type?: string;
		instructions?: string;
	}) => {
		debugLog('====== tarx.projects.addProject COMMAND RECEIVED ======');
		debugLog('projectData:', JSON.stringify(projectData));

		if (!projectData || !projectData.id || !projectData.path) {
			debugLog('Invalid project data for addProject command');
			return;
		}

		debugLog('Creating ProjectData object for:', projectData.name);

		const project: ProjectData = {
			id: projectData.id,
			name: projectData.name,
			path: projectData.path,
			type: projectData.type || 'general',
			createdAt: Date.now(),
			updatedAt: Date.now(),
			instructions: projectData.instructions
		};

		provider.addProject(project);
		provider.setCurrentProject(project);

		debugLog('Project added to sidebar, calling refresh');
	});

	debugLog('tarx.projects.addProject command registered');

	// NOTE: tarx.projects.create is registered in extension.ts to avoid duplicates

	return provider;
}