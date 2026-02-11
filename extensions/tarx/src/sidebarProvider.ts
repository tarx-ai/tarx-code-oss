/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TARX Sidebar Provider
 *
 * Provides a tree view for the native VS Code sidebar showing:
 * - Recent conversations
 * - Quick actions (start new conversation)
 *
 * Uses native VS Code TreeDataProvider for clean integration.
 */

import * as vscode from 'vscode';
import * as path from 'path';

interface TarxTreeItem {
	type: 'conversation' | 'action' | 'header' | 'project';
	id: string;
	label: string;
	description?: string;
	timestamp?: number;
	source?: 'claude' | 'tarx' | 'mcp' | 'test';
	spaceId?: string;  // For MCP sessions
	spaceName?: string;  // Display name for project/space
	conversationCount?: number;  // Number of child conversations
}

// Extension path for icons (set during registration)
let extensionPath: string = '';

export class TarxSidebarProvider implements vscode.TreeDataProvider<TarxTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<TarxTreeItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private conversations: Array<{
		id: string;
		title: string;
		timestamp: number;
		source?: 'claude' | 'tarx' | 'mcp' | 'test';
		spaceId?: string;
		spaceName?: string;
	}> = [];

	private connectionStatus: 'online' | 'offline' | 'connecting' | 'reconnecting' = 'connecting';

	private isLocked: boolean = true; // Start locked until auth completes

	private proactiveAction: {
		id: string;
		title: string;
		voiceProposal: string;
		confidence: number;
		options: Array<{ id: string; label: string }>;
	} | null = null;

	constructor() {}

	/**
	 * Set locked state (called when auth state changes)
	 */
	setLocked(locked: boolean) {
		this.isLocked = locked;
		this._onDidChangeTreeData.fire(undefined);
	}

	/**
	 * Check if locked
	 */
	getLocked(): boolean {
		return this.isLocked;
	}

	/**
	 * Update connection status (called by extension when health status changes)
	 */
	setConnectionStatus(status: 'online' | 'offline' | 'connecting' | 'reconnecting') {
		this.connectionStatus = status;
		this._onDidChangeTreeData.fire(undefined);
	}

	/**
	 * Get current connection status
	 */
	getConnectionStatus(): string {
		return this.connectionStatus;
	}

	/**
	 * Update conversations list (called by extension when data changes)
	 */
	setConversations(conversations: Array<{ id: string; title: string; timestamp: number; source?: 'claude' | 'tarx' | 'mcp' | 'test'; spaceId?: string; spaceName?: string }>) {
		this.conversations = conversations;
		this._onDidChangeTreeData.fire(undefined);
	}

	/**
	 * Refresh the tree view
	 */
	refresh() {
		this._onDidChangeTreeData.fire(undefined);
	}

	/**
	 * Set proactive action (called when proactive system proposes an action)
	 */
	setProactiveAction(action: {
		id: string;
		title: string;
		voiceProposal: string;
		confidence: number;
		options: Array<{ id: string; label: string }>;
	} | null) {
		this.proactiveAction = action;
		this._onDidChangeTreeData.fire(undefined);
	}

	/**
	 * Get current proactive action
	 */
	getProactiveAction() {
		return this.proactiveAction;
	}

	/**
	 * Clear proactive action
	 */
	clearProactiveAction() {
		this.proactiveAction = null;
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: TarxTreeItem): vscode.TreeItem {
		const treeItem = new vscode.TreeItem(element.label);

		if (element.type === 'header') {
			treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
			treeItem.contextValue = 'header';
			// Icons for all headers
			switch (element.id) {
				case 'locked':
					treeItem.iconPath = new vscode.ThemeIcon('lock');
					break;
				case 'proactive':
					treeItem.iconPath = new vscode.ThemeIcon('lightbulb', new vscode.ThemeColor('charts.yellow'));
					break;
				case 'recent':
					treeItem.iconPath = new vscode.ThemeIcon('history', new vscode.ThemeColor('charts.purple'));
					break;
				case 'actions':
					treeItem.iconPath = new vscode.ThemeIcon('rocket', new vscode.ThemeColor('charts.green'));
					break;
			}
		} else if (element.type === 'project') {
			// Expandable project/space node
			treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
			treeItem.contextValue = 'project';
			treeItem.iconPath = new vscode.ThemeIcon('folder', new vscode.ThemeColor('charts.blue'));
			treeItem.description = element.conversationCount ? `${element.conversationCount} sessions` : '';
		} else if (element.type === 'conversation') {
			treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;
			treeItem.contextValue = 'conversation';

			// Use proper icon based on source (no emojis)
			treeItem.iconPath = this.getIconForSource(element.source, element.label);

			// Route to appropriate handler based on source
			// MCP sessions use tarx.openSession, others use tarx.openConversation
			if (element.spaceId) {
				treeItem.command = {
					command: 'tarx.openSession',
					title: 'Open Session',
					arguments: [element.id, element.spaceId]
				};
			} else {
				treeItem.command = {
					command: 'tarx.openConversation',
					title: 'Open Conversation',
					arguments: [element.id]
				};
			}
		} else if (element.type === 'action') {
			treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;
			treeItem.contextValue = 'action';
			treeItem.command = {
				command: element.id,
				title: element.label
			};

			// Set icon based on action
			if (element.id === 'tarx.startNewConversation') {
				treeItem.iconPath = new vscode.ThemeIcon('add', new vscode.ThemeColor('charts.green'));
			} else if (element.id === 'workbench.action.chat.open') {
				treeItem.iconPath = new vscode.ThemeIcon('comment-discussion', new vscode.ThemeColor('charts.blue'));
			} else if (element.id === 'tarx.auth.unlock') {
				treeItem.iconPath = new vscode.ThemeIcon('unlock', new vscode.ThemeColor('charts.green'));
			} else if (element.id === 'tarx.indexProject') {
				treeItem.iconPath = new vscode.ThemeIcon('search', new vscode.ThemeColor('charts.orange'));
			} else if (element.id === 'tarx.proactive.info') {
				treeItem.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('charts.blue'));
			} else if (element.id.startsWith('tarx.proactive.approve')) {
				treeItem.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
			} else if (element.id === 'tarx.proactive.reject') {
				treeItem.iconPath = new vscode.ThemeIcon('close', new vscode.ThemeColor('charts.red'));
			}
		}

		return treeItem;
	}

	getChildren(element?: TarxTreeItem): TarxTreeItem[] {
		// If locked, only show unlock action
		if (this.isLocked) {
			if (!element) {
				return [
					{ type: 'header', id: 'locked', label: 'TARX LOCKED' }
				];
			}
			if (element.id === 'locked') {
				return [
					{ type: 'action', id: 'tarx.auth.unlock', label: 'Unlock TARX' }
				];
			}
			return [];
		}

		if (!element) {
			// Root level - return headers
			const items: TarxTreeItem[] = [];

			// Add proactive suggestion header if there's an active proposal
			if (this.proactiveAction) {
				items.push({ type: 'header', id: 'proactive', label: 'TARX SUGGESTION' });
			}

			items.push(
				{ type: 'header', id: 'recent', label: 'RECENT CONVERSATIONS' },
				{ type: 'header', id: 'actions', label: "WHAT'S NEXT?" }
			);
			return items;
		}

		if (element.id === 'proactive' && this.proactiveAction) {
			// Show proactive action options
			return [
				{
					type: 'action' as const,
					id: 'tarx.proactive.info',
					label: this.proactiveAction.title,
					description: `${Math.round(this.proactiveAction.confidence * 100)}% confidence`
				},
				...this.proactiveAction.options.slice(0, 3).map(opt => ({
					type: 'action' as const,
					id: `tarx.proactive.approve:${opt.id}`,
					label: opt.label
				})),
				{
					type: 'action' as const,
					id: 'tarx.proactive.reject',
					label: 'Dismiss'
				}
			];
		}

		if (element.id === 'recent') {
			// Recent conversations - group by project/space
			if (this.conversations.length === 0) {
				return [{
					type: 'action',
					id: 'tarx.startNewConversation',
					label: 'No conversations yet'
				}];
			}

			// Group conversations by spaceId/spaceName
			type ConvType = typeof this.conversations[number];
			const groups = new Map<string, { spaceName: string; spaceId?: string; conversations: ConvType[] }>();

			for (const conv of this.conversations) {
				const groupKey = conv.spaceId || 'tarx-native';
				const groupName = conv.spaceName || (conv.spaceId ? 'Unnamed Space' : 'TARX Chats');

				if (!groups.has(groupKey)) {
					groups.set(groupKey, { spaceName: groupName, spaceId: conv.spaceId, conversations: [] });
				}
				groups.get(groupKey)!.conversations.push(conv);
			}

			// Convert to project items, sorted by most recent activity
			const projects = Array.from(groups.entries())
				.map(([key, group]) => ({
					type: 'project' as const,
					id: `project:${key}`,
					label: group.spaceName,
					spaceId: group.spaceId,
					timestamp: Math.max(...group.conversations.map((c: ConvType) => c.timestamp)),
					conversationCount: group.conversations.length
				}))
				.sort((a, b) => b.timestamp - a.timestamp);

			return projects;
		}

		// Handle project expansion - show child conversations
		if (element.type === 'project') {
			const spaceId = element.spaceId;
			const projectConversations = this.conversations
				.filter(c => (spaceId ? c.spaceId === spaceId : !c.spaceId))
				.slice(0, 10);

			return projectConversations.map(conv => {
				const title = conv.title || 'Untitled';
				const timeAgo = this.formatTimestamp(conv.timestamp);
				const singleLineLabel = `${title} • ${timeAgo}`;

				return {
					type: 'conversation' as const,
					id: conv.id,
					label: singleLineLabel,
					timestamp: conv.timestamp,
					source: conv.source,
					spaceId: conv.spaceId
				};
			});
		}

		if (element.id === 'actions') {
			// Quick actions
			return [
				{
					type: 'action',
					id: 'workbench.action.chat.open',
					label: 'Start New Conversation',
					description: 'Open chat panel'
				},
				{
					type: 'action',
					id: 'tarx.indexProject',
					label: 'Index Project Files',
					description: 'Update project context'
				}
			];
		}

		return [];
	}

	private formatTimestamp(timestamp: number): string {
		const now = Date.now();
		const diff = now - timestamp;

		if (diff < 60000) {
			return 'Just now';
		} else if (diff < 3600000) {
			const mins = Math.floor(diff / 60000);
			return `${mins}m ago`;
		} else if (diff < 86400000) {
			const hours = Math.floor(diff / 3600000);
			return `${hours}h ago`;
		} else if (diff < 604800000) {
			const days = Math.floor(diff / 86400000);
			return `${days}d ago`;
		} else {
			// Show date for items older than a week
			const date = new Date(timestamp);
			return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		}
	}

	private getIconForSource(source?: string, title?: string): vscode.ThemeIcon {
		// Check if Claude source - use hubot icon (closest to Claude's style)
		if (source) {
			const s = source.toLowerCase();
			if (s === 'claude' || s.includes('claude')) return new vscode.ThemeIcon('hubot');
		}
		if (title) {
			const t = title.toLowerCase();
			if (t.includes('claude')) return new vscode.ThemeIcon('hubot');
		}
		// Default: comment icon for TARX native chats
		return new vscode.ThemeIcon('comment');
	}
}

/**
 * Register the TARX sidebar provider with VS Code
 */
export function registerSidebarProvider(context: vscode.ExtensionContext): TarxSidebarProvider {
	console.log('[TARX] registerSidebarProvider called');
	// Set extension path for icon resolution
	extensionPath = context.extensionPath;
	const provider = new TarxSidebarProvider();

	// Register tree view
	console.log('[TARX] Creating tree view for tarx.sidebar');
	const treeView = vscode.window.createTreeView('tarx.sidebar', {
		treeDataProvider: provider,
		showCollapseAll: false
	});
	console.log('[TARX] Tree view created successfully');

	context.subscriptions.push(treeView);

	// Register start new conversation command (delegates to tarx.chat.new)
	try {
		context.subscriptions.push(
			vscode.commands.registerCommand('tarx.startNewConversation', () => {
				// Delegate to main command in extension.ts
				vscode.commands.executeCommand('tarx.chat.new');
			})
		);
	} catch (error) {
		if (error instanceof Error && error.message.includes('already exists')) {
			console.log('[TARX] Command tarx.startNewConversation already exists, skipping');
		} else {
			console.error('[TARX] Failed to register tarx.startNewConversation:', error);
		}
	}

	// Note: tarx.openConversation is registered in extension.ts with full database support

	return provider;
}
