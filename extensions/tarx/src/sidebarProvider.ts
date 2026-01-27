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

interface TarxTreeItem {
	type: 'conversation' | 'action' | 'header';
	id: string;
	label: string;
	description?: string;
	timestamp?: number;
}

export class TarxSidebarProvider implements vscode.TreeDataProvider<TarxTreeItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<TarxTreeItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private conversations: Array<{
		id: string;
		title: string;
		timestamp: number;
	}> = [];

	private connectionStatus: 'online' | 'offline' | 'connecting' | 'reconnecting' = 'connecting';

	constructor() {}

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
	setConversations(conversations: Array<{ id: string; title: string; timestamp: number }>) {
		this.conversations = conversations;
		this._onDidChangeTreeData.fire(undefined);
	}

	/**
	 * Refresh the tree view
	 */
	refresh() {
		this._onDidChangeTreeData.fire(undefined);
	}

	getTreeItem(element: TarxTreeItem): vscode.TreeItem {
		const treeItem = new vscode.TreeItem(element.label);

		if (element.type === 'header') {
			treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
			treeItem.contextValue = 'header';
		} else if (element.type === 'conversation') {
			treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;
			treeItem.description = element.description;
			treeItem.contextValue = 'conversation';
			treeItem.command = {
				command: 'tarx.openConversation',
				title: 'Open Conversation',
				arguments: [element.id]
			};
			treeItem.iconPath = new vscode.ThemeIcon('comment-discussion');
		} else if (element.type === 'action') {
			treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None;
			treeItem.contextValue = 'action';
			treeItem.command = {
				command: element.id,
				title: element.label
			};

			// Set icon based on action
			if (element.id === 'tarx.startNewConversation') {
				treeItem.iconPath = new vscode.ThemeIcon('add');
			} else if (element.id === 'workbench.action.chat.open') {
				treeItem.iconPath = new vscode.ThemeIcon('comment');
			}
		}

		return treeItem;
	}

	getChildren(element?: TarxTreeItem): TarxTreeItem[] {
		if (!element) {
			// Root level - return headers
			return [
				{ type: 'header', id: 'recent', label: 'RECENT CONVERSATIONS' },
				{ type: 'header', id: 'actions', label: "WHAT'S NEXT?" }
			];
		}

		if (element.id === 'recent') {
			// Recent conversations
			if (this.conversations.length === 0) {
				return [{
					type: 'action',
					id: 'tarx.startNewConversation',
					label: 'No conversations yet',
					description: 'Start your first conversation'
				}];
			}

			return this.conversations.slice(0, 10).map(conv => ({
				type: 'conversation' as const,
				id: conv.id,
				label: conv.title || 'Untitled',
				description: this.formatTimestamp(conv.timestamp),
				timestamp: conv.timestamp
			}));
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
		} else {
			const days = Math.floor(diff / 86400000);
			return `${days}d ago`;
		}
	}
}

/**
 * Register the TARX sidebar provider with VS Code
 */
export function registerSidebarProvider(context: vscode.ExtensionContext): TarxSidebarProvider {
	console.log('[TARX] registerSidebarProvider called');
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
	context.subscriptions.push(
		vscode.commands.registerCommand('tarx.startNewConversation', () => {
			// Delegate to main command in extension.ts
			vscode.commands.executeCommand('tarx.chat.new');
		})
	);

	// Note: tarx.openConversation is registered in extension.ts with full database support

	return provider;
}
