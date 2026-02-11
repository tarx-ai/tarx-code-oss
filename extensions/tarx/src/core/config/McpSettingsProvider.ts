/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP Settings Provider
 *
 * Provides a tree view for configuring MCP (Model Context Protocol) servers.
 * Shows server status, allows enable/disable, and displays available tools.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface McpServerConfig {
	command?: string;
	args?: string[];
	url?: string;
	env?: Record<string, string>;
	enabled?: boolean;
}

export interface McpServerStatus {
	name: string;
	config: McpServerConfig;
	status: 'connected' | 'disconnected' | 'error' | 'unknown';
	tools?: string[];
	lastChecked?: number;
	error?: string;
}

type McpTreeItem = McpServerItem | McpToolItem | McpHeaderItem;

export class McpSettingsProvider implements vscode.TreeDataProvider<McpTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<McpTreeItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private servers: Map<string, McpServerStatus> = new Map();
	private claudeConfigPath: string;

	constructor() {
		// Claude Desktop config path
		this.claudeConfigPath = path.join(
			os.homedir(),
			'Library/Application Support/Claude/claude_desktop_config.json'
		);

		// Load initial servers
		this.loadServers();
	}

	refresh(): void {
		this.loadServers();
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: McpTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: McpTreeItem): Promise<McpTreeItem[]> {
		if (!element) {
			// Root level - return headers
			return [
				new McpHeaderItem('configured', 'CONFIGURED SERVERS'),
				new McpHeaderItem('available', 'AVAILABLE TOOLS')
			];
		}

		if (element instanceof McpHeaderItem) {
			if (element.headerId === 'configured') {
				return this.getServerItems();
			} else if (element.headerId === 'available') {
				return this.getToolsSummary();
			}
		}

		if (element instanceof McpServerItem && element.tools && element.tools.length > 0) {
			return element.tools.map(tool => new McpToolItem(tool, element.serverName));
		}

		return [];
	}

	private loadServers(): void {
		this.servers.clear();

		// Load from Claude Desktop config
		try {
			if (fs.existsSync(this.claudeConfigPath)) {
				const configContent = fs.readFileSync(this.claudeConfigPath, 'utf-8');
				const config = JSON.parse(configContent);

				if (config.mcpServers) {
					for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
						const status = this.checkServerStatus(name, serverConfig as McpServerConfig);
						this.servers.set(name, status);
					}
				}
			}
		} catch (error) {
			console.error('[TARX] Failed to load MCP servers from Claude config:', error);
		}

		// Also load from VS Code settings
		const vsCodeConfig = vscode.workspace.getConfiguration('tarx');
		const vsCodeServers = vsCodeConfig.get<Record<string, McpServerConfig>>('mcpServers', {});

		for (const [name, serverConfig] of Object.entries(vsCodeServers)) {
			if (!this.servers.has(name)) {
				const status = this.checkServerStatus(name, serverConfig);
				this.servers.set(name, status);
			}
		}
	}

	private checkServerStatus(name: string, config: McpServerConfig): McpServerStatus {
		// Check if the server executable exists
		let status: 'connected' | 'disconnected' | 'error' | 'unknown' = 'unknown';
		let error: string | undefined;

		if (config.command && config.args && config.args.length > 0) {
			const serverPath = config.args[0];
			const expandedPath = serverPath.replace(/^~/, os.homedir());

			if (fs.existsSync(expandedPath)) {
				status = config.enabled === false ? 'disconnected' : 'connected';
			} else {
				status = 'error';
				error = `Server file not found: ${expandedPath}`;
			}
		} else if (config.url) {
			status = config.enabled === false ? 'disconnected' : 'connected';
		}

		// Get known tools for this server
		const tools = this.getKnownTools(name);

		return {
			name,
			config,
			status,
			tools,
			lastChecked: Date.now(),
			error
		};
	}

	private getKnownTools(serverName: string): string[] {
		// Return known tools for each server
		const toolsByServer: Record<string, string[]> = {
			'tarx-core': [
				// System & Health
				'tarx_health', 'tarx_system_brief', 'tarx_project_context',
				// Chat & LLM
				'tarx_chat', 'tarx_reason_stream', 'tarx_prewarm', 'tarx_cancel', 'tarx_list_active',
				'tarx_stress_test',
				// Memory
				'memory_store', 'memory_search', 'memory_recall', 'memory_forget',
				'memory_list', 'memory_stats',
				// Session Threading
				'memory_create_session', 'memory_thread_to_session', 'memory_get_session',
				'memory_list_sessions', 'thread_message',
				// Spaces & Sessions
				'tarx_list_spaces', 'tarx_create_space', 'tarx_get_space',
				'tarx_list_sessions', 'tarx_create_session', 'tarx_send_message',
				'tarx_get_chat_history',
				// Files & Knowledge (RAG)
				'tarx_list_files', 'tarx_upload_file', 'tarx_get_file',
				'tarx_search_knowledge', 'tarx_knowledge_stats',
				// Sidebar
				'tarx_sidebar_refresh', 'tarx_sidebar_navigate', 'tarx_sidebar_get_state'
			],
			'tarx-ops': [
				// Sentry Integration
				'tarx_admin_sentry_projects', 'tarx_admin_sentry_events', 'tarx_admin_sentry_issues',
				'tarx_admin_sentry_search', 'tarx_admin_sentry_event_details', 'tarx_admin_sentry_issue_events',
				'tarx_admin_sentry_trace',
				// Admin & Monitoring
				'tarx_admin_status', 'tarx_admin_performance_metrics',
				// File Locking (Multi-session)
				'tarx_admin_file_lock', 'tarx_admin_file_unlock', 'tarx_admin_file_conflicts',
				// Claude Code Sessions
				'tarx_admin_start_code_session', 'tarx_admin_list_code_sessions',
				'tarx_admin_get_session_output', 'tarx_admin_send_to_session',
				'tarx_admin_stop_code_session', 'tarx_admin_clear_code_sessions',
				// Console Logs
				'tarx_admin_read_console', 'tarx_admin_tail_console',
				// Orchestration
				'tarx_orchestrate_register_session', 'tarx_orchestrate_session_state',
				'tarx_orchestrate_report_activity', 'tarx_orchestrate_session_activity',
				'tarx_orchestrate_list_sessions', 'tarx_orchestrate_session_pause',
				'tarx_orchestrate_read_file', 'tarx_orchestrate_update_file',
				'tarx_orchestrate_create_doc', 'tarx_orchestrate_list_docs', 'tarx_orchestrate_doc_history',
				'tarx_orchestrate_assign_task', 'tarx_orchestrate_task_update', 'tarx_orchestrate_task_list',
				'tarx_orchestrate_milestone_create', 'tarx_orchestrate_milestone_update', 'tarx_orchestrate_milestone_list',
				'tarx_orchestrate_push_context', 'tarx_orchestrate_broadcast',
				'tarx_orchestrate_get_updates', 'tarx_orchestrate_mark_delivered',
				'tarx_orchestrate_request_feedback', 'tarx_orchestrate_list_feedback_requests',
				'tarx_orchestrate_status_report',
				// Autonomous Daemon
				'tarx_daemon_start', 'tarx_daemon_stop', 'tarx_daemon_status'
			]
		};

		return toolsByServer[serverName] || [];
	}

	private getServerItems(): McpServerItem[] {
		const items: McpServerItem[] = [];

		for (const [name, status] of this.servers) {
			items.push(new McpServerItem(name, status));
		}

		// Sort: connected first, then by name
		items.sort((a, b) => {
			if (a.serverStatus === 'connected' && b.serverStatus !== 'connected') return -1;
			if (a.serverStatus !== 'connected' && b.serverStatus === 'connected') return 1;
			return a.serverName.localeCompare(b.serverName);
		});

		return items;
	}

	private getToolsSummary(): McpTreeItem[] {
		// Count total tools across all connected servers
		let totalTools = 0;
		const toolCategories = new Map<string, number>();

		for (const [, status] of this.servers) {
			if (status.status === 'connected' && status.tools) {
				totalTools += status.tools.length;

				// Categorize tools
				for (const tool of status.tools) {
					const category = tool.split('_')[0] || 'other';
					toolCategories.set(category, (toolCategories.get(category) || 0) + 1);
				}
			}
		}

		const items: McpTreeItem[] = [];

		// Add summary item
		items.push(new McpToolItem(`${totalTools} tools available`, 'summary', true));

		// Add category breakdown
		for (const [category, count] of toolCategories) {
			items.push(new McpToolItem(`${category}: ${count} tools`, category, true));
		}

		return items;
	}

	/**
	 * Toggle server enabled/disabled in Claude Desktop config
	 */
	async toggleServer(serverName: string): Promise<void> {
		try {
			if (!fs.existsSync(this.claudeConfigPath)) {
				vscode.window.showErrorMessage('Claude Desktop config not found');
				return;
			}

			const configContent = fs.readFileSync(this.claudeConfigPath, 'utf-8');
			const config = JSON.parse(configContent);

			if (config.mcpServers && config.mcpServers[serverName]) {
				// Toggle enabled state (we'll use a comment or removal approach)
				// Since Claude config doesn't have enabled field, we'll show a message
				vscode.window.showInformationMessage(
					`To enable/disable "${serverName}", edit: ${this.claudeConfigPath}`
				);

				// Open the config file for editing
				const doc = await vscode.workspace.openTextDocument(this.claudeConfigPath);
				await vscode.window.showTextDocument(doc);
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to toggle server: ${error}`);
		}
	}

	/**
	 * Open Claude Desktop config for editing
	 */
	async openConfig(): Promise<void> {
		try {
			if (fs.existsSync(this.claudeConfigPath)) {
				const doc = await vscode.workspace.openTextDocument(this.claudeConfigPath);
				await vscode.window.showTextDocument(doc);
			} else {
				vscode.window.showWarningMessage('Claude Desktop config not found. Creating default...');

				// Create default config
				const defaultConfig = {
					mcpServers: {
						'tarx-core': {
							command: 'node',
							args: [path.join(os.homedir(), 'Desktop/tarx-code-oss/extensions/tarx-core/dist/server.js')],
							env: {
								TARX_INFERENCE_URL: 'http://localhost:11435',
								TARX_EMBEDDING_URL: 'http://localhost:11437',
								TARX_MESH_URL: 'http://localhost:11436'
							}
						},
						'tarx-ops': {
							command: 'node',
							args: [path.join(os.homedir(), 'Desktop/tarx-code-oss/extensions/tarx-ops/dist/server.js')],
							env: {
								SENTRY_AUTH_TOKEN: '${SENTRY_AUTH_TOKEN}',
								SENTRY_ORG: 'tarx',
								SENTRY_PROJECT: 'tarx-code-oss'
							}
						}
					}
				};

				const configDir = path.dirname(this.claudeConfigPath);
				if (!fs.existsSync(configDir)) {
					fs.mkdirSync(configDir, { recursive: true });
				}

				fs.writeFileSync(this.claudeConfigPath, JSON.stringify(defaultConfig, null, 2));

				const doc = await vscode.workspace.openTextDocument(this.claudeConfigPath);
				await vscode.window.showTextDocument(doc);
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to open config: ${error}`);
		}
	}

	/**
	 * Get server status for display
	 */
	getServerStatus(serverName: string): McpServerStatus | undefined {
		return this.servers.get(serverName);
	}
}

/**
 * Header item for tree sections
 */
class McpHeaderItem extends vscode.TreeItem {
	constructor(
		public readonly headerId: string,
		label: string
	) {
		super(label, vscode.TreeItemCollapsibleState.Expanded);
		this.contextValue = 'mcpHeader';
	}
}

/**
 * Server item in the tree
 */
class McpServerItem extends vscode.TreeItem {
	public readonly serverName: string;
	public readonly serverStatus: string;
	public readonly tools: string[];

	constructor(
		name: string,
		status: McpServerStatus
	) {
		const hasTools = status.tools && status.tools.length > 0;
		super(
			name,
			hasTools ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
		);

		this.serverName = name;
		this.serverStatus = status.status;
		this.tools = status.tools || [];

		this.description = this.getDescription(status);
		this.tooltip = this.getTooltip(status);
		this.contextValue = 'mcpServer';
		this.iconPath = this.getIcon(status);
	}

	private getDescription(status: McpServerStatus): string {
		const type = status.config.url ? 'HTTP' : 'stdio';
		const toolCount = status.tools?.length || 0;
		return `${type} | ${toolCount} tools | ${status.status}`;
	}

	private getTooltip(status: McpServerStatus): string {
		const lines = [
			`Server: ${status.name}`,
			`Status: ${status.status}`,
			`Type: ${status.config.url ? 'HTTP' : 'stdio'}`,
			`Tools: ${status.tools?.length || 0}`
		];

		if (status.config.command) {
			lines.push(`Command: ${status.config.command}`);
		}
		if (status.config.args) {
			lines.push(`Args: ${status.config.args.join(' ')}`);
		}
		if (status.config.url) {
			lines.push(`URL: ${status.config.url}`);
		}
		if (status.error) {
			lines.push(`Error: ${status.error}`);
		}

		return lines.join('\n');
	}

	private getIcon(status: McpServerStatus): vscode.ThemeIcon {
		switch (status.status) {
			case 'connected':
				return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('testing.iconPassed'));
			case 'disconnected':
				return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('testing.iconSkipped'));
			case 'error':
				return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('testing.iconFailed'));
			default:
				return new vscode.ThemeIcon('question', new vscode.ThemeColor('testing.iconQueued'));
		}
	}
}

/**
 * Tool item in the tree
 */
class McpToolItem extends vscode.TreeItem {
	constructor(
		toolName: string,
		public readonly serverName: string,
		isSummary: boolean = false
	) {
		super(toolName, vscode.TreeItemCollapsibleState.None);

		this.contextValue = isSummary ? 'mcpToolSummary' : 'mcpTool';
		this.iconPath = isSummary
			? new vscode.ThemeIcon('list-flat')
			: new vscode.ThemeIcon('symbol-method');

		if (!isSummary) {
			this.tooltip = `Tool: ${toolName}\nServer: ${serverName}`;
		}
	}
}

/**
 * Register the MCP Settings provider
 */
export function registerMcpSettingsProvider(context: vscode.ExtensionContext): McpSettingsProvider {
	const provider = new McpSettingsProvider();

	// Register tree view
	const treeView = vscode.window.createTreeView('tarx.mcpSettings', {
		treeDataProvider: provider,
		showCollapseAll: true
	});

	context.subscriptions.push(treeView);

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

	// Register commands
	safeRegister('tarx.refreshMcpSettings', () => {
		provider.refresh();
		vscode.window.showInformationMessage('MCP servers refreshed');
	});

	safeRegister('tarx.toggleMcpServer', async (item: McpServerItem) => {
		if (item && item.serverName) {
			await provider.toggleServer(item.serverName);
			provider.refresh();
		}
	});

	safeRegister('tarx.openMcpConfig', async () => {
		await provider.openConfig();
	});

	safeRegister('tarx.viewMcpServerTools', (item: McpServerItem) => {
		if (item && item.tools && item.tools.length > 0) {
			const toolsList = item.tools.join('\n  - ');
			vscode.window.showInformationMessage(
				`Tools for ${item.serverName}:\n  - ${toolsList}`,
				{ modal: true }
			);
		} else {
			vscode.window.showInformationMessage(`No tools found for ${item.serverName}`);
		}
	});

	return provider;
}
