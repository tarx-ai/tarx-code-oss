/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP Bridge Service
 * Translates MCP tool calls into sidebar commands and state updates.
 * This service provides a clean API for MCP tools to control the sidebar UI.
 */

import * as vscode from 'vscode';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MCPBridgeEvent {
	type: 'projects' | 'history' | 'files' | 'status' | 'error';
	action: 'created' | 'updated' | 'deleted' | 'refreshed';
	data: unknown;
}

export interface CreateProjectParams {
	name: string;
	description?: string;
	path?: string;
	color?: string;
}

export interface CreateSessionParams {
	title?: string;
	spaceId?: string;
}

export interface CreateChatParams {
	projectId?: string;
	title?: string;
}

export interface UploadFileParams {
	path?: string;
	filename?: string;
	content?: string;
	size?: number;
	mimeType?: string;
}

export type SidebarSection = 'projects' | 'history' | 'files' | 'all';
export type SidebarView = 'chat' | 'projects' | 'history' | 'files';
export type ConnectionStatus = 'online' | 'offline' | 'connecting' | 'reconnecting';

export interface SidebarStateUpdate {
	selectedProjectId?: string | null;
	selectedChatId?: string | null;
	activeSection?: SidebarView;
}

// ═══════════════════════════════════════════════════════════════════════════
// MCP BRIDGE SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export class MCPBridgeService {
	private static instance: MCPBridgeService;
	private eventEmitter = new vscode.EventEmitter<MCPBridgeEvent>();

	public readonly onEvent = this.eventEmitter.event;

	private constructor() {
		console.log('[MCP Bridge] Service initialized');
	}

	public static getInstance(): MCPBridgeService {
		if (!MCPBridgeService.instance) {
			MCPBridgeService.instance = new MCPBridgeService();
		}
		return MCPBridgeService.instance;
	}

	// ═══════════════════════════════════════════════════════════════════════
	// PROJECT OPERATIONS
	// ═══════════════════════════════════════════════════════════════════════

	async createProject(params: CreateProjectParams): Promise<{ success: boolean; project?: unknown; error?: string }> {
		try {
			console.log('[MCP Bridge] Creating project:', params.name);

			// Execute the actual project creation
			const project = await vscode.commands.executeCommand(
				'tarx.projects.create',
				params.name,
				params.description
			);

			// Notify sidebar to refresh
			await this.refreshSidebar('projects');

			// Emit event for any listeners
			this.eventEmitter.fire({
				type: 'projects',
				action: 'created',
				data: project
			});

			return { success: true, project };
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			console.error('[MCP Bridge] Failed to create project:', message);
			return { success: false, error: message };
		}
	}

	async listProjects(): Promise<unknown[]> {
		try {
			const projects = await vscode.commands.executeCommand('tarx.projects.list');
			return (projects as unknown[]) || [];
		} catch (error) {
			console.error('[MCP Bridge] Failed to list projects:', error);
			return [];
		}
	}

	async openProject(projectIdOrPath: string): Promise<void> {
		console.log('[MCP Bridge] Opening project:', projectIdOrPath);
		await vscode.commands.executeCommand('tarx.projects.open', projectIdOrPath);
		await this.updateSidebarState({ selectedProjectId: projectIdOrPath });
	}

	async selectProject(projectId: string): Promise<void> {
		console.log('[MCP Bridge] Selecting project:', projectId);
		await vscode.commands.executeCommand('tarx.sidebar.projects.select', projectId);
	}

	async deleteProject(projectId: string): Promise<{ success: boolean; error?: string }> {
		try {
			console.log('[MCP Bridge] Deleting project:', projectId);
			await vscode.commands.executeCommand('tarx.projects.delete', projectId);
			await this.refreshSidebar('projects');
			this.eventEmitter.fire({ type: 'projects', action: 'deleted', data: { projectId } });
			return { success: true };
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return { success: false, error: message };
		}
	}

	// ═══════════════════════════════════════════════════════════════════════
	// CHAT/SESSION OPERATIONS
	// ═══════════════════════════════════════════════════════════════════════

	async createChat(params?: CreateChatParams): Promise<unknown> {
		console.log('[MCP Bridge] Creating new chat');
		const chat = await vscode.commands.executeCommand('tarx.chat.new', params);
		await this.refreshSidebar('history');
		this.eventEmitter.fire({ type: 'history', action: 'created', data: chat });
		return chat;
	}

	async openChat(chatId: string): Promise<void> {
		console.log('[MCP Bridge] Opening chat:', chatId);
		await vscode.commands.executeCommand('tarx.openConversation', chatId);
		await this.updateSidebarState({ selectedChatId: chatId });
	}

	async createSession(params: CreateSessionParams): Promise<unknown> {
		console.log('[MCP Bridge] Creating session:', params.title);
		const session = await vscode.commands.executeCommand('tarx.createSession', params);
		await this.refreshSidebar('history');
		this.eventEmitter.fire({ type: 'history', action: 'created', data: session });
		return session;
	}

	async openSession(sessionId: string, spaceId?: string): Promise<void> {
		console.log('[MCP Bridge] Opening session:', sessionId);
		await vscode.commands.executeCommand('tarx.openSession', sessionId, spaceId);
	}

	async getHistory(limit?: number): Promise<unknown[]> {
		try {
			const conversations = await vscode.commands.executeCommand('tarx.getConversationHistory', limit || 50) || [];
			const sessions = await vscode.commands.executeCommand('tarx.getSessionHistory', limit || 50) || [];
			const combined = [...(conversations as unknown[]), ...(sessions as unknown[])];
			return combined.slice(0, limit || 50);
		} catch (error) {
			console.error('[MCP Bridge] Failed to get history:', error);
			return [];
		}
	}

	// ═══════════════════════════════════════════════════════════════════════
	// FILE OPERATIONS
	// ═══════════════════════════════════════════════════════════════════════

	async listFiles(): Promise<unknown[]> {
		try {
			const files = await vscode.commands.executeCommand('tarx.getUploadedFiles');
			return (files as unknown[]) || [];
		} catch (error) {
			console.error('[MCP Bridge] Failed to list files:', error);
			return [];
		}
	}

	async uploadFile(params: UploadFileParams): Promise<unknown> {
		console.log('[MCP Bridge] Uploading file:', params.filename || params.path);
		const result = await vscode.commands.executeCommand('tarx.uploadFile', params);
		await this.refreshSidebar('files');
		this.eventEmitter.fire({ type: 'files', action: 'created', data: result });
		return result;
	}

	async deleteFile(fileId: string): Promise<void> {
		console.log('[MCP Bridge] Deleting file:', fileId);
		await vscode.commands.executeCommand('tarx.deleteUploadedFile', fileId);
		await this.refreshSidebar('files');
		this.eventEmitter.fire({ type: 'files', action: 'deleted', data: { fileId } });
	}

	// ═══════════════════════════════════════════════════════════════════════
	// UI CONTROL
	// ═══════════════════════════════════════════════════════════════════════

	async refreshSidebar(section?: SidebarSection): Promise<void> {
		console.log('[MCP Bridge] Refreshing sidebar:', section || 'all');
		try {
			await vscode.commands.executeCommand('tarx.sidebar.ui.refresh', section || 'all');
		} catch {
			// Fall back to individual refresh commands if unified command not registered
			if (!section || section === 'all' || section === 'projects') {
				try {
					await vscode.commands.executeCommand('tarx.projects.refresh');
				} catch { /* ignore */ }
			}
			if (!section || section === 'all' || section === 'history') {
				try {
					await vscode.commands.executeCommand('tarx.history.refresh');
				} catch { /* ignore */ }
			}
		}
	}

	async navigateSidebar(view: SidebarView): Promise<void> {
		console.log('[MCP Bridge] Navigating to:', view);
		await vscode.commands.executeCommand('tarx.sidebar.ui.navigate', view);
	}

	async updateSidebarState(state: SidebarStateUpdate): Promise<void> {
		console.log('[MCP Bridge] Updating state:', state);
		await vscode.commands.executeCommand('tarx.sidebar.internal.updateState', state);
	}

	async getSidebarState(): Promise<unknown> {
		try {
			return await vscode.commands.executeCommand('tarx.sidebar.ui.getState');
		} catch {
			return null;
		}
	}

	async setLoading(section: SidebarSection, isLoading: boolean): Promise<void> {
		console.log('[MCP Bridge] Set loading:', section, isLoading);
		await vscode.commands.executeCommand('tarx.sidebar.ui.setLoading', section, isLoading);
	}

	async showError(section: SidebarSection, message: string): Promise<void> {
		console.log('[MCP Bridge] Show error:', section, message);
		await vscode.commands.executeCommand('tarx.sidebar.ui.showError', section, message);
	}

	async clearError(section: SidebarSection): Promise<void> {
		console.log('[MCP Bridge] Clear error:', section);
		await vscode.commands.executeCommand('tarx.sidebar.ui.clearError', section);
	}

	async setConnectionStatus(status: ConnectionStatus): Promise<void> {
		console.log('[MCP Bridge] Set connection status:', status);
		await vscode.commands.executeCommand('tarx.sidebar.ui.setConnectionStatus', status);
		this.eventEmitter.fire({ type: 'status', action: 'updated', data: { status } });
	}

	// ═══════════════════════════════════════════════════════════════════════
	// DISPOSAL
	// ═══════════════════════════════════════════════════════════════════════

	dispose(): void {
		this.eventEmitter.dispose();
	}
}

// Export singleton instance
export const mcpBridge = MCPBridgeService.getInstance();
