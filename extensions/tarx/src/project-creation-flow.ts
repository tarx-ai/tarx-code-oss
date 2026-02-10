/**
 * TARX Project Creation Flow
 * Clean webview-based project creation with optional folder and dashboard
 *
 * @file extensions/tarx/src/project-creation-flow.ts
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { execSync } from 'child_process';

// ========================================
// TYPES
// ========================================

export interface ProjectData {
	id: string;
	name: string;
	instructions: string;
	workspacePath: string | null;
	contextFiles: string[];
	status: 'active' | 'archived';
	createdAt: number;
	updatedAt: number;
}

export interface DashboardData {
	project: ProjectData;
	conversations: ConversationSummary[];
	files: FileInfo[];
	memoryStats: MemoryStats;
}

interface ConversationSummary {
	id: string;
	title: string;
	messageCount: number;
	updatedAt: number;
}

interface FileInfo {
	path: string;
	name: string;
	size: number;
	indexed: boolean;
}

interface MemoryStats {
	totalChunks: number;
	totalTokens: number;
	lastIndexed: number | null;
}

// ========================================
// CONSTANTS
// ========================================

const DB_PATH = path.join(os.homedir(), 'Library/Application Support/tarx/memory.db');
const TARX_ROOT = path.join(os.homedir(), 'TARX Projects');

const COLORS = {
	primary: '#00F0FF',      // Cyan (start of primary gradient)
	primaryEnd: '#B026FF',   // Purple (end of primary gradient)
	secondary: '#00FF94',    // Green (success)
	tertiary: '#FF2E97',     // Pink (accent start)
	tertiaryEnd: '#FF6B00',  // Orange (accent end)
	background: '#09090B',
	foreground: '#FAFAFA',
	muted: '#27272A',
	border: '#3F3F46',
};

// ========================================
// PROJECT CREATION PANEL
// ========================================

export class ProjectCreationPanel {
	public static currentPanel: ProjectCreationPanel | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _disposables: vscode.Disposable[] = [];

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;
		this._extensionUri = extensionUri;

		this._panel.webview.html = this._getCreationHtml();
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
		this._setWebviewMessageListener();
	}

	public static show(extensionUri: vscode.Uri): ProjectCreationPanel {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		if (ProjectCreationPanel.currentPanel) {
			ProjectCreationPanel.currentPanel._panel.reveal(column);
			return ProjectCreationPanel.currentPanel;
		}

		const panel = vscode.window.createWebviewPanel(
			'tarxCreateProject',
			'Create Project',
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [extensionUri]
			}
		);

		ProjectCreationPanel.currentPanel = new ProjectCreationPanel(panel, extensionUri);
		return ProjectCreationPanel.currentPanel;
	}

	private _setWebviewMessageListener() {
		this._panel.webview.onDidReceiveMessage(
			async (message) => {
				switch (message.command) {
					case 'createProject':
						await this._handleCreateProject(message.data);
						break;
					case 'browseFolder':
						await this._handleBrowseFolder();
						break;
					case 'browseFiles':
						await this._handleBrowseFiles();
						break;
					case 'cancel':
						this._panel.dispose();
						break;
				}
			},
			null,
			this._disposables
		);
	}

	private async _handleCreateProject(data: {
		name: string;
		instructions: string;
		workspacePath: string | null;
		contextFiles: string[];
	}): Promise<void> {
		try {
			// Validate name
			if (!data.name || data.name.trim().length === 0) {
				this._panel.webview.postMessage({ command: 'error', message: 'Project name is required' });
				return;
			}

			const projectName = data.name.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
			const projectId = `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
			const now = Date.now();

			// Determine workspace path
			let workspacePath = data.workspacePath;
			if (!workspacePath) {
				// Auto-create in ~/TARX/{name}
				workspacePath = path.join(TARX_ROOT, projectName);
				if (!fs.existsSync(workspacePath)) {
					fs.mkdirSync(workspacePath, { recursive: true });
				}
			}

			// Create .tarx config folder
			const tarxConfigPath = path.join(workspacePath, '.tarx');
			if (!fs.existsSync(tarxConfigPath)) {
				fs.mkdirSync(tarxConfigPath, { recursive: true });
			}

			// Write instructions.md
			if (data.instructions) {
				const instructionsPath = path.join(tarxConfigPath, 'instructions.md');
				fs.writeFileSync(instructionsPath, `# ${data.name}\n\n${data.instructions}\n`, 'utf8');
			}

			// Write config.json
			const configPath = path.join(tarxConfigPath, 'config.json');
			const config = {
				id: projectId,
				name: data.name,
				created: new Date().toISOString(),
				instructions: data.instructions || '',
				contextFiles: data.contextFiles,
				settings: { autoIndex: true, ragEnabled: true }
			};
			fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

			// Save to database
			const project: ProjectData = {
				id: projectId,
				name: data.name,
				instructions: data.instructions || '',
				workspacePath,
				contextFiles: data.contextFiles,
				status: 'active',
				createdAt: now,
				updatedAt: now
			};

			await this._saveProjectToDB(project);

			// Sync to workspaceState
			await vscode.commands.executeCommand('tarx.projects.addProject', {
				id: projectId,
				name: data.name,
				path: workspacePath,
				type: 'general',
				instructions: data.instructions
			});

			// Refresh sidebar
			await vscode.commands.executeCommand('tarx.projects.refresh');

			// Close creation panel
			this._panel.dispose();

			// Show success
			vscode.window.showInformationMessage(
				`Project "${data.name}" created`,
				'Open Folder',
				'Open Dashboard'
			).then(selection => {
				if (selection === 'Open Folder') {
					vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(workspacePath!));
				} else if (selection === 'Open Dashboard') {
					ProjectDashboardPanel.show(this._extensionUri, project);
				}
			});

			// Log
			logToGodMode(`PROJECT_CREATED: ${data.name} at ${workspacePath}`);

		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			this._panel.webview.postMessage({ command: 'error', message });
		}
	}

	private async _handleBrowseFolder(): Promise<void> {
		const result = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			title: 'Select Workspace Folder',
			openLabel: 'Select Folder'
		});

		if (result && result[0]) {
			this._panel.webview.postMessage({
				command: 'folderSelected',
				path: result[0].fsPath
			});
		}
	}

	private async _handleBrowseFiles(): Promise<void> {
		const result = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: true,
			canSelectMany: true,
			title: 'Select Context Files',
			openLabel: 'Add to Context'
		});

		if (result) {
			this._panel.webview.postMessage({
				command: 'filesSelected',
				paths: result.map(uri => uri.fsPath)
			});
		}
	}

	private async _saveProjectToDB(project: ProjectData): Promise<void> {
		const sql = `
			INSERT OR REPLACE INTO projects (id, name, root, type, created_at, is_active, color)
			VALUES (
				'${project.id}',
				'${project.name.replace(/'/g, "''")}',
				'${(project.workspacePath || '').replace(/'/g, "''")}',
				'general',
				${project.createdAt},
				1,
				'#00F0FF'
			);
			UPDATE projects SET is_active = 0 WHERE id != '${project.id}';
		`;

		try {
			execSync(`sqlite3 "${DB_PATH}"`, { input: sql, encoding: 'utf8' });
		} catch (e) {
			console.error('[TARX] Failed to save project to DB:', e);
		}
	}

	private _getCreationHtml(): string {
		const nonce = getNonce();

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<title>Create Project</title>
	<style>
		${CREATION_PANEL_CSS}
	</style>
</head>
<body>
	<div class="container">
		<header class="header">
			<div class="header-icon">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
					<line x1="12" y1="11" x2="12" y2="17"/>
					<line x1="9" y1="14" x2="15" y2="14"/>
				</svg>
			</div>
			<h1>Create New Project</h1>
		</header>

		<form id="createForm" class="form">
			<!-- Project Name (Required) -->
			<div class="form-group required">
				<label for="projectName">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
					</svg>
					Project Name
					<span class="required-badge">Required</span>
				</label>
				<input
					type="text"
					id="projectName"
					placeholder="my-awesome-project"
					required
					autocomplete="off"
				/>
				<span class="hint">Letters, numbers, dashes, underscores only</span>
			</div>

			<!-- Instructions (Optional) -->
			<div class="form-group">
				<label for="instructions">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
						<polyline points="14 2 14 8 20 8"/>
						<line x1="16" y1="13" x2="8" y2="13"/>
						<line x1="16" y1="17" x2="8" y2="17"/>
					</svg>
					Instructions
					<span class="optional-badge">Optional</span>
				</label>
				<textarea
					id="instructions"
					placeholder="Describe your project, tech stack, goals...&#10;&#10;Example: A REST API for user management using TypeScript, Express, and PostgreSQL."
					rows="5"
				></textarea>
			</div>

			<!-- Workspace Folder (Optional) -->
			<div class="form-group">
				<label>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
					</svg>
					Workspace Folder
					<span class="optional-badge">Optional</span>
				</label>
				<div class="folder-selector">
					<input
						type="text"
						id="workspacePath"
						placeholder="Auto-creates in ~/TARX/{project-name}"
						readonly
					/>
					<button type="button" class="btn btn-secondary" id="browseFolder">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
						</svg>
						Browse
					</button>
					<button type="button" class="btn btn-ghost" id="clearFolder" style="display:none;">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="18" y1="6" x2="6" y2="18"/>
							<line x1="6" y1="6" x2="18" y2="18"/>
						</svg>
					</button>
				</div>
				<span class="hint">Leave empty to auto-create folder in ~/TARX/</span>
			</div>

			<!-- Context Files (Optional) -->
			<div class="form-group">
				<label>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
						<polyline points="14 2 14 8 20 8"/>
					</svg>
					Context Files
					<span class="optional-badge">Optional</span>
				</label>
				<div class="dropzone" id="dropzone">
					<div class="dropzone-content">
						<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
							<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
							<polyline points="17 8 12 3 7 8"/>
							<line x1="12" y1="3" x2="12" y2="15"/>
						</svg>
						<p>Drag & drop files or folders here</p>
						<span>or</span>
						<button type="button" class="btn btn-ghost" id="browseFiles">Browse Files</button>
					</div>
				</div>
				<div class="file-list" id="fileList"></div>
			</div>

			<!-- Error Message -->
			<div class="error-message" id="errorMessage" style="display:none;"></div>

			<!-- Actions -->
			<div class="form-actions">
				<button type="button" class="btn btn-ghost" id="cancelBtn">Cancel</button>
				<button type="submit" class="btn btn-primary" id="createBtn">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
						<line x1="12" y1="11" x2="12" y2="17"/>
						<line x1="9" y1="14" x2="15" y2="14"/>
					</svg>
					Create Project
				</button>
			</div>
		</form>
	</div>

	<script nonce="${nonce}">
		${CREATION_PANEL_JS}
	</script>
</body>
</html>`;
	}

	public dispose() {
		ProjectCreationPanel.currentPanel = undefined;
		this._panel.dispose();
		while (this._disposables.length) {
			const disposable = this._disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}
	}
}

// ========================================
// PROJECT DASHBOARD PANEL
// ========================================

export class ProjectDashboardPanel {
	public static panels: Map<string, ProjectDashboardPanel> = new Map();
	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private readonly _project: ProjectData;
	private _disposables: vscode.Disposable[] = [];

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, project: ProjectData) {
		this._panel = panel;
		this._extensionUri = extensionUri;
		this._project = project;

		this._updateContent();
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
		this._setWebviewMessageListener();
	}

	public static show(extensionUri: vscode.Uri, project: ProjectData): ProjectDashboardPanel {
		const existingPanel = ProjectDashboardPanel.panels.get(project.id);
		if (existingPanel) {
			existingPanel._panel.reveal();
			return existingPanel;
		}

		const panel = vscode.window.createWebviewPanel(
			'tarxProjectDashboard',
			`${project.name}`,
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [extensionUri]
			}
		);

		panel.iconPath = new vscode.ThemeIcon('folder');

		const dashboardPanel = new ProjectDashboardPanel(panel, extensionUri, project);
		ProjectDashboardPanel.panels.set(project.id, dashboardPanel);
		return dashboardPanel;
	}

	private async _updateContent() {
		const dashboardData = await this._loadDashboardData();
		this._panel.webview.html = this._getDashboardHtml(dashboardData);
	}

	private async _loadDashboardData(): Promise<DashboardData> {
		// Load conversations for this project
		let conversations: ConversationSummary[] = [];
		try {
			const result = execSync(
				`sqlite3 "${DB_PATH}" -json "SELECT id, title, message_count, updated_at FROM sessions WHERE space_id = '${this._project.id}' ORDER BY updated_at DESC LIMIT 20"`,
				{ encoding: 'utf8' }
			);
			const rows = JSON.parse(result || '[]');
			conversations = rows.map((r: any) => ({
				id: r.id,
				title: r.title || 'Untitled',
				messageCount: r.message_count || 0,
				updatedAt: r.updated_at
			}));
		} catch (e) {
			// Ignore
		}

		// Load files from workspace
		let files: FileInfo[] = [];
		if (this._project.workspacePath && fs.existsSync(this._project.workspacePath)) {
			try {
				const entries = fs.readdirSync(this._project.workspacePath, { withFileTypes: true });
				files = entries.slice(0, 50).map(entry => {
					const fullPath = path.join(this._project.workspacePath!, entry.name);
					let size = 0;
					try {
						const stat = fs.statSync(fullPath);
						size = stat.size;
					} catch (e) {}
					return {
						path: fullPath,
						name: entry.name,
						size,
						indexed: false
					};
				});
			} catch (e) {}
		}

		// Memory stats (placeholder)
		const memoryStats: MemoryStats = {
			totalChunks: 0,
			totalTokens: 0,
			lastIndexed: null
		};

		return {
			project: this._project,
			conversations,
			files,
			memoryStats
		};
	}

	private _setWebviewMessageListener() {
		this._panel.webview.onDidReceiveMessage(
			async (message) => {
				switch (message.command) {
					case 'saveInstructions':
						await this._saveInstructions(message.instructions);
						break;
					case 'openConversation':
						await vscode.commands.executeCommand('tarx.openSession', message.id);
						break;
					case 'openFile':
						await vscode.window.showTextDocument(vscode.Uri.file(message.path));
						break;
					case 'addFiles':
						await this._addFiles();
						break;
					case 'indexProject':
						await vscode.commands.executeCommand('tarx.indexProject');
						break;
					case 'refresh':
						await this._updateContent();
						break;
				}
			},
			null,
			this._disposables
		);
	}

	private async _saveInstructions(instructions: string): Promise<void> {
		if (!this._project.workspacePath) return;

		const tarxConfigPath = path.join(this._project.workspacePath, '.tarx');
		if (!fs.existsSync(tarxConfigPath)) {
			fs.mkdirSync(tarxConfigPath, { recursive: true });
		}

		const instructionsPath = path.join(tarxConfigPath, 'instructions.md');
		fs.writeFileSync(instructionsPath, `# ${this._project.name}\n\n${instructions}\n`, 'utf8');

		this._panel.webview.postMessage({ command: 'saved', field: 'instructions' });
	}

	private async _addFiles(): Promise<void> {
		const result = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: true,
			canSelectMany: true,
			title: 'Add Files to Project',
			openLabel: 'Add'
		});

		if (result) {
			// Copy files to project folder if needed
			await this._updateContent();
		}
	}

	private _getDashboardHtml(data: DashboardData): string {
		const nonce = getNonce();

		const conversationsHtml = data.conversations.length > 0
			? data.conversations.map(c => `
				<div class="list-item" data-id="${c.id}" onclick="openConversation('${c.id}')">
					<svg class="item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
					</svg>
					<div class="item-content">
						<span class="item-title">${escapeHtml(c.title)}</span>
						<span class="item-meta">${c.messageCount} messages</span>
					</div>
					<span class="item-time">${formatTimeAgo(c.updatedAt)}</span>
				</div>
			`).join('')
			: '<div class="empty-state">No conversations yet</div>';

		const filesHtml = data.files.length > 0
			? data.files.map(f => `
				<div class="list-item" onclick="openFile('${escapeHtml(f.path)}')">
					<svg class="item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
						<polyline points="14 2 14 8 20 8"/>
					</svg>
					<div class="item-content">
						<span class="item-title">${escapeHtml(f.name)}</span>
						<span class="item-meta">${formatSize(f.size)}</span>
					</div>
					${f.indexed ? '<span class="badge">Indexed</span>' : ''}
				</div>
			`).join('')
			: '<div class="empty-state">No files in workspace</div>';

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
	<title>${escapeHtml(data.project.name)} - Dashboard</title>
	<style>
		${DASHBOARD_PANEL_CSS}
	</style>
</head>
<body>
	<div class="dashboard">
		<header class="dashboard-header">
			<div class="header-content">
				<svg class="header-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
				</svg>
				<div>
					<h1>${escapeHtml(data.project.name)}</h1>
					<span class="path">${escapeHtml(data.project.workspacePath || 'No workspace folder')}</span>
				</div>
			</div>
			<div class="header-actions">
				<button class="btn btn-secondary" onclick="refresh()">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<polyline points="23 4 23 10 17 10"/>
						<path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
					</svg>
					Refresh
				</button>
			</div>
		</header>

		<div class="dashboard-grid">
			<!-- Instructions Section -->
			<section class="card instructions-card">
				<div class="card-header">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
						<polyline points="14 2 14 8 20 8"/>
						<line x1="16" y1="13" x2="8" y2="13"/>
						<line x1="16" y1="17" x2="8" y2="17"/>
					</svg>
					<h2>Instructions</h2>
					<span class="save-indicator" id="saveIndicator"></span>
				</div>
				<div class="card-content">
					<textarea
						id="instructionsEditor"
						placeholder="Add project instructions, context, and guidelines..."
						rows="8"
					>${escapeHtml(data.project.instructions)}</textarea>
				</div>
			</section>

			<!-- Conversations Section -->
			<section class="card">
				<div class="card-header">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
					</svg>
					<h2>Conversations</h2>
					<span class="count">${data.conversations.length}</span>
				</div>
				<div class="card-content list-content">
					${conversationsHtml}
				</div>
			</section>

			<!-- Files Section -->
			<section class="card">
				<div class="card-header">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
						<polyline points="14 2 14 8 20 8"/>
					</svg>
					<h2>Files</h2>
					<span class="count">${data.files.length}</span>
					<button class="btn btn-ghost btn-sm" onclick="addFiles()">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="12" y1="5" x2="12" y2="19"/>
							<line x1="5" y1="12" x2="19" y2="12"/>
						</svg>
						Add
					</button>
				</div>
				<div class="card-content list-content">
					${filesHtml}
				</div>
			</section>

			<!-- Memory Section -->
			<section class="card">
				<div class="card-header">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
						<path d="M12 6v6l4 2"/>
					</svg>
					<h2>Memory (RAG)</h2>
					<button class="btn btn-tertiary btn-sm" onclick="indexProject()">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="23 4 23 10 17 10"/>
							<path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
						</svg>
						Index
					</button>
				</div>
				<div class="card-content">
					<div class="stats-grid">
						<div class="stat">
							<span class="stat-value">${data.memoryStats.totalChunks}</span>
							<span class="stat-label">Chunks</span>
						</div>
						<div class="stat">
							<span class="stat-value">${data.memoryStats.totalTokens}</span>
							<span class="stat-label">Tokens</span>
						</div>
						<div class="stat">
							<span class="stat-value">${data.memoryStats.lastIndexed ? formatTimeAgo(data.memoryStats.lastIndexed) : 'Never'}</span>
							<span class="stat-label">Last Indexed</span>
						</div>
					</div>
				</div>
			</section>
		</div>
	</div>

	<script nonce="${nonce}">
		${DASHBOARD_PANEL_JS}
	</script>
</body>
</html>`;
	}

	public dispose() {
		ProjectDashboardPanel.panels.delete(this._project.id);
		this._panel.dispose();
		while (this._disposables.length) {
			const disposable = this._disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}
	}
}

// ========================================
// CSS STYLES
// ========================================

const CREATION_PANEL_CSS = `
:root {
	--primary: ${COLORS.primary};
	--primaryEnd: ${COLORS.primaryEnd};
	--secondary: ${COLORS.secondary};
	--tertiary: ${COLORS.tertiary};
	--tertiaryEnd: ${COLORS.tertiaryEnd};
	--background: ${COLORS.background};
	--foreground: ${COLORS.foreground};
	--muted: ${COLORS.muted};
	--border: ${COLORS.border};
	--radius: 8px;
	--transition: 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

* {
	box-sizing: border-box;
	margin: 0;
	padding: 0;
}

body {
	font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
	font-size: 13px;
	color: var(--foreground);
	background: var(--background);
	padding: 24px;
	line-height: 1.5;
}

.container {
	max-width: 560px;
	margin: 0 auto;
}

.header {
	display: flex;
	align-items: center;
	gap: 12px;
	margin-bottom: 32px;
}

.header-icon {
	width: 48px;
	height: 48px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: linear-gradient(135deg, var(--primary), var(--secondary));
	border-radius: 12px;
	color: var(--background);
}

.header h1 {
	font-size: 20px;
	font-weight: 600;
}

.form {
	display: flex;
	flex-direction: column;
	gap: 24px;
}

.form-group {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.form-group label {
	display: flex;
	align-items: center;
	gap: 8px;
	font-weight: 500;
	color: var(--foreground);
}

.form-group label svg {
	opacity: 0.7;
}

.required-badge {
	font-size: 10px;
	padding: 2px 6px;
	background: var(--primary);
	color: var(--background);
	border-radius: 4px;
	font-weight: 600;
}

.optional-badge {
	font-size: 10px;
	padding: 2px 6px;
	background: var(--muted);
	color: var(--foreground);
	border-radius: 4px;
	opacity: 0.7;
}

input[type="text"], textarea {
	width: 100%;
	padding: 12px;
	font-size: 13px;
	border: 1px solid var(--border);
	border-radius: var(--radius);
	background: transparent;
	color: var(--foreground);
	transition: border-color var(--transition), box-shadow var(--transition);
}

input[type="text"]:focus, textarea:focus {
	outline: none;
	border-color: var(--primary);
	box-shadow: 0 0 0 3px rgba(0, 240, 255, 0.2);
}

input::placeholder, textarea::placeholder {
	color: var(--muted);
}

textarea {
	resize: vertical;
	min-height: 100px;
}

.hint {
	font-size: 11px;
	color: var(--muted);
}

.folder-selector {
	display: flex;
	gap: 8px;
}

.folder-selector input {
	flex: 1;
}

.dropzone {
	border: 2px dashed var(--border);
	border-radius: var(--radius);
	padding: 32px;
	text-align: center;
	transition: border-color var(--transition), background var(--transition);
	cursor: pointer;
}

.dropzone:hover, .dropzone.dragover {
	border-color: var(--primary);
	background: rgba(0, 240, 255, 0.05);
}

.dropzone-content {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
	color: var(--muted);
}

.dropzone-content svg {
	opacity: 0.5;
}

.dropzone-content p {
	margin: 0;
}

.dropzone-content span {
	font-size: 11px;
	opacity: 0.7;
}

.file-list {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin-top: 8px;
}

.file-item {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 12px;
	background: var(--muted);
	border-radius: var(--radius);
	font-size: 12px;
}

.file-item svg {
	flex-shrink: 0;
	opacity: 0.7;
}

.file-item span {
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.file-item button {
	background: none;
	border: none;
	color: var(--foreground);
	cursor: pointer;
	padding: 4px;
	opacity: 0.5;
	transition: opacity var(--transition);
}

.file-item button:hover {
	opacity: 1;
}

.error-message {
	padding: 12px;
	background: rgba(255, 107, 0, 0.1);
	border: 1px solid var(--tertiary);
	border-radius: var(--radius);
	color: var(--tertiary);
	font-size: 12px;
}

.form-actions {
	display: flex;
	justify-content: flex-end;
	gap: 12px;
	margin-top: 16px;
}

/* Buttons */
.btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	padding: 10px 20px;
	font-size: 13px;
	font-weight: 500;
	border-radius: var(--radius);
	border: none;
	cursor: pointer;
	transition: transform var(--transition), box-shadow var(--transition), background var(--transition);
}

.btn:hover {
	transform: scale(1.02);
}

.btn:active {
	transform: scale(0.98);
}

.btn:focus {
	outline: none;
	box-shadow: 0 0 0 3px rgba(0, 240, 255, 0.3);
}

.btn-primary {
	background: linear-gradient(90deg, var(--primary) 0%, var(--primaryEnd) 100%);
	color: white;
	box-shadow: 0 4px 15px rgba(0, 240, 255, 0.25);
}

.btn-primary:hover {
	box-shadow: 0 10px 25px rgba(0, 240, 255, 0.35);
	transform: scale(1.03);
}

.btn-secondary {
	background: var(--secondary);
	color: var(--background);
}

.btn-secondary:hover {
	box-shadow: 0 4px 12px rgba(0, 255, 148, 0.3);
}

.btn-tertiary {
	background: var(--tertiary);
	color: var(--background);
}

.btn-tertiary:hover {
	box-shadow: 0 4px 12px rgba(255, 107, 0, 0.3);
}

.btn-ghost {
	background: transparent;
	color: var(--foreground);
	border: 1px solid var(--border);
}

.btn-ghost:hover {
	background: var(--muted);
}
`;

const CREATION_PANEL_JS = `
const vscode = acquireVsCodeApi();

let workspacePath = null;
let contextFiles = [];

// Form elements
const form = document.getElementById('createForm');
const projectNameInput = document.getElementById('projectName');
const instructionsInput = document.getElementById('instructions');
const workspacePathInput = document.getElementById('workspacePath');
const browseFolderBtn = document.getElementById('browseFolder');
const clearFolderBtn = document.getElementById('clearFolder');
const browseFilesBtn = document.getElementById('browseFiles');
const dropzone = document.getElementById('dropzone');
const fileList = document.getElementById('fileList');
const errorMessage = document.getElementById('errorMessage');
const cancelBtn = document.getElementById('cancelBtn');

// Event listeners
form.addEventListener('submit', (e) => {
	e.preventDefault();
	createProject();
});

browseFolderBtn.addEventListener('click', () => {
	vscode.postMessage({ command: 'browseFolder' });
});

clearFolderBtn.addEventListener('click', () => {
	workspacePath = null;
	workspacePathInput.value = '';
	clearFolderBtn.style.display = 'none';
});

browseFilesBtn.addEventListener('click', () => {
	vscode.postMessage({ command: 'browseFiles' });
});

cancelBtn.addEventListener('click', () => {
	vscode.postMessage({ command: 'cancel' });
});

// Drag and drop
dropzone.addEventListener('dragover', (e) => {
	e.preventDefault();
	dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
	dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
	e.preventDefault();
	dropzone.classList.remove('dragover');
	// Note: File paths not accessible in webview drop events
	// Show message to use browse button
	showError('Please use the Browse button to add files');
});

// Message handler
window.addEventListener('message', (event) => {
	const message = event.data;
	switch (message.command) {
		case 'folderSelected':
			workspacePath = message.path;
			workspacePathInput.value = message.path;
			clearFolderBtn.style.display = 'block';
			break;
		case 'filesSelected':
			addFiles(message.paths);
			break;
		case 'error':
			showError(message.message);
			break;
	}
});

function createProject() {
	const name = projectNameInput.value.trim();
	if (!name) {
		showError('Project name is required');
		projectNameInput.focus();
		return;
	}

	hideError();

	vscode.postMessage({
		command: 'createProject',
		data: {
			name,
			instructions: instructionsInput.value,
			workspacePath,
			contextFiles
		}
	});
}

function addFiles(paths) {
	for (const p of paths) {
		if (!contextFiles.includes(p)) {
			contextFiles.push(p);
		}
	}
	renderFileList();
}

function removeFile(index) {
	contextFiles.splice(index, 1);
	renderFileList();
}

function renderFileList() {
	fileList.innerHTML = contextFiles.map((file, index) => {
		const name = file.split('/').pop();
		return \`
			<div class="file-item">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
					<polyline points="14 2 14 8 20 8"/>
				</svg>
				<span title="\${file}">\${name}</span>
				<button onclick="removeFile(\${index})">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18"/>
						<line x1="6" y1="6" x2="18" y2="18"/>
					</svg>
				</button>
			</div>
		\`;
	}).join('');
}

function showError(message) {
	errorMessage.textContent = message;
	errorMessage.style.display = 'block';
	setTimeout(() => hideError(), 5000);
}

function hideError() {
	errorMessage.style.display = 'none';
}
`;

const DASHBOARD_PANEL_CSS = `
:root {
	--primary: ${COLORS.primary};
	--primaryEnd: ${COLORS.primaryEnd};
	--secondary: ${COLORS.secondary};
	--tertiary: ${COLORS.tertiary};
	--tertiaryEnd: ${COLORS.tertiaryEnd};
	--background: ${COLORS.background};
	--foreground: ${COLORS.foreground};
	--muted: ${COLORS.muted};
	--border: ${COLORS.border};
	--radius: 8px;
	--transition: 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

* {
	box-sizing: border-box;
	margin: 0;
	padding: 0;
}

body {
	font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
	font-size: 13px;
	color: var(--foreground);
	background: var(--background);
	line-height: 1.5;
}

.dashboard {
	max-width: 1200px;
	margin: 0 auto;
	padding: 24px;
}

.dashboard-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 24px;
	padding-bottom: 16px;
	border-bottom: 1px solid var(--border);
}

.header-content {
	display: flex;
	align-items: center;
	gap: 16px;
}

.header-icon {
	color: var(--primary);
}

.dashboard-header h1 {
	font-size: 24px;
	font-weight: 600;
}

.dashboard-header .path {
	font-size: 12px;
	color: var(--muted);
}

.header-actions {
	display: flex;
	gap: 8px;
}

.dashboard-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
	gap: 20px;
}

.card {
	background: rgba(255, 255, 255, 0.02);
	border: 1px solid var(--border);
	border-radius: 12px;
	overflow: hidden;
}

.instructions-card {
	grid-column: 1 / -1;
}

.card-header {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 16px;
	border-bottom: 1px solid var(--border);
	background: rgba(255, 255, 255, 0.02);
}

.card-header svg {
	color: var(--primary);
}

.card-header h2 {
	font-size: 14px;
	font-weight: 600;
	flex: 1;
}

.card-header .count {
	font-size: 11px;
	padding: 2px 8px;
	background: var(--muted);
	border-radius: 10px;
}

.card-content {
	padding: 16px;
}

.list-content {
	padding: 8px;
	max-height: 300px;
	overflow-y: auto;
}

.list-item {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px 12px;
	border-radius: var(--radius);
	cursor: pointer;
	transition: background var(--transition);
}

.list-item:hover {
	background: var(--muted);
}

.item-icon {
	flex-shrink: 0;
	opacity: 0.7;
}

.item-content {
	flex: 1;
	min-width: 0;
}

.item-title {
	display: block;
	font-weight: 500;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.item-meta {
	display: block;
	font-size: 11px;
	color: var(--muted);
}

.item-time {
	font-size: 11px;
	color: var(--muted);
}

.badge {
	font-size: 10px;
	padding: 2px 6px;
	background: var(--secondary);
	color: var(--background);
	border-radius: 4px;
}

.empty-state {
	padding: 32px;
	text-align: center;
	color: var(--muted);
}

textarea {
	width: 100%;
	padding: 12px;
	font-size: 13px;
	font-family: inherit;
	border: 1px solid var(--border);
	border-radius: var(--radius);
	background: transparent;
	color: var(--foreground);
	resize: vertical;
	min-height: 120px;
	transition: border-color var(--transition), box-shadow var(--transition);
}

textarea:focus {
	outline: none;
	border-color: var(--primary);
	box-shadow: 0 0 0 3px rgba(0, 240, 255, 0.2);
}

.save-indicator {
	font-size: 11px;
	color: var(--secondary);
	opacity: 0;
	transition: opacity var(--transition);
}

.save-indicator.visible {
	opacity: 1;
}

.stats-grid {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 16px;
}

.stat {
	text-align: center;
	padding: 16px;
	background: var(--muted);
	border-radius: var(--radius);
}

.stat-value {
	display: block;
	font-size: 24px;
	font-weight: 600;
	color: var(--primary);
}

.stat-label {
	display: block;
	font-size: 11px;
	color: var(--muted);
	margin-top: 4px;
}

/* Buttons */
.btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	padding: 8px 16px;
	font-size: 13px;
	font-weight: 500;
	border-radius: var(--radius);
	border: none;
	cursor: pointer;
	transition: transform var(--transition), box-shadow var(--transition), background var(--transition);
}

.btn:hover {
	transform: scale(1.02);
}

.btn:active {
	transform: scale(0.98);
}

.btn-sm {
	padding: 4px 10px;
	font-size: 11px;
}

.btn-primary {
	background: linear-gradient(90deg, var(--primary) 0%, var(--primaryEnd) 100%);
	color: white;
	box-shadow: 0 4px 15px rgba(0, 240, 255, 0.25);
}

.btn-primary:hover {
	box-shadow: 0 10px 25px rgba(0, 240, 255, 0.35);
	transform: scale(1.03);
}

.btn-secondary {
	background: var(--secondary);
	color: var(--background);
}

.btn-tertiary {
	background: linear-gradient(90deg, var(--tertiary) 0%, var(--tertiaryEnd) 100%);
	color: white;
}

.btn-ghost {
	background: transparent;
	color: var(--foreground);
	border: 1px solid var(--border);
}

.btn-ghost:hover {
	background: var(--muted);
}

/* Scrollbar */
::-webkit-scrollbar {
	width: 6px;
}

::-webkit-scrollbar-track {
	background: transparent;
}

::-webkit-scrollbar-thumb {
	background: var(--border);
	border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
	background: var(--muted);
}
`;

const DASHBOARD_PANEL_JS = `
const vscode = acquireVsCodeApi();

let saveTimeout = null;
const instructionsEditor = document.getElementById('instructionsEditor');
const saveIndicator = document.getElementById('saveIndicator');

// Auto-save instructions
instructionsEditor.addEventListener('input', () => {
	if (saveTimeout) {
		clearTimeout(saveTimeout);
	}
	saveTimeout = setTimeout(() => {
		vscode.postMessage({
			command: 'saveInstructions',
			instructions: instructionsEditor.value
		});
	}, 1000);
});

// Message handler
window.addEventListener('message', (event) => {
	const message = event.data;
	switch (message.command) {
		case 'saved':
			saveIndicator.textContent = 'Saved';
			saveIndicator.classList.add('visible');
			setTimeout(() => {
				saveIndicator.classList.remove('visible');
			}, 2000);
			break;
	}
});

function openConversation(id) {
	vscode.postMessage({ command: 'openConversation', id });
}

function openFile(path) {
	vscode.postMessage({ command: 'openFile', path });
}

function addFiles() {
	vscode.postMessage({ command: 'addFiles' });
}

function indexProject() {
	vscode.postMessage({ command: 'indexProject' });
}

function refresh() {
	vscode.postMessage({ command: 'refresh' });
}
`;

// ========================================
// HELPER FUNCTIONS
// ========================================

function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

function formatTimeAgo(timestamp: number): string {
	const seconds = Math.floor((Date.now() - timestamp) / 1000);
	if (seconds < 60) return 'just now';
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
	if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
	return new Date(timestamp).toLocaleDateString();
}

function formatSize(bytes: number): string {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function logToGodMode(message: string): void {
	try {
		const logPath = path.join(os.homedir(), 'TARX', 'tarx-god.log');
		const timestamp = new Date().toISOString();
		fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
	} catch (e) {
		// Silent
	}
}

// ========================================
// COMMAND REGISTRATION
// ========================================

export function registerProjectCreationFlowCommands(context: vscode.ExtensionContext): void {
	// Show project creation panel
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.showCreateProject', () => {
			ProjectCreationPanel.show(context.extensionUri);
		})
	);

	// Show project dashboard
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.showProjectDashboard', async (projectId?: string) => {
			let project: ProjectData | null = null;

			if (projectId) {
				// Load from DB
				try {
					const result = execSync(
						`sqlite3 "${DB_PATH}" -json "SELECT id, name, root, created_at FROM projects WHERE id = '${projectId}'"`,
						{ encoding: 'utf8' }
					);
					const rows = JSON.parse(result || '[]');
					if (rows.length > 0) {
						const row = rows[0];
						project = {
							id: row.id,
							name: row.name,
							instructions: '',
							workspacePath: row.root,
							contextFiles: [],
							status: 'active',
							createdAt: row.created_at,
							updatedAt: row.created_at
						};

						// Load instructions from file
						if (project.workspacePath) {
							const instructionsPath = path.join(project.workspacePath, '.tarx', 'instructions.md');
							if (fs.existsSync(instructionsPath)) {
								const content = fs.readFileSync(instructionsPath, 'utf8');
								// Remove header
								project.instructions = content.replace(/^#.*\n\n/, '').trim();
							}
						}
					}
				} catch (e) {
					console.error('[TARX] Failed to load project:', e);
				}
			}

			if (!project) {
				// Show picker
				const projects = await loadProjectsFromDB();
				if (projects.length === 0) {
					vscode.window.showInformationMessage('No projects found. Create one first.');
					return;
				}

				const items = projects.map(p => ({
					label: p.name,
					description: p.workspacePath || '',
					project: p
				}));

				const selected = await vscode.window.showQuickPick(items, {
					title: 'Select Project',
					placeHolder: 'Choose a project to view dashboard'
				});

				if (selected) {
					project = selected.project;
				}
			}

			if (project) {
				ProjectDashboardPanel.show(context.extensionUri, project);
			}
		})
	);

	console.log('[TARX] Project creation flow commands registered');
}

async function loadProjectsFromDB(): Promise<ProjectData[]> {
	try {
		const result = execSync(
			`sqlite3 "${DB_PATH}" -json "SELECT id, name, root, created_at FROM projects WHERE is_active = 1 OR deleted_at IS NULL ORDER BY created_at DESC"`,
			{ encoding: 'utf8' }
		);
		const rows = JSON.parse(result || '[]');
		return rows.map((row: any) => ({
			id: row.id,
			name: row.name,
			instructions: '',
			workspacePath: row.root,
			contextFiles: [],
			status: 'active' as const,
			createdAt: row.created_at,
			updatedAt: row.created_at
		}));
	} catch (e) {
		return [];
	}
}
