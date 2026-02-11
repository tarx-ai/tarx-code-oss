/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TARX Project Context Panel
 *
 * Grok-inspired UI for managing project context:
 * - Project instructions (editable)
 * - Conversation history tab
 * - File sources tab
 * - Memory/context viewer
 * - File upload support
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';

interface ProjectData {
	id: string;
	name: string;
	root: string;
	type: string | null;
	instructions: string;
	createdAt: number;
}

interface ConversationItem {
	id: string;
	title: string;
	timestamp: number;
	messageCount: number;
	source: 'tarx' | 'mcp';
	spaceId?: string;
}

interface FileItem {
	id: string;
	filename: string;
	path: string;
	size: number;
	mimeType: string;
	indexed: boolean;
}

interface MemoryItem {
	id: string;
	content: string;
	type: string;
	createdAt: number;
}

/**
 * Manages the Project Context webview panel
 */
export class ProjectContextPanel {
	public static currentPanel: ProjectContextPanel | undefined;
	public static readonly viewType = 'tarx.projectContext';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _disposables: vscode.Disposable[] = [];
	private _disposed: boolean = false;

	private _projectId: string | null = null;
	private _projectData: ProjectData | null = null;
	private _conversations: ConversationItem[] = [];
	private _files: FileItem[] = [];
	private _memories: MemoryItem[] = [];
	private _activeTab: 'conversations' | 'sources' | 'memory' = 'conversations';
	private _createMode: boolean = false;
	private _pendingWorkspacePath: string | null = null;
	private _chatHistory: Array<{ role: string; content: string }> = [];

	// ========================================
	// PUBLIC GETTERS FOR UI TESTING
	// ========================================

	/** Get current project ID */
	public get projectId(): string | null {
		return this._projectId;
	}

	/** Get current project data */
	public get projectData(): ProjectData | null {
		return this._projectData;
	}

	/** Get active tab name */
	public get activeTab(): 'conversations' | 'sources' | 'memory' {
		return this._activeTab;
	}

	/** Get conversation count */
	public get conversationCount(): number {
		return this._conversations.length;
	}

	/** Get file count */
	public get fileCount(): number {
		return this._files.length;
	}

	/** Get full panel state for testing */
	public getState(): {
		projectId: string | null;
		projectName: string | null;
		activeTab: string;
		conversationCount: number;
		fileCount: number;
		memoryCount: number;
		disposed: boolean;
	} {
		return {
			projectId: this._projectId,
			projectName: this._projectData?.name || null,
			activeTab: this._activeTab,
			conversationCount: this._conversations.length,
			fileCount: this._files.length,
			memoryCount: this._memories.length,
			disposed: this._disposed
		};
	}

	/** Switch to a specific tab (for testing) */
	public switchTab(tab: 'conversations' | 'sources' | 'memory'): void {
		this._activeTab = tab;
		this._updateWebview();
	}

	/** Save instructions programmatically (for testing) */
	public async saveInstructions(content: string): Promise<boolean> {
		if (!this._projectData) {
			return false;
		}
		try {
			await this._saveInstructions(content);
			return true;
		} catch {
			return false;
		}
	}

	public static createOrShow(extensionUri: vscode.Uri, projectId?: string, options?: { createMode?: boolean; workspacePath?: string }): ProjectContextPanel {
		const createMode = options?.createMode ?? false;
		const workspacePath = options?.workspacePath;
		console.log('[TARX] ProjectContextPanel.createOrShow called, projectId:', projectId, 'createMode:', createMode);

		// Use main column for create mode, beside for viewing existing projects
		const column = createMode ? vscode.ViewColumn.One : vscode.ViewColumn.Beside;
		const title = createMode ? 'Create Project' : 'Project Context';

		// If we already have a panel, show it
		if (ProjectContextPanel.currentPanel && !ProjectContextPanel.currentPanel._disposed) {
			try {
				console.log('[TARX] Revealing existing panel');
				ProjectContextPanel.currentPanel._panel.reveal(column);
				ProjectContextPanel.currentPanel._panel.title = title;

				if (createMode) {
					ProjectContextPanel.currentPanel._setCreateMode(workspacePath);
				} else if (projectId) {
					console.log('[TARX] Loading project into existing panel');
					ProjectContextPanel.currentPanel._createMode = false;
					ProjectContextPanel.currentPanel.loadProject(projectId).catch(e => {
						console.error('[TARX] Failed to load project:', e);
					});
				}
				return ProjectContextPanel.currentPanel;
			} catch (e) {
				console.warn('[TARX] Panel reveal failed, recreating:', e);
				ProjectContextPanel.currentPanel = undefined;
			}
		}

		try {
			// Create a new panel
			console.log('[TARX] Creating new webview panel');
			const panel = vscode.window.createWebviewPanel(
				ProjectContextPanel.viewType,
				title,
				column,
				{
					enableScripts: true,
					retainContextWhenHidden: true,
					localResourceRoots: [extensionUri]
				}
			);
			console.log('[TARX] Webview panel created');

			ProjectContextPanel.currentPanel = new ProjectContextPanel(panel, extensionUri);
			console.log('[TARX] ProjectContextPanel instance created');

			if (createMode) {
				ProjectContextPanel.currentPanel._setCreateMode(workspacePath);
			} else if (projectId) {
				console.log('[TARX] Loading project into new panel');
				ProjectContextPanel.currentPanel.loadProject(projectId).catch(e => {
					console.error('[TARX] Failed to load project:', e);
				});
			}

			return ProjectContextPanel.currentPanel;
		} catch (error) {
			console.error('[TARX] Failed to create webview panel:', error);
			throw error;
		}
	}

	/**
	 * Set panel to create mode for new projects
	 */
	private _setCreateMode(workspacePath?: string): void {
		this._createMode = true;
		this._projectId = null;
		this._projectData = null;
		this._pendingWorkspacePath = workspacePath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || null;
		this._panel.title = 'Create Project';
		this._updateWebview();
	}

	public static hide(): void {
		if (ProjectContextPanel.currentPanel) {
			ProjectContextPanel.currentPanel._panel.dispose();
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
	 * Load project data from database
	 */
	public async loadProject(projectId: string): Promise<void> {
		this._projectId = projectId;

		try {
			const mcpDbPath = path.join(os.homedir(), 'Library', 'Application Support', 'tarx', 'memory.db');

			if (!fs.existsSync(mcpDbPath)) {
				console.warn('[TARX] MCP database not found');
				return;
			}

			// Use sqlite3 CLI to avoid better-sqlite3 version mismatch
			const escapedProjectId = projectId.replace(/'/g, "''");

			// Load project data
			const projectQuery = `
				SELECT id, name, root, type, created_at as createdAt
				FROM projects WHERE id = '${escapedProjectId}' LIMIT 1;
			`;
			const projectResult = execSync(`sqlite3 "${mcpDbPath}" -json`, {
				encoding: 'utf8',
				input: projectQuery
			});
			const projects = JSON.parse(projectResult || '[]') as any[];
			const project = projects[0];

			if (project) {
				// Validate project root is a valid path (not a UUID)
				const uuidCheck = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
				if (!project.root || uuidCheck.test(project.root) || uuidCheck.test(project.root.replace(/^\//, ''))) {
					console.error('[TARX] Project has invalid root path (UUID):', project.root);
					this._panel.webview.postMessage({
						type: 'error',
						message: `Project "${project.name}" has an invalid path. Please re-create the project.`
					});
					return;
				}

				// Load instructions from .tarx/instructions.md if exists
				let instructions = '';
				const instructionsPath = path.join(project.root, '.tarx', 'instructions.md');
				if (fs.existsSync(instructionsPath)) {
					instructions = fs.readFileSync(instructionsPath, 'utf-8');
				}

				this._projectData = {
					...project,
					instructions
				};

				// Load project files
				const filesQuery = `
					SELECT id, file_path as path, file_size as size, mime_type as mimeType,
					       last_indexed as indexed
					FROM project_files WHERE project_id = '${escapedProjectId}'
					ORDER BY file_path;
				`;
				const filesResult = execSync(`sqlite3 "${mcpDbPath}" -json`, {
					encoding: 'utf8',
					input: filesQuery
				});
				const files = JSON.parse(filesResult || '[]') as any[];

				this._files = files.map(f => ({
					id: f.id,
					filename: path.basename(f.path),
					path: f.path,
					size: f.size || 0,
					mimeType: f.mimeType || 'application/octet-stream',
					indexed: !!f.indexed
				}));

				// Load conversations from sessions table
				const sessionsQuery = `
					SELECT s.id, s.title, s.updated_at as timestamp, s.message_count as messageCount,
					       s.space_id as spaceId
					FROM sessions s
					WHERE s.space_id = '${escapedProjectId}'
					ORDER BY s.updated_at DESC
					LIMIT 20;
				`;
				const sessionsResult = execSync(`sqlite3 "${mcpDbPath}" -json`, {
					encoding: 'utf8',
					input: sessionsQuery
				});
				const sessions = JSON.parse(sessionsResult || '[]') as any[];

				this._conversations = sessions.map(s => ({
					id: s.id,
					title: s.title || 'Untitled',
					timestamp: s.timestamp,
					messageCount: s.messageCount || 0,
					source: 'mcp' as const,
					spaceId: s.spaceId
				}));

				// Load memories from knowledge_embeddings
				const memoriesQuery = `
					SELECT id, title, content, source_type as type, created_at as createdAt
					FROM knowledge_embeddings
					ORDER BY created_at DESC
					LIMIT 20;
				`;
				const memoriesResult = execSync(`sqlite3 "${mcpDbPath}" -json`, {
					encoding: 'utf8',
					input: memoriesQuery
				});
				const memories = JSON.parse(memoriesResult || '[]') as any[];

				this._memories = memories.map(m => ({
					id: m.id,
					content: m.title || m.content?.substring(0, 100) || 'Memory',
					type: m.type,
					createdAt: m.createdAt
				}));
			}

			this._updateWebview();
		} catch (error) {
			console.error('[TARX] Error loading project:', error);
			vscode.window.showErrorMessage(`Failed to load project: ${error}`);
		}
	}

	/**
	 * Handle messages from webview
	 */
	private async _handleWebviewMessage(message: any): Promise<void> {
		switch (message.type) {
			case 'saveInstructions':
				await this._saveInstructions(message.content);
				break;

			case 'openConversation':
				vscode.commands.executeCommand('tarx.openSession', message.id, message.spaceId);
				break;

			case 'openFile':
				const fileUri = vscode.Uri.file(message.path);
				vscode.window.showTextDocument(fileUri);
				break;

			case 'uploadFile':
				await this._handleFileUpload();
				break;

			case 'uploadFiles':
				await this._handleDroppedFiles(message.paths);
				break;

			case 'switchTab':
				this._activeTab = message.tab;
				this._updateWebview();
				break;

			case 'deleteFile':
				await this._deleteFile(message.id);
				break;

			case 'savePastedText':
				await this._savePastedText(message.content, message.filename);
				break;

			case 'refreshData':
				if (this._projectId) {
					await this.loadProject(this._projectId);
				}
				break;

			case 'newConversation':
				vscode.commands.executeCommand('tarx.chat.new');
				break;

			// Create mode handlers
			case 'browseFolderForCreate':
				await this._handleBrowseFolderForCreate();
				break;

			case 'browseFilesForCreate':
				await this._handleBrowseFilesForCreate();
				break;

			case 'createProject':
				await this._handleCreateProject(message.data);
				break;

			case 'cancelCreate':
				this._panel.dispose();
				break;

			case 'sendProjectChat':
				await this._handleProjectChat(message.message);
				break;

			case 'openFullChat':
				await vscode.commands.executeCommand('workbench.action.chat.open');
				break;
		}
	}

	/**
	 * Handle folder selection for create mode
	 */
	private async _handleBrowseFolderForCreate(): Promise<void> {
		const result = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			title: 'Select Project Folder'
		});

		if (result && result[0]) {
			this._pendingWorkspacePath = result[0].fsPath;
			this._panel.webview.postMessage({
				type: 'pathSelected',
				path: result[0].fsPath
			});
		}
	}

	/**
	 * Handle file selection for create mode
	 */
	private async _handleBrowseFilesForCreate(): Promise<void> {
		const result = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: true,
			title: 'Select Context Files'
		});

		if (result && result.length > 0) {
			const paths = result.map(uri => uri.fsPath);
			this._panel.webview.postMessage({
				type: 'filesSelected',
				paths
			});
		}
	}

	/**
	 * Handle project creation from create mode
	 */
	private async _handleCreateProject(data: { name: string; path: string; instructions: string; files?: string[]; mode?: string }): Promise<void> {
		try {
			console.log('[TARX] Creating project:', data.name, data.path, 'mode:', data.mode);

			let resolvedPath = data.path;

			// Handle "create" mode — auto-create folder under ~/TARX Projects/
			if (data.mode === 'create' && resolvedPath.startsWith('~/')) {
				resolvedPath = resolvedPath.replace('~', os.homedir());
				if (!fs.existsSync(resolvedPath)) {
					fs.mkdirSync(resolvedPath, { recursive: true });
					console.log('[TARX] Created project folder:', resolvedPath);
				}
			}

			// Validate path exists
			if (!fs.existsSync(resolvedPath)) {
				this._panel.webview.postMessage({
					type: 'createError',
					error: `Folder does not exist: ${resolvedPath}`
				});
				return;
			}

			// Validate not a UUID
			const uuidCheck = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
			if (uuidCheck.test(resolvedPath) || uuidCheck.test(path.basename(resolvedPath))) {
				this._panel.webview.postMessage({
					type: 'createError',
					error: 'Invalid folder path'
				});
				return;
			}

			// Use resolvedPath from here
			data.path = resolvedPath;

			// Create .tarx directory
			const tarxDir = path.join(data.path, '.tarx');
			if (!fs.existsSync(tarxDir)) {
				fs.mkdirSync(tarxDir, { recursive: true });
			}

			// Save instructions if provided
			if (data.instructions) {
				const instructionsPath = path.join(tarxDir, 'instructions.md');
				fs.writeFileSync(instructionsPath, data.instructions, 'utf-8');
			}

			// Generate project ID
			const projectId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

			// Save to database using sqlite3 CLI
			const mcpDbPath = path.join(os.homedir(), 'Library', 'Application Support', 'tarx', 'memory.db');
			if (fs.existsSync(mcpDbPath)) {
				const now = Date.now();
				const escapedName = data.name.replace(/'/g, "''");
				const escapedPath = data.path.replace(/'/g, "''");
				const insertQuery = `
					INSERT OR REPLACE INTO projects (id, name, root, type, created_at, is_active)
					VALUES ('${projectId}', '${escapedName}', '${escapedPath}', 'general', ${now}, 1);
				`;
				execSync(`sqlite3 "${mcpDbPath}"`, {
					encoding: 'utf8',
					input: insertQuery
				});
			}

			console.log('[TARX DEBUG] Project created in DB:', projectId);
			vscode.window.showInformationMessage(`Project "${data.name}" created!`);

			// Switch to edit mode with the new project
			this._createMode = false;
			this._panel.title = 'Project Context';
			await this.loadProject(projectId);

			// Register project with the sidebar TreeProvider
			const projectData = {
				id: projectId,
				name: data.name,
				path: data.path,
				type: 'general',
				instructions: data.instructions
			};
			console.log('[TARX DEBUG] Calling tarx.projects.addProject with:', JSON.stringify(projectData));

			try {
				await vscode.commands.executeCommand('tarx.projects.addProject', projectData);
				console.log('[TARX DEBUG] tarx.projects.addProject command completed');
			} catch (cmdError) {
				console.error('[TARX DEBUG] tarx.projects.addProject command failed:', cmdError);
			}

		} catch (error) {
			console.error('[TARX] Create project error:', error);
			this._panel.webview.postMessage({
				type: 'createError',
				error: error instanceof Error ? error.message : 'Failed to create project'
			});
		}
	}

	/**
	 * Save project instructions
	 */
	private async _saveInstructions(content: string): Promise<void> {
		if (!this._projectData) return;

		try {
			const tarxDir = path.join(this._projectData.root, '.tarx');
			const instructionsPath = path.join(tarxDir, 'instructions.md');

			// Ensure .tarx directory exists
			if (!fs.existsSync(tarxDir)) {
				fs.mkdirSync(tarxDir, { recursive: true });
			}

			fs.writeFileSync(instructionsPath, content, 'utf-8');
			this._projectData.instructions = content;

			this._postMessage({ type: 'instructionsSaved' });
			vscode.window.showInformationMessage('Project instructions saved');
		} catch (error) {
			console.error('[TARX] Error saving instructions:', error);
			vscode.window.showErrorMessage('Failed to save instructions');
		}
	}

	/**
	 * Handle file upload via dialog
	 */
	private async _handleFileUpload(): Promise<void> {
		const files = await vscode.window.showOpenDialog({
			canSelectMany: true,
			openLabel: 'Upload to Project',
			filters: {
				'All Files': ['*'],
				'Documents': ['pdf', 'md', 'txt', 'doc', 'docx'],
				'Code': ['ts', 'js', 'py', 'rs', 'go', 'java']
			}
		});

		if (files && files.length > 0) {
			const paths = files.map(f => f.fsPath);
			await this._handleDroppedFiles(paths);
		}
	}

	/**
	 * Handle files dropped via drag-drop
	 */
	private async _handleDroppedFiles(filePaths: string[]): Promise<void> {
		if (!filePaths || filePaths.length === 0) return;

		// Show progress
		this._postMessage({ type: 'uploadStarted', count: filePaths.length });

		let successCount = 0;
		for (const filePath of filePaths) {
			try {
				// Read file and upload
				const content = fs.readFileSync(filePath, 'utf-8');
				const filename = path.basename(filePath);
				const stats = fs.statSync(filePath);

				await vscode.commands.executeCommand('tarx.uploadFile', {
					filename,
					content,
					size: stats.size,
					mimeType: this._getMimeType(filePath)
				});
				successCount++;
			} catch (error) {
				console.error('[TARX] Error uploading file:', filePath, error);
			}
		}

		// Notify completion
		this._postMessage({ type: 'uploadComplete', count: successCount });

		if (successCount > 0) {
			vscode.window.showInformationMessage(`Uploaded ${successCount} file(s) to project`);
		}

		// Refresh data
		if (this._projectId) {
			await this.loadProject(this._projectId);
		}
	}

	/**
	 * Get mime type from file extension
	 */
	private _getMimeType(filePath: string): string {
		const ext = path.extname(filePath).toLowerCase();
		const mimeTypes: Record<string, string> = {
			'.ts': 'text/typescript',
			'.js': 'text/javascript',
			'.py': 'text/x-python',
			'.rs': 'text/x-rust',
			'.go': 'text/x-go',
			'.java': 'text/x-java',
			'.json': 'application/json',
			'.md': 'text/markdown',
			'.txt': 'text/plain',
			'.pdf': 'application/pdf',
			'.html': 'text/html',
			'.css': 'text/css',
			'.yaml': 'text/yaml',
			'.yml': 'text/yaml',
			'.xml': 'text/xml'
		};
		return mimeTypes[ext] || 'application/octet-stream';
	}

	/**
	 * Delete a file from project
	 */
	private async _deleteFile(fileId: string): Promise<void> {
		try {
			const mcpDbPath = path.join(os.homedir(), 'Library', 'Application Support', 'tarx', 'memory.db');
			const escapedFileId = fileId.replace(/'/g, "''");
			const deleteQuery = `DELETE FROM project_files WHERE id = '${escapedFileId}';`;
			execSync(`sqlite3 "${mcpDbPath}"`, {
				encoding: 'utf8',
				input: deleteQuery
			});

			// Refresh
			if (this._projectId) {
				await this.loadProject(this._projectId);
			}
		} catch (error) {
			console.error('[TARX] Error deleting file:', error);
		}
	}

	/**
	 * Save pasted text content as a file in the project
	 */
	private async _savePastedText(content: string, filename: string): Promise<void> {
		if (!this._projectData) return;

		try {
			const tarxDir = path.join(this._projectData.root, '.tarx', 'sources');
			if (!fs.existsSync(tarxDir)) {
				fs.mkdirSync(tarxDir, { recursive: true });
			}

			const filePath = path.join(tarxDir, filename);
			fs.writeFileSync(filePath, content, 'utf-8');

			// Upload via command to get it indexed
			await vscode.commands.executeCommand('tarx.uploadFile', {
				filename,
				content,
				size: Buffer.byteLength(content, 'utf-8'),
				mimeType: 'text/plain'
			});

			vscode.window.showInformationMessage(`Saved "${filename}" to project`);

			// Refresh
			if (this._projectId) {
				await this.loadProject(this._projectId);
			}
		} catch (error) {
			console.error('[TARX] Error saving pasted text:', error);
			vscode.window.showErrorMessage('Failed to save pasted text');
		}
	}

	/**
	 * Handle inline project chat — streams from local LLM
	 */
	private async _handleProjectChat(userMessage: string): Promise<void> {
		// Build messages array
		const messages: Array<{ role: string; content: string }> = [];

		// System prompt with project context
		const instructions = this._projectData?.instructions || '';
		messages.push({
			role: 'system',
			content: `You are TARX, a local AI assistant. You are chatting in the context of the project "${this._projectData?.name || 'Unknown'}".`
				+ (instructions ? `\n\nProject instructions:\n${instructions}` : '')
				+ `\n\nBe concise. Answer in context of this project.`
		});

		// Recent chat history (last 10 turns)
		for (const msg of this._chatHistory.slice(-10)) {
			messages.push({ role: msg.role, content: msg.content });
		}

		// Current user message
		messages.push({ role: 'user', content: userMessage });
		this._chatHistory.push({ role: 'user', content: userMessage });

		try {
			const response = await fetch('http://localhost:11435/v1/chat/completions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages,
					temperature: 0.7,
					max_tokens: 1024,
					stream: true,
					repeat_penalty: 1.15,
					presence_penalty: 0.3,
					frequency_penalty: 0.1
				})
			});

			if (!response.ok) {
				this._postMessage({ type: 'chatError', error: `LLM error: ${response.status}` });
				return;
			}

			const reader = response.body?.getReader();
			if (!reader) {
				this._postMessage({ type: 'chatError', error: 'No response body' });
				return;
			}

			const decoder = new TextDecoder();
			let buffer = '';
			let fullResponse = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = line.slice(6);
						if (data === '[DONE]') break;

						try {
							const parsed = JSON.parse(data);
							const delta = parsed.choices?.[0]?.delta;
							const content = delta?.content || delta?.reasoning_content;
							if (content) {
								fullResponse += content;
								this._postMessage({ type: 'chatStreamToken', token: content });
							}
						} catch {
							// Ignore parse errors
						}
					}
				}
			}

			if (!fullResponse) {
				fullResponse = 'No response generated.';
			}

			this._chatHistory.push({ role: 'assistant', content: fullResponse });
			this._postMessage({ type: 'chatStreamEnd', content: fullResponse });

		} catch (error: any) {
			const errMsg = error?.cause?.code === 'ECONNREFUSED'
				? 'TARX Desktop is not running. Start it to use chat.'
				: String(error);
			this._postMessage({ type: 'chatError', error: errMsg });
		}
	}

	/**
	 * Post message to webview
	 */
	private _postMessage(message: any): void {
		if (!this._disposed) {
			this._panel.webview.postMessage(message);
		}
	}

	/**
	 * Update webview HTML
	 */
	private _updateWebview(): void {
		this._panel.title = this._projectData?.name
			? `Project: ${this._projectData.name}`
			: 'Project Context';
		this._panel.webview.html = this._getWebviewContent();
	}

	/**
	 * Generate webview HTML content
	 */
	private _getWebviewContent(): string {
		// If in create mode, show create project UI
		if (this._createMode) {
			return this._getCreateProjectContent();
		}

		const project = this._projectData;
		const projectName = project?.name || 'No Project Selected';
		const projectType = project?.type || 'general';
		const instructions = project?.instructions || '';

		// Format file sizes
		const formatSize = (bytes: number): string => {
			if (bytes < 1024) return `${bytes} B`;
			if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
			return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		};

		// Format timestamps
		const formatTime = (ts: number): string => {
			const now = Date.now();
			const diff = now - ts * 1000; // Convert to ms if in seconds
			if (diff < 60000) return 'Just now';
			if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
			if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
			return `${Math.floor(diff / 86400000)}d ago`;
		};

		// Generate conversation list HTML
		const conversationsHtml = this._conversations.length > 0
			? this._conversations.map(c => `
				<div class="list-item" onclick="openConversation('${c.id}', '${c.spaceId || ''}')">
					<i class="codicon codicon-comment-discussion item-icon"></i>
					<div class="item-content">
						<div class="item-title">${this._escapeHtml(c.title)}</div>
						<div class="item-meta">${c.messageCount} messages • ${formatTime(c.timestamp)}</div>
					</div>
				</div>
			`).join('')
			: '<div class="empty-state">No conversations yet. Start a new chat!</div>';

		// Generate files list HTML
		const filesHtml = this._files.length > 0
			? this._files.map(f => `
				<div class="list-item" onclick="openFile('${this._escapeHtml(f.path)}')">
					<i class="codicon codicon-${this._getFileIcon(f.mimeType)} item-icon"></i>
					<div class="item-content">
						<div class="item-title">${this._escapeHtml(f.filename)}</div>
						<div class="item-meta">${formatSize(f.size)} ${f.indexed ? '• Indexed' : ''}</div>
					</div>
					<button class="delete-btn" onclick="event.stopPropagation(); deleteFile('${f.id}')" title="Remove">×</button>
				</div>
			`).join('')
			: '<div class="empty-state">No files attached. Upload files to add context.</div>';

		// Generate memory list HTML
		const memoryHtml = this._memories.length > 0
			? this._memories.map(m => `
				<div class="list-item">
					<i class="codicon codicon-database item-icon"></i>
					<div class="item-content">
						<div class="item-title">${this._escapeHtml(m.content.substring(0, 60))}${m.content.length > 60 ? '...' : ''}</div>
						<div class="item-meta">${m.type} • ${formatTime(m.createdAt)}</div>
					</div>
				</div>
			`).join('')
			: '<div class="empty-state">No memories stored yet. Chat to build context.</div>';

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Project Context</title>
	<style>
		* {
			box-sizing: border-box;
			margin: 0;
			padding: 0;
		}

		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background: var(--vscode-editor-background);
			padding: 16px;
			line-height: 1.5;
		}

		.header {
			display: flex;
			align-items: center;
			gap: 12px;
			margin-bottom: 20px;
			padding-bottom: 16px;
			border-bottom: 1px solid var(--vscode-panel-border);
		}

		.header-icon {
			font-size: 24px;
		}

		.header-content {
			flex: 1;
		}

		.header-title {
			font-size: 18px;
			font-weight: 600;
			color: var(--vscode-foreground);
		}

		.header-meta {
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
			margin-top: 2px;
		}

		.refresh-btn {
			background: transparent;
			border: none;
			color: var(--vscode-foreground);
			cursor: pointer;
			padding: 4px 8px;
			border-radius: 4px;
			font-size: 14px;
		}

		.refresh-btn:hover {
			background: var(--vscode-toolbar-hoverBackground);
		}

		.section {
			margin-bottom: 20px;
		}

		.section-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin-bottom: 8px;
		}

		.section-title {
			font-size: 13px;
			font-weight: 600;
			color: var(--vscode-foreground);
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}

		.instructions-container {
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			border-radius: 6px;
			padding: 12px;
		}

		.instructions-label {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			margin-bottom: 8px;
		}

		.instructions-textarea {
			width: 100%;
			min-height: 100px;
			background: transparent;
			border: none;
			color: var(--vscode-input-foreground);
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			resize: vertical;
			outline: none;
		}

		.instructions-textarea::placeholder {
			color: var(--vscode-input-placeholderForeground);
		}

		.save-indicator {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			text-align: right;
			margin-top: 8px;
			opacity: 0;
			transition: opacity 0.3s;
		}

		.save-indicator.visible {
			opacity: 1;
		}

		.tabs {
			display: flex;
			gap: 0;
			margin-bottom: 12px;
			border-bottom: 1px solid var(--vscode-panel-border);
		}

		.tab {
			padding: 8px 16px;
			background: transparent;
			border: none;
			color: var(--vscode-foreground);
			cursor: pointer;
			font-size: 13px;
			border-bottom: 2px solid transparent;
			margin-bottom: -1px;
			transition: all 0.2s;
		}

		.tab:hover {
			color: var(--vscode-textLink-foreground);
		}

		.tab.active {
			color: var(--vscode-textLink-foreground);
			border-bottom-color: var(--vscode-textLink-foreground);
		}

		.tab-badge {
			background: var(--vscode-badge-background);
			color: var(--vscode-badge-foreground);
			font-size: 10px;
			padding: 2px 6px;
			border-radius: 10px;
			margin-left: 6px;
		}

		.tab-content {
			display: none;
		}

		.tab-content.active {
			display: block;
		}

		.list-item {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 10px 12px;
			background: var(--vscode-list-hoverBackground);
			border-radius: 6px;
			margin-bottom: 6px;
			cursor: pointer;
			transition: background 0.15s;
		}

		.list-item:hover {
			background: var(--vscode-list-activeSelectionBackground);
		}

		.item-icon {
			font-size: 16px;
			width: 24px;
			text-align: center;
		}

		.item-content {
			flex: 1;
			min-width: 0;
		}

		.item-title {
			font-size: 13px;
			color: var(--vscode-foreground);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		.item-meta {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			margin-top: 2px;
		}

		.delete-btn {
			background: transparent;
			border: none;
			color: var(--vscode-errorForeground);
			cursor: pointer;
			font-size: 16px;
			padding: 4px 8px;
			border-radius: 4px;
			opacity: 0;
			transition: opacity 0.15s;
		}

		.list-item:hover .delete-btn {
			opacity: 0.7;
		}

		.delete-btn:hover {
			opacity: 1 !important;
			background: var(--vscode-inputValidation-errorBackground);
		}

		.empty-state {
			text-align: center;
			padding: 24px;
			color: var(--vscode-descriptionForeground);
			font-size: 13px;
		}

		.action-bar {
			display: flex;
			gap: 8px;
			margin-top: 16px;
			padding-top: 16px;
			border-top: 1px solid var(--vscode-panel-border);
		}

		.action-btn {
			flex: 1;
			padding: 10px 16px;
			border: none;
			border-radius: 6px;
			font-size: 13px;
			cursor: pointer;
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 8px;
			transition: all 0.15s;
		}

		.action-btn.primary {
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
		}

		.action-btn.primary:hover {
			background: var(--vscode-button-hoverBackground);
		}

		.action-btn.secondary {
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
		}

		.action-btn.secondary:hover {
			background: var(--vscode-button-secondaryHoverBackground);
		}

		.no-project {
			text-align: center;
			padding: 48px 24px;
		}

		.no-project-icon {
			font-size: 48px;
			margin-bottom: 16px;
		}

		.no-project-title {
			font-size: 16px;
			font-weight: 600;
			margin-bottom: 8px;
		}

		.no-project-text {
			color: var(--vscode-descriptionForeground);
			margin-bottom: 16px;
		}

		/* Drag-drop zone */
		.drop-zone {
			border: 2px dashed var(--vscode-panel-border);
			border-radius: 8px;
			padding: 24px;
			text-align: center;
			color: var(--vscode-descriptionForeground);
			margin-bottom: 12px;
			transition: all 0.2s;
		}

		.drop-zone.drag-over {
			border-color: var(--vscode-textLink-foreground);
			background: var(--vscode-list-hoverBackground);
			color: var(--vscode-textLink-foreground);
		}

		.drop-zone-icon {
			font-size: 32px;
			margin-bottom: 8px;
		}

		.drop-zone-text {
			font-size: 13px;
		}

		/* Loading state */
		.loading {
			text-align: center;
			padding: 24px;
			color: var(--vscode-descriptionForeground);
		}

		.loading-spinner {
			display: inline-block;
			width: 20px;
			height: 20px;
			border: 2px solid var(--vscode-panel-border);
			border-radius: 50%;
			border-top-color: var(--vscode-textLink-foreground);
			animation: spin 1s linear infinite;
			margin-right: 8px;
		}

		@keyframes spin {
			to { transform: rotate(360deg); }
		}

		.source-actions {
			display: flex;
			gap: 8px;
			margin: 12px 0;
		}

		.source-actions .action-btn {
			flex: none;
			padding: 6px 12px;
			font-size: 12px;
		}

		.paste-area {
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			border-radius: 6px;
			padding: 12px;
			margin-bottom: 12px;
		}

		.paste-textarea {
			width: 100%;
			min-height: 80px;
			background: transparent;
			border: none;
			color: var(--vscode-input-foreground);
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			resize: vertical;
			outline: none;
			margin-bottom: 8px;
		}

		.paste-actions {
			display: flex;
			gap: 8px;
			align-items: center;
		}

		.paste-filename {
			flex: 1;
			padding: 6px 10px;
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			border-radius: 4px;
			color: var(--vscode-input-foreground);
			font-size: 12px;
		}

		.paste-actions .action-btn {
			flex: none;
			padding: 6px 12px;
			font-size: 12px;
		}

		/* Chat Section */
		.chat-section {
			border-top: 1px solid var(--vscode-panel-border);
			background: var(--vscode-editor-background);
			padding: 12px 0;
			margin-top: 20px;
		}

		.chat-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin-bottom: 8px;
			font-size: 13px;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}

		.open-full-btn {
			background: transparent;
			border: none;
			color: var(--vscode-foreground);
			cursor: pointer;
			padding: 4px 8px;
			border-radius: 4px;
			font-size: 14px;
			opacity: 0.6;
		}

		.open-full-btn:hover {
			background: var(--vscode-toolbar-hoverBackground);
			opacity: 1;
		}

		.chat-messages {
			max-height: 240px;
			overflow-y: auto;
			margin-bottom: 8px;
		}

		.chat-message {
			padding: 8px 12px;
			border-radius: 8px;
			margin-bottom: 6px;
			font-size: 13px;
			line-height: 1.5;
			white-space: pre-wrap;
			word-wrap: break-word;
		}

		.chat-message.user {
			background: var(--vscode-input-background);
			margin-left: 40px;
		}

		.chat-message.assistant {
			background: var(--vscode-textBlockQuote-background);
			margin-right: 40px;
		}

		.chat-message.error {
			background: var(--vscode-inputValidation-errorBackground);
			color: var(--vscode-errorForeground);
			font-size: 12px;
		}

		.chat-input-area {
			display: flex;
			gap: 8px;
		}

		.chat-input-area textarea {
			flex: 1;
			resize: none;
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			border-radius: 6px;
			color: var(--vscode-input-foreground);
			padding: 8px;
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			outline: none;
		}

		.chat-input-area textarea:focus {
			border-color: var(--vscode-textLink-foreground);
		}

		.chat-input-area button {
			padding: 8px 16px;
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			border-radius: 6px;
			cursor: pointer;
			font-size: 13px;
		}

		.chat-input-area button:hover {
			background: var(--vscode-button-hoverBackground);
		}

		.chat-input-area button:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}
	</style>
</head>
<body>
	${project ? `
	<!-- Header -->
	<div class="header">
		<i class="codicon codicon-folder header-icon"></i>
		<div class="header-content">
			<div class="header-title">${this._escapeHtml(projectName)}</div>
			<div class="header-meta">${projectType} project • ${this._files.length} files</div>
		</div>
		<button class="refresh-btn" onclick="refreshData()" title="Refresh"><i class="codicon codicon-refresh"></i></button>
	</div>

	<!-- Instructions Section -->
	<div class="section">
		<div class="section-header">
			<span class="section-title"><i class="codicon codicon-book"></i> Instructions</span>
		</div>
		<div class="instructions-container">
			<div class="instructions-label">Tell TARX about your project goals, coding style, or preferences:</div>
			<textarea
				class="instructions-textarea"
				id="instructions"
				placeholder="Example: This is a React TypeScript project. Use functional components with hooks. Follow the existing coding style..."
				onchange="saveInstructions()"
			>${this._escapeHtml(instructions)}</textarea>
			<div class="save-indicator" id="saveIndicator">Saved</div>
		</div>
	</div>

	<!-- Tabs Section -->
	<div class="section">
		<div class="tabs">
			<button class="tab ${this._activeTab === 'conversations' ? 'active' : ''}" onclick="switchTab('conversations')">
				<i class="codicon codicon-comment-discussion"></i> Conversations
				<span class="tab-badge">${this._conversations.length}</span>
			</button>
			<button class="tab ${this._activeTab === 'sources' ? 'active' : ''}" onclick="switchTab('sources')">
				<i class="codicon codicon-files"></i> Sources
				<span class="tab-badge">${this._files.length}</span>
			</button>
			<button class="tab ${this._activeTab === 'memory' ? 'active' : ''}" onclick="switchTab('memory')">
				<i class="codicon codicon-database"></i> Memory
				<span class="tab-badge">${this._memories.length}</span>
			</button>
		</div>

		<!-- Conversations Tab -->
		<div class="tab-content ${this._activeTab === 'conversations' ? 'active' : ''}" id="tab-conversations">
			${conversationsHtml}
		</div>

		<!-- Sources Tab -->
		<div class="tab-content ${this._activeTab === 'sources' ? 'active' : ''}" id="tab-sources">
			<div class="drop-zone" id="dropZone">
				<i class="codicon codicon-cloud-upload drop-zone-icon"></i>
				<div class="drop-zone-text">Drag files here or click to upload</div>
			</div>
			<div class="source-actions">
				<button class="action-btn secondary" onclick="uploadFile()"><i class="codicon codicon-cloud-upload"></i> Upload Files</button>
				<button class="action-btn secondary" onclick="togglePasteArea()"><i class="codicon codicon-clippy"></i> Paste Text</button>
			</div>
			<div class="paste-area" id="pasteArea" style="display: none;">
				<textarea id="pasteContent" class="paste-textarea" placeholder="Paste text content here (notes, documentation, specifications...)"></textarea>
				<div class="paste-actions">
					<input type="text" id="pasteFilename" class="paste-filename" placeholder="filename.txt" />
					<button class="action-btn primary" onclick="savePastedText()">Save</button>
					<button class="action-btn secondary" onclick="togglePasteArea()">Cancel</button>
				</div>
			</div>
			${filesHtml}
		</div>

		<!-- Memory Tab -->
		<div class="tab-content ${this._activeTab === 'memory' ? 'active' : ''}" id="tab-memory">
			${memoryHtml}
		</div>
	</div>

	<!-- Chat Section -->
	<div class="chat-section">
		<div class="chat-header">
			<span>Chat with TARX</span>
			<button onclick="openFullChat()" class="open-full-btn" title="Open full chat panel">
				<i class="codicon codicon-link-external"></i>
			</button>
		</div>
		<div class="chat-messages" id="chatMessages"></div>
		<div class="chat-input-area">
			<textarea id="chatInput" placeholder="Ask about this project..." rows="1" onkeydown="handleChatKeydown(event)"></textarea>
			<button id="sendBtn" onclick="sendChatMessage()">Send</button>
		</div>
	</div>
	` : `
	<!-- No Project Selected -->
	<div class="no-project">
		<i class="codicon codicon-folder no-project-icon"></i>
		<div class="no-project-title">No Project Selected</div>
		<div class="no-project-text">Initialize a project to view context.</div>
	</div>
	`}

	<script>
		const vscode = acquireVsCodeApi();
		let saveTimeout = null;

		function switchTab(tab) {
			vscode.postMessage({ type: 'switchTab', tab });
		}

		function openConversation(id, spaceId) {
			vscode.postMessage({ type: 'openConversation', id, spaceId });
		}

		function openFile(path) {
			vscode.postMessage({ type: 'openFile', path });
		}

		function deleteFile(id) {
			if (confirm('Remove this file from the project?')) {
				vscode.postMessage({ type: 'deleteFile', id });
			}
		}

		function uploadFile() {
			vscode.postMessage({ type: 'uploadFile' });
		}

		function newConversation() {
			vscode.postMessage({ type: 'newConversation' });
		}

		function refreshData() {
			vscode.postMessage({ type: 'refreshData' });
		}

		function togglePasteArea() {
			const area = document.getElementById('pasteArea');
			if (area) {
				area.style.display = area.style.display === 'none' ? 'block' : 'none';
				if (area.style.display === 'block') {
					document.getElementById('pasteContent').focus();
				}
			}
		}

		function savePastedText() {
			const content = document.getElementById('pasteContent').value.trim();
			const filename = document.getElementById('pasteFilename').value.trim() || ('pasted-' + Date.now() + '.txt');
			if (!content) { return; }
			vscode.postMessage({ type: 'savePastedText', content, filename });
			document.getElementById('pasteContent').value = '';
			document.getElementById('pasteFilename').value = '';
			togglePasteArea();
		}

		// ---- Chat functions ----
		let chatStreaming = false;

		function sendChatMessage() {
			const input = document.getElementById('chatInput');
			const msg = input.value.trim();
			if (!msg || chatStreaming) return;

			// Show user message
			appendChatMessage('user', msg);
			input.value = '';
			input.style.height = 'auto';

			chatStreaming = true;
			document.getElementById('sendBtn').disabled = true;

			// Create placeholder for assistant response
			const messagesEl = document.getElementById('chatMessages');
			const assistantEl = document.createElement('div');
			assistantEl.className = 'chat-message assistant';
			assistantEl.id = 'chat-streaming';
			assistantEl.textContent = '';
			messagesEl.appendChild(assistantEl);
			messagesEl.scrollTop = messagesEl.scrollHeight;

			vscode.postMessage({ type: 'sendProjectChat', message: msg });
		}

		function appendChatMessage(role, content) {
			const messagesEl = document.getElementById('chatMessages');
			const el = document.createElement('div');
			el.className = 'chat-message ' + role;
			el.textContent = content;
			messagesEl.appendChild(el);
			messagesEl.scrollTop = messagesEl.scrollHeight;
		}

		function handleChatKeydown(e) {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				sendChatMessage();
			}
		}

		function openFullChat() {
			vscode.postMessage({ type: 'openFullChat' });
		}

		function saveInstructions() {
			const content = document.getElementById('instructions').value;

			// Debounce save
			if (saveTimeout) clearTimeout(saveTimeout);
			saveTimeout = setTimeout(() => {
				vscode.postMessage({ type: 'saveInstructions', content });
			}, 1000);
		}

		// Handle messages from extension
		window.addEventListener('message', event => {
			const message = event.data;
			switch (message.type) {
				case 'instructionsSaved':
					const indicator = document.getElementById('saveIndicator');
					if (indicator) {
						indicator.classList.add('visible');
						setTimeout(() => indicator.classList.remove('visible'), 2000);
					}
					break;

				case 'chatStreamToken': {
					const streamEl = document.getElementById('chat-streaming');
					if (streamEl) {
						streamEl.textContent += message.token;
						const messagesEl = document.getElementById('chatMessages');
						if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
					}
					break;
				}

				case 'chatStreamEnd': {
					const streamEl = document.getElementById('chat-streaming');
					if (streamEl) {
						streamEl.textContent = message.content;
						streamEl.removeAttribute('id');
					}
					chatStreaming = false;
					const sendBtn = document.getElementById('sendBtn');
					if (sendBtn) sendBtn.disabled = false;
					break;
				}

				case 'chatError': {
					const streamEl = document.getElementById('chat-streaming');
					if (streamEl) streamEl.remove();
					appendChatMessage('error', message.error);
					chatStreaming = false;
					const sendBtn2 = document.getElementById('sendBtn');
					if (sendBtn2) sendBtn2.disabled = false;
					break;
				}
			}
		});

		// Auto-save on input
		const textarea = document.getElementById('instructions');
		if (textarea) {
			textarea.addEventListener('input', saveInstructions);
		}

		// Drag-drop support for file uploads
		const dropZone = document.getElementById('dropZone');
		if (dropZone) {
			dropZone.addEventListener('click', () => uploadFile());

			dropZone.addEventListener('dragover', (e) => {
				e.preventDefault();
				dropZone.classList.add('drag-over');
			});

			dropZone.addEventListener('dragleave', (e) => {
				e.preventDefault();
				dropZone.classList.remove('drag-over');
			});

			dropZone.addEventListener('drop', (e) => {
				e.preventDefault();
				dropZone.classList.remove('drag-over');

				const files = e.dataTransfer?.files;
				if (files && files.length > 0) {
					// Send file paths to extension
					const filePaths = Array.from(files).map(f => f.path).filter(p => p);
					if (filePaths.length > 0) {
						vscode.postMessage({ type: 'uploadFiles', paths: filePaths });
					}
				}
			});
		}

		// Auto-refresh every 30 seconds
		setInterval(() => {
			vscode.postMessage({ type: 'refreshData' });
		}, 30000);
	</script>
</body>
</html>`;
	}

	/**
	 * Generate HTML content for create project mode
	 */
	private _getCreateProjectContent(): string {
		const workspacePath = this._pendingWorkspacePath || '';
		const workspaceName = workspacePath ? path.basename(workspacePath) : '';

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Create Project</title>
	<style>
		* {
			box-sizing: border-box;
			margin: 0;
			padding: 0;
		}

		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background: var(--vscode-editor-background);
			padding: 40px;
			line-height: 1.5;
			min-height: 100vh;
		}

		.container {
			max-width: 800px;
			margin: 0 auto;
		}

		.header {
			margin-bottom: 40px;
		}

		.header h1 {
			font-size: 28px;
			font-weight: 600;
			margin-bottom: 8px;
			display: flex;
			align-items: center;
			gap: 12px;
		}

		.header .subtitle {
			font-size: 14px;
			opacity: 0.7;
		}

		.content {
			display: grid;
			grid-template-columns: 1fr 280px;
			gap: 40px;
		}

		.main-section {
			display: flex;
			flex-direction: column;
			gap: 24px;
		}

		.section {
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 8px;
			padding: 20px;
		}

		.section-title {
			font-size: 14px;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			opacity: 0.7;
			margin-bottom: 16px;
		}

		.field {
			margin-bottom: 20px;
		}

		.field:last-child {
			margin-bottom: 0;
		}

		.field label {
			display: block;
			font-size: 13px;
			font-weight: 500;
			margin-bottom: 8px;
		}

		.field input,
		.field textarea {
			width: 100%;
			padding: 10px 12px;
			font-size: 14px;
			font-family: var(--vscode-font-family);
			border: 1px solid var(--vscode-input-border);
			border-radius: 6px;
			background: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			outline: none;
		}

		.field input:focus,
		.field textarea:focus {
			border-color: #FF6B35;
		}

		.field textarea {
			min-height: 120px;
			resize: vertical;
		}

		.path-input {
			display: flex;
			gap: 8px;
		}

		.path-input input {
			flex: 1;
		}

		.path-input button {
			padding: 10px 16px;
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			border: none;
			border-radius: 6px;
			cursor: pointer;
			white-space: nowrap;
		}

		.path-input button:hover {
			opacity: 0.9;
		}

		.drop-zone {
			border: 2px dashed var(--vscode-input-border);
			border-radius: 8px;
			padding: 32px;
			text-align: center;
			cursor: pointer;
			transition: all 0.2s;
		}

		.drop-zone:hover,
		.drop-zone.drag-over {
			border-color: #FF6B35;
			background: rgba(255, 107, 53, 0.05);
		}

		.drop-zone-icon {
			font-size: 32px;
			margin-bottom: 12px;
		}

		.drop-zone-text {
			font-size: 14px;
			opacity: 0.7;
		}

		.drop-zone-hint {
			font-size: 12px;
			opacity: 0.5;
			margin-top: 8px;
		}

		.sidebar-section {
			display: flex;
			flex-direction: column;
			gap: 16px;
		}

		.btn {
			display: block;
			width: 100%;
			padding: 14px 16px;
			font-size: 14px;
			font-weight: 500;
			border: none;
			border-radius: 8px;
			cursor: pointer;
			text-align: center;
			transition: all 0.2s;
		}

		.btn-primary {
			background: linear-gradient(90deg, #00F0FF 0%, #B026FF 100%);
			color: white;
			box-shadow: 0 4px 15px rgba(0, 240, 255, 0.25);
			transition: all 0.2s ease;
		}

		.btn-primary:hover {
			background: linear-gradient(90deg, #00D4E0 0%, #9C22E0 100%);
			box-shadow: 0 10px 25px rgba(0, 240, 255, 0.35);
			transform: scale(1.03);
		}

		.btn-secondary {
			background: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
		}

		.btn:hover {
			opacity: 0.9;
		}

		.btn:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		.info-card {
			background: var(--vscode-input-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 8px;
			padding: 16px;
		}

		.info-card h3 {
			font-size: 13px;
			font-weight: 600;
			margin-bottom: 8px;
		}

		.info-card p {
			font-size: 12px;
			opacity: 0.7;
			margin: 0;
		}

		.info-card ul {
			font-size: 12px;
			opacity: 0.7;
			margin: 8px 0 0 0;
			padding-left: 20px;
		}

		.error-message {
			color: var(--vscode-errorForeground);
			font-size: 12px;
			margin-top: 4px;
		}

		.success-indicator {
			display: none;
			color: var(--vscode-testing-iconPassed);
			font-size: 12px;
			margin-top: 4px;
		}

		.success-indicator.visible {
			display: block;
		}

		.mode-tabs {
			display: flex;
			gap: 0;
			margin-bottom: 24px;
			border-bottom: 1px solid var(--vscode-panel-border);
		}

		.mode-tab {
			padding: 10px 20px;
			background: transparent;
			border: none;
			color: var(--vscode-descriptionForeground);
			cursor: pointer;
			font-size: 14px;
			font-weight: 500;
			border-bottom: 2px solid transparent;
			margin-bottom: -1px;
			transition: all 0.2s;
		}

		.mode-tab:hover {
			color: var(--vscode-foreground);
		}

		.mode-tab.active {
			color: var(--vscode-foreground);
			border-bottom-color: var(--vscode-textLink-foreground);
		}

		.auto-path {
			padding: 10px 12px;
			background: var(--vscode-textBlockQuote-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 6px;
			font-family: var(--vscode-editor-font-family);
			font-size: 13px;
			color: var(--vscode-descriptionForeground);
		}

		.auto-path-hint {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			margin-top: 4px;
			opacity: 0.7;
		}

		@media (max-width: 700px) {
			.content {
				grid-template-columns: 1fr;
			}

			body {
				padding: 20px;
			}
		}
	</style>
</head>
<body>
	<div class="container">
		<div class="header">
			<h1>Create Project</h1>
			<p class="subtitle">Set up a new TARX project to track your work</p>
		</div>

		<!-- Mode Tabs -->
		<div class="mode-tabs">
			<button class="mode-tab active" id="modeCreate" onclick="switchMode('create')">Create New</button>
			<button class="mode-tab" id="modeImport" onclick="switchMode('import')">Import Folder</button>
		</div>

		<div class="content">
			<div class="main-section">
				<div class="section">
					<div class="section-title">PROJECT DETAILS</div>

					<div class="field">
						<label for="projectName">Project Name</label>
						<input type="text" id="projectName" value="${this._escapeHtml(workspaceName)}" placeholder="my-awesome-project" autofocus oninput="onNameInput()" />
						<div class="error-message" id="nameError"></div>
					</div>

					<!-- Create mode: auto-generated path display -->
					<div class="field" id="autoPathField">
						<label>Project Location</label>
						<div class="auto-path" id="autoPathDisplay">~/TARX Projects/<span id="autoPathName">${this._escapeHtml(workspaceName || 'my-project')}</span>/</div>
						<div class="auto-path-hint">Folder will be created automatically</div>
					</div>

					<!-- Import mode: browse path -->
					<div class="field" id="browsePathField" style="display: none;">
						<label for="projectPath">Folder to Import</label>
						<div class="path-input">
							<input type="text" id="projectPath" value="${this._escapeHtml(workspacePath)}" placeholder="/path/to/existing/folder" readonly />
							<button onclick="browsePath()">Browse...</button>
						</div>
						<div class="error-message" id="pathError"></div>
					</div>

					<div class="field">
						<label for="projectInstructions">Instructions (optional)</label>
						<textarea id="projectInstructions" placeholder="Tell TARX about this project. What are you building? What coding style do you prefer?"></textarea>
					</div>
				</div>

				<div class="section">
					<div class="section-title"><i class="codicon codicon-cloud-upload"></i> Context Files (optional)</div>
					<div class="drop-zone" id="dropZone">
						<i class="codicon codicon-folder drop-zone-icon"></i>
						<div class="drop-zone-text">Drag files here or click to browse</div>
						<div class="drop-zone-hint">PDFs, docs, code files — TARX will index them</div>
					</div>
					<div id="fileList"></div>
				</div>
			</div>

			<div class="sidebar-section">
				<button class="btn btn-primary" id="createBtn" onclick="createProject()">
					Create Project
				</button>

				<button class="btn btn-secondary" onclick="cancelCreate()">
					Cancel
				</button>

				<div class="info-card">
					<h3><i class="codicon codicon-lightbulb"></i> What is a project?</h3>
					<p>A TARX project helps you organize your work:</p>
					<ul>
						<li>All chats linked to this folder</li>
						<li>Custom AI instructions</li>
						<li>Context files for better answers</li>
						<li>Memory across sessions</li>
					</ul>
				</div>
			</div>
		</div>
	</div>

	<script>
		const vscode = acquireVsCodeApi();
		let pendingFiles = [];
		let currentMode = 'create'; // 'create' or 'import'

		function switchMode(mode) {
			currentMode = mode;
			document.getElementById('modeCreate').classList.toggle('active', mode === 'create');
			document.getElementById('modeImport').classList.toggle('active', mode === 'import');
			document.getElementById('autoPathField').style.display = mode === 'create' ? '' : 'none';
			document.getElementById('browsePathField').style.display = mode === 'import' ? '' : 'none';

			// Clear name if switching modes
			if (mode === 'create') {
				document.getElementById('projectName').placeholder = 'my-awesome-project';
			} else {
				document.getElementById('projectName').placeholder = 'Auto-fills from folder name';
			}
		}

		function onNameInput() {
			const name = document.getElementById('projectName').value.trim();
			const slug = name ? name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-') : 'my-project';
			const autoSpan = document.getElementById('autoPathName');
			if (autoSpan) { autoSpan.textContent = slug; }
		}

		function browsePath() {
			vscode.postMessage({ type: 'browseFolderForCreate' });
		}

		function createProject() {
			const name = document.getElementById('projectName').value.trim();
			const instructions = document.getElementById('projectInstructions').value.trim();

			// Validation
			let valid = true;
			document.getElementById('nameError').textContent = '';
			const pathErr = document.getElementById('pathError');
			if (pathErr) pathErr.textContent = '';

			if (!name) {
				document.getElementById('nameError').textContent = 'Project name is required';
				valid = false;
			}

			let projectPath;
			if (currentMode === 'create') {
				// Auto-generate path
				const slug = name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
				projectPath = '~/TARX Projects/' + slug;
			} else {
				projectPath = document.getElementById('projectPath').value.trim();
				if (!projectPath) {
					if (pathErr) pathErr.textContent = 'Please select a folder to import';
					valid = false;
				}
			}

			if (!valid) return;

			// Disable button while creating
			const btn = document.getElementById('createBtn');
			btn.disabled = true;
			btn.textContent = 'Creating...';

			vscode.postMessage({
				type: 'createProject',
				data: { name, path: projectPath, instructions, files: pendingFiles, mode: currentMode }
			});
		}

		function cancelCreate() {
			vscode.postMessage({ type: 'cancelCreate' });
		}

		// Handle messages from extension
		window.addEventListener('message', event => {
			const message = event.data;
			switch (message.type) {
				case 'pathSelected':
					document.getElementById('projectPath').value = message.path;
					// Auto-fill name from folder name if empty
					const nameInput = document.getElementById('projectName');
					if (!nameInput.value) {
						nameInput.value = message.path.split('/').pop();
					}
					break;
				case 'createError':
					const btn = document.getElementById('createBtn');
					btn.disabled = false;
					btn.textContent = 'Create Project';
					alert(message.error);
					break;
			}
		});

		// Drag-drop for files
		const dropZone = document.getElementById('dropZone');
		dropZone.addEventListener('click', () => {
			vscode.postMessage({ type: 'browseFilesForCreate' });
		});

		dropZone.addEventListener('dragover', (e) => {
			e.preventDefault();
			dropZone.classList.add('drag-over');
		});

		dropZone.addEventListener('dragleave', (e) => {
			e.preventDefault();
			dropZone.classList.remove('drag-over');
		});

		dropZone.addEventListener('drop', (e) => {
			e.preventDefault();
			dropZone.classList.remove('drag-over');
			const files = e.dataTransfer?.files;
			if (files && files.length > 0) {
				const paths = Array.from(files).map(f => f.path).filter(p => p);
				if (paths.length > 0) {
					pendingFiles.push(...paths);
					updateFileList();
				}
			}
		});

		function updateFileList() {
			const list = document.getElementById('fileList');
			if (pendingFiles.length === 0) {
				list.innerHTML = '';
				return;
			}
			list.innerHTML = pendingFiles.map((f, i) => \`
				<div style="display: flex; align-items: center; padding: 8px; background: var(--vscode-input-background); border-radius: 4px; margin-top: 8px;">
					<span style="flex: 1; font-size: 12px; opacity: 0.8;">\${f.split('/').pop()}</span>
					<button onclick="removePendingFile(\${i})" style="background: none; border: none; color: var(--vscode-errorForeground); cursor: pointer;">x</button>
				</div>
			\`).join('');
		}

		function removePendingFile(index) {
			pendingFiles.splice(index, 1);
			updateFileList();
		}
	</script>
</body>
</html>`;
	}

	/**
	 * Get file icon based on mime type (returns codicon class name)
	 */
	private _getFileIcon(mimeType: string): string {
		if (mimeType.startsWith('image/')) return 'file-media';
		if (mimeType.includes('pdf')) return 'file-pdf';
		if (mimeType.includes('javascript') || mimeType.includes('typescript')) return 'file-code';
		if (mimeType.includes('python')) return 'file-code';
		if (mimeType.includes('json')) return 'json';
		if (mimeType.includes('markdown') || mimeType.includes('text')) return 'markdown';
		return 'file';
	}

	/**
	 * Escape HTML to prevent XSS
	 */
	private _escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	/**
	 * Dispose the panel
	 */
	public dispose(): void {
		this._disposed = true;
		ProjectContextPanel.currentPanel = undefined;

		this._panel.dispose();

		while (this._disposables.length) {
			const disposable = this._disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}
	}
}

/**
 * Register project context panel commands
 */
export function registerProjectContextCommands(context: vscode.ExtensionContext): void {
	// Safe command registration helper
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

	// Open project context panel
	safeRegister('tarx.openProjectContext', async (projectId?: string) => {
		console.log('[TARX] tarx.openProjectContext called with:', projectId);
		try {
			// If no project ID provided, try to get active project
			if (!projectId) {
				console.log('[TARX] No project ID, getting active project');
				projectId = await getActiveProjectId();
				console.log('[TARX] Got active project ID:', projectId);
			}

			console.log('[TARX] Creating/showing project context panel');
			ProjectContextPanel.createOrShow(context.extensionUri, projectId);
			console.log('[TARX] Project context panel created/shown');
		} catch (error) {
			console.error('[TARX] openProjectContext error:', error);
			vscode.window.showErrorMessage(`Failed to open project context: ${error instanceof Error ? error.message : String(error)}`);
		}
	});

	// Quick access from sidebar
	safeRegister('tarx.showProjectContext', () => {
		console.log('[TARX] tarx.showProjectContext called');
		vscode.commands.executeCommand('tarx.openProjectContext');
	});

	// Open create project panel (Welcome-style tab)
	safeRegister('tarx.openCreateProject', () => {
		console.log('[TARX DEBUG] ===== tarx.openCreateProject COMMAND FIRED =====');
		try {
			const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			console.log('[TARX DEBUG] workspacePath:', workspacePath);
			console.log('[TARX DEBUG] About to call ProjectContextPanel.createOrShow');
			ProjectContextPanel.createOrShow(context.extensionUri, undefined, {
				createMode: true,
				workspacePath
			});
			console.log('[TARX DEBUG] ProjectContextPanel.createOrShow completed');
		} catch (error) {
			console.error('[TARX DEBUG] ERROR in tarx.openCreateProject:', error);
			vscode.window.showErrorMessage(`Failed to open create project: ${error}`);
		}
	});

	console.log('[TARX DEBUG] All project context commands registered');
}

/**
 * Get active project ID from database
 */
async function getActiveProjectId(): Promise<string | undefined> {
	try {
		const mcpDbPath = path.join(os.homedir(), 'Library', 'Application Support', 'tarx', 'memory.db');

		if (!fs.existsSync(mcpDbPath)) {
			return undefined;
		}

		// Use sqlite3 CLI to avoid better-sqlite3 version mismatch
		const query = 'SELECT id FROM projects WHERE is_active = 1 LIMIT 1;';
		const result = execSync(`sqlite3 "${mcpDbPath}" -json`, {
			encoding: 'utf8',
			input: query
		});
		const projects = JSON.parse(result || '[]') as any[];

		return projects[0]?.id;
	} catch (error) {
		console.error('[TARX] Error getting active project:', error);
		return undefined;
	}
}
